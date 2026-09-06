# 下一阶段实现指导：上传任务生产化

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)
> 当前基线：[next-slice-membership-and-authorization.md](./next-slice-membership-and-authorization.md)
> 阶段定位：M5 协作授权核心完成后，将照片处理从“短轮询的异步副作用”升级为可持久化、可恢复、可重试、可取消、可追踪的任务系统。
> 当前状态：规划阶段，M6 任务 API 和任务中心尚未实现。

---

## 1. 阶段目标

当前上传链路已经可以接收照片、写入对象存储、创建 PhotoProcessingTask，并由定时 Worker 生成缩略图。但它仍是 MVP 级实现：前端只轮询约 24 秒，刷新后找不到任务；Worker 失败直接终态；没有任务列表、重试、取消、批次关联或结构化可观测性。

M6 的目标是建立以下闭环：

```text
上传请求快速返回 202
  ↓
任务持久化进入队列
  ↓
Worker 可抢占、续租、恢复和重试
  ↓
Admin 从服务端恢复每个文件的真实状态
  ↓
失败任务有原因和下一步操作
  ↓
Viewer 仍只展示 READY 且未软删除的照片
```

产品判断标准：

> 用户不需要重新上传整批照片来处理一次暂时失败；刷新、关闭页面或短暂断网后，任务状态仍可恢复，失败原因可理解且可操作。

## 2. 当前上传链路

### 2.1 现有流程

```text
POST /api/galleries/{galleryId}/photos
  → Controller 逐文件调用 PhotoFacade.upload
  → 原图写入 ObjectStorage
  → 写入 StorageObject(UPLOADING)
  → 写入 Photo(PROCESSING)
  → 写入 PhotoProcessingTask(PENDING)
  → 返回 202 + photoId/taskId
  → Worker 每 5 秒领取一个任务
  → 生成 thumbnail
  → Photo READY / Task SUCCEEDED
```

现有关键位置：

- `apps/gallery-api/gallery-api-boot/.../PhotoController.java`
- `apps/gallery-api/gallery-api-application/.../PhotoFacade.java`
- `apps/gallery-api/gallery-api-application/.../PhotoProcessingWorker.java`
- `apps/gallery-api/gallery-api-application/.../PhotoProcessingTaskRepository.java`
- `apps/gallery-api/gallery-api-boot/.../PhotoTaskController.java`
- `apps/gallery-admin/src/composables/useGalleryWorkspace.ts`

### 2.2 当前问题

- Worker 每次只处理一个任务，吞吐固定且队列等待不可见。
- `gallery.processing.max-retries` 配置存在，但失败处理没有真正使用重试策略。
- 前端 30 次 × 800ms 轮询后只返回 timeout，无法刷新恢复。
- 单任务详情没有 gallery、filename、progress、stage、retryable 等完整信息。
- 没有任务列表、retry、cancel 或批次查询 API。
- 批量上传某一文件失败时，前面成功项可能无法从响应中恢复。
- 任务失败原因固定且没有 error code、requestId、阶段和 attempts 关联。
- Worker 的对象存储和数据库状态更新不是强事务，需要幂等和补偿策略。
- 删除/失败对象、配额释放和孤儿对象回收口径未固定。
- dev-memory 任务适配器不能作为完整任务状态机的可靠证明。

## 3. M6 状态机

### 3.1 Task 状态

```text
QUEUED
PROCESSING
SUCCEEDED
FAILED
CANCEL_REQUESTED
CANCELLED
```

Photo 展示状态保持独立：

```text
PROCESSING | READY | FAILED | DELETED
```

Task 状态不直接暴露给公开 Viewer。

### 3.2 允许迁移

```text
QUEUED -> PROCESSING -> SUCCEEDED
QUEUED -> FAILED
PROCESSING -> FAILED
FAILED -> QUEUED          retry
QUEUED -> CANCELLED       immediate cancel
PROCESSING -> CANCEL_REQUESTED -> CANCELLED
CANCEL_REQUESTED -> PROCESSING 取消竞态下任务已继续执行
```

约束：

- `SUCCEEDED`、`FAILED`、`CANCELLED` 是终态；普通 retry/cancel 不能覆盖终态。
- retry 只能作用于 FAILED，且不能超过 `maxAttempts`。
- 取消不删除已经成功的 Photo。
- 取消中的 Worker 必须在安全边界检查取消状态。
- Photo 是否在 CANCELLED 后保持 FAILED 或新增 CANCELLED 状态，必须在实现前固定；建议 M6 增加 Photo `CANCELLED`，避免长期显示 PROCESSING。

## 4. 数据迁移设计

新增实际运行目录的：

```text
apps/gallery-api/gallery-api-boot/src/main/resources/db/migration/V8__m6_upload_task_center.sql
```

不修改 V1–V7 历史 migration。

### 4.1 最小字段

在现有 `photo_processing_task` 基础上规划：

```text
gallery_id
filename
progress                 0..100
stage                    UPLOAD|VALIDATE|THUMBNAIL|TEXTURE|FINALIZE
max_attempts
next_attempt_at
last_error_code
last_error_message
last_request_id
started_at
finished_at
heartbeat_at
cancelled_at
client_batch_id
idempotency_key
```

如果现有字段已具备同等语义，优先复用而不是重复新增。`idempotency_key` 和 `client_batch_id` 需要明确唯一性和清理周期。

### 4.2 索引

至少增加：

```text
(tenant_id, gallery_id, status, created_at)
(status, next_attempt_at, created_at)
(status, locked_at)
(tenant_id, created_at)
```

如使用唯一幂等键：

```text
(tenant_id, idempotency_key)
```

### 4.3 迁移验收

- 空库 V1–V8 顺序执行成功。
- 已有 V1–V7 数据升级成功。
- 现有任务状态保持可读，历史 Photo 不被误标为 READY/FAILED。
- 重复启动不会重复创建字段、索引或数据。
- 记录任务/照片/对象数量和失败项，形成迁移报告。

## 5. Repository 与应用层

### 5.1 Repository API

扩展 `PhotoProcessingTaskRepository`，保持 tenant-aware：

```java
findById(UUID tenantId, UUID taskId)
findByGallery(UUID tenantId, UUID galleryId, TaskFilter filter, int offset, int limit)
countByGallery(UUID tenantId, UUID galleryId, TaskFilter filter)
claimNext(Instant now, String workerId)
heartbeat(UUID taskId, String workerId, Instant now)
complete(UUID taskId, String workerId, ...)
fail(UUID taskId, String workerId, TaskFailure failure)
retry(UUID tenantId, UUID taskId, Instant nextAttemptAt)
requestCancel(UUID tenantId, UUID taskId)
cancelQueued(UUID tenantId, UUID taskId)
findStaleProcessing(Instant threshold)
```

所有状态变更必须带预期旧状态、tenant/task ID 和有效 lease 条件，避免旧 Worker 覆盖新状态。

### 5.2 Worker

Worker 要求：

- 使用配置中的 `max-retries`，不硬编码终态失败。
- 使用 `next_attempt_at` 和指数退避。
- 抢占任务时生成 worker/lease 标识，处理期间 heartbeat。
- stale PROCESSING 任务可以重新进入 QUEUED。
- 区分可重试错误和不可重试错误。
- 缩略图使用确定性 key，重复执行幂等覆盖。
- 成功/失败/取消均使用条件状态更新。
- 失败时清理本次产生的临时缩略图，或交由可观测回收任务处理。
- 日志包含 taskId、photoId、galleryId、tenantId、attempt、stage、status、requestId、durationMs、errorCode。

建议错误分类：

```text
FILE_TYPE_UNSUPPORTED       不可重试
IMAGE_DECODE_FAILED         不可重试
IMAGE_DIMENSIONS_INVALID    不可重试
STORAGE_UNAVAILABLE         可重试
STORAGE_TIMEOUT             可重试
THUMBNAIL_PROCESSING_FAILED 按实现判断
DEPENDENCY_UNAVAILABLE      可重试
```

### 5.3 配额与对象一致性

实现前必须固定：

- FAILED Photo 是否继续占用配额；建议保留任务时继续占用，删除 FAILED Photo 时释放。
- retry 不重复预留配额。
- CANCELLED 未完成 Photo 是否释放原图配额；建议清理 Photo/Task/Object 并释放。
- 软删除 Photo 的原图/缩略图由回收策略异步清理。
- 对象已写入但 DB 失败时，通过幂等 key 和补偿扫描处理孤儿对象。

## 6. API 契约

### 6.1 保留上传接口

```http
POST /api/galleries/{galleryId}/photos
```

继续返回 `202 Accepted`，但扩展逐文件结果：

```json
{
  "batchId": "batch-id",
  "items": [
    {
      "filename": "a.jpg",
      "accepted": true,
      "photoId": "photo-id",
      "taskId": "task-id",
      "status": "QUEUED"
    },
    {
      "filename": "b.exe",
      "accepted": false,
      "error": {
        "code": "FILE_TYPE_UNSUPPORTED",
        "message": "不支持的图片格式"
      }
    }
  ]
}
```

一个文件失败不能覆盖同批次其他已接收文件。

### 6.2 任务列表

```http
GET /api/galleries/{galleryId}/photo-tasks?status=QUEUED,PROCESSING,FAILED&page=0&pageSize=20
```

返回：

```json
{
  "items": [
    {
      "id": "task-id",
      "galleryId": "gallery-id",
      "photoId": "photo-id",
      "filename": "a.jpg",
      "status": "PROCESSING",
      "progress": 60,
      "stage": "THUMBNAIL",
      "attempts": 1,
      "maxAttempts": 3,
      "retryable": true,
      "error": null,
      "createdAt": "...",
      "startedAt": "...",
      "updatedAt": "...",
      "finishedAt": null
    }
  ],
  "page": 0,
  "pageSize": 20,
  "total": 1,
  "summary": {
    "queued": 0,
    "processing": 1,
    "succeeded": 0,
    "failed": 0,
    "cancelled": 0
  }
}
```

任务 DTO 只面向认证管理端，不加入 Viewer public contracts。

### 6.3 任务详情

```http
GET /api/photos/tasks/{taskId}
```

扩展返回 galleryId、photoId、filename、progress、stage、attempts、maxAttempts、retryable、error 和时间字段。

### 6.4 重试

```http
POST /api/photos/tasks/{taskId}/retry
```

规则：

- 需要 `PHOTO_WRITE`。
- 仅 FAILED 可重试。
- 达到 maxAttempts 返回 409 `TASK_RETRY_EXHAUSTED`。
- 原子转为 QUEUED，清理当前错误，保留累计 attempts。
- 复用原 Photo、Object 和配额。
- 重复 retry 不创建重复任务。

### 6.5 取消

```http
POST /api/photos/tasks/{taskId}/cancel
```

规则：

- 需要 `PHOTO_WRITE`。
- QUEUED 直接 CANCELLED。
- PROCESSING 转 CANCEL_REQUESTED，由 Worker 确认。
- 已完成/已失败/已取消只能幂等返回或明确 409。
- 不能通过取消删除已 READY Photo。
- 跨 tenant taskId 统一 404/不可访问。

### 6.6 权限

- 任务读取需要 `PHOTO_READ`。
- retry/cancel 需要 `PHOTO_WRITE`。
- 所有查询和写入必须带 tenant 条件。
- VIEWER 不能读取管理任务详情或执行任务操作。
- 公开 Viewer 不知道 taskId、attempt、worker、对象 key 或内部错误。

## 7. Admin 任务中心

建议新增：

```text
apps/gallery-admin/src/composables/useUploadTasks.ts
apps/gallery-admin/src/components/gallery-workspace/UploadTaskCenter.vue
apps/gallery-admin/src/components/gallery-workspace/UploadTaskRow.vue
```

### 7.1 状态展示

每个任务显示：

- 文件名和缩略图/占位。
- 阶段和进度。
- 状态：排队中、处理中、已完成、处理失败、取消中、已取消。
- attempts/maxAttempts。
- 错误 code、用户文案和 requestId（可复制）。
- 创建、开始、完成和耗时。

### 7.2 操作

- FAILED：重试、查看详情。
- QUEUED：取消。
- PROCESSING：取消、查看详情。
- CANCEL_REQUESTED：显示取消中。
- 终态：查看详情，不显示无效操作。

### 7.3 刷新恢复

页面刷新后：

1. 认证恢复。
2. 通过 Gallery ID 请求任务列表。
3. 恢复 QUEUED/PROCESSING/CANCEL_REQUESTED 和 FAILED。
4. 只有活动任务继续轮询。
5. 服务端状态覆盖本地临时状态。
6. 断网恢复后重新请求，不把网络错误标记为任务失败。

轮询建议：

- 活动任务 1–3 秒一次。
- 无活动任务停止轮询。
- 页面隐藏时降频，重新可见时立即刷新。
- 401/403/404/409/429/5xx 分别处理。
- localStorage 只保存 batch/idempotency 辅助信息，不保存最终任务事实。

### 7.4 capability

- `PHOTO_WRITE` 才显示 retry/cancel。
- VIEWER 不显示任务中心写操作。
- 直接 API 调用仍由后端返回 403。
- 角色被降级或成员被移除后，旧页面操作必须失败并刷新认证状态。

## 8. 可观测性

### 8.1 结构化日志

每次任务状态变更记录：

```text
taskId
photoId
galleryId
tenantId
workerId
attempt
stage
fromStatus
toStatus
requestId
durationMs
errorCode
```

禁止记录密码、raw token、对象存储密钥和完整签名 URL。

### 8.2 指标

建议通过 Actuator metrics/Prometheus 或等价方式提供：

```text
gallery_upload_tasks_created_total
gallery_upload_tasks_succeeded_total
gallery_upload_tasks_failed_total
gallery_upload_tasks_retried_total
gallery_upload_tasks_cancelled_total
gallery_upload_task_queue_depth
gallery_upload_task_processing_duration
gallery_upload_task_attempts
gallery_upload_task_stale_lease_total
gallery_upload_storage_error_total
```

## 9. 测试矩阵

### 后端与数据库

- V8 从空库和已有 V1–V7 升级。
- 正常 QUEUED → PROCESSING → SUCCEEDED。
- 进度单调且不超过 100。
- 可重试/不可重试错误分类。
- retry/backoff/maxAttempts。
- retry 重复点击不生成重复任务。
- queued/processing cancel 竞态。
- 终态不可被 retry/cancel 覆盖。
- 双 Worker claim 只有一个有效 lease。
- stale lease 可恢复。
- 旧 Worker 不能覆盖新状态。
- 批量部分成功、幂等和逐文件错误。
- 失败/取消对象清理和配额口径。
- VIEWER、跨 tenant、匿名访问权限。

### Admin

- 任务列表、筛选、分页和 summary。
- 单文件状态、进度、错误详情和 retry/cancel。
- 刷新、关闭、重新登录后恢复。
- 断网和 5xx 不误判为 FAILED。
- 角色降级/成员移除后的 403 恢复。
- 390px 移动端无横向溢出。

### Viewer 回归

- PROCESSING/FAILED/CANCELLED 照片不出现在公开接口。
- READY 且未删除照片仍正确展示。
- 公开 DTO 不包含 taskId、attempts、worker、对象 key 或内部错误。
- M4 发布、Token、SEO 规则不回归。

## 10. 实施顺序

### M6.1：持久任务状态

- V8 migration。
- 任务 DTO、列表、详情。
- tenant/capability 校验。
- 条件状态更新和基础 lease。

### M6.2：失败重试与取消

- retry API。
- cancel API。
- max attempts、backoff、heartbeat、stale lease。
- 错误 code/message/requestId。

### M6.3：Admin 任务中心

- 单文件任务行。
- 状态筛选、错误详情、retry/cancel。
- 刷新恢复和活动任务轮询。
- 批量摘要与逐文件结果。

### M6.4：一致性、可观测和验收

- 结构化 Worker 日志。
- Actuator metrics。
- 故障注入、并发 Worker、对象清理和配额测试。
- Docker、CLI、浏览器 MCP 运行态验收。

## 11. 不做

- 本阶段不立即引入 Kafka、RabbitMQ 或独立消息队列。
- 不实现完整任务历史/attempt 表；先复用单 Photo 单 Task 模型。
- 不向 Viewer 公开任务数据。
- 不做 AI、CDN 产品化、SSR 或大型视觉改版。
- 不把 localStorage 当作任务最终事实。

## 12. Definition of Done

- [ ] V8 从空库和 V1–V7 数据升级成功，已有任务和 OWNER/Membership 数据无回归。
- [ ] 任务状态、进度、阶段、错误、attempts 和 lease 可持久化查询。
- [ ] 任务列表、详情、retry、cancel API 完成 tenant/capability 校验。
- [ ] retry/backoff/maxAttempts 和 stale lease 恢复可验证。
- [ ] queued/processing 取消竞态和终态保护可验证。
- [ ] Worker 成功/失败/取消时 Task、Photo、StorageObject 状态和配额符合固定策略。
- [ ] 批量上传逐文件返回结果，部分失败可恢复且幂等。
- [ ] Admin 刷新/关闭/重新登录后能从服务端恢复任务。
- [ ] Admin 显示失败原因并提供可用 retry/cancel 操作。
- [ ] VIEWER/跨 tenant/匿名无法读取或操作管理任务。
- [ ] Viewer 仍只展示 READY 且未软删除照片。
- [ ] 结构化日志、requestId 和队列/成功/失败/重试/取消指标可查询。
- [ ] Maven、Admin/Viewer build、Docker migration/health、CLI 和浏览器 MCP 验收通过。

## 13. 完成后进入的阶段

M6 完成后进入 M7：Viewer 配置协议版本化、资源加载性能、CDN、移动端降级和更完整的任务历史/审计能力。