# VIE Gallery 运维可观测与灾难恢复手册

> **文档状态**：V1 收口 WP-8 基线（2026-09-10）  
> **适用系统**：VIE Gallery 后端 API、Admin 管理端、Viewer 访客端、MySQL 8.4、Redis 7、MinIO  
> **核心排障原则**：任何生产异常优先通过 **`requestId` → 结构化日志 → 任务/对象 ID → 数据库/存储事实** 进行定位与修复。

---

## 1. 可观测性与监控指标

### 1.1 结构化日志与 RequestId
- 系统已启用 `RequestIdFilter`，所有外部 HTTP 请求（Admin、Viewer、公开访问）均会在响应头附带 `X-Request-Id`，并在 MDC 中绑定 `requestId`。
- 关键路径日志应能关联：`requestId`、`taskId`、`photoId`、`galleryId`。
- 日志格式包含：`timestamp [thread] level logger - [requestId] message`。
- **安全红线**：日志严禁记录用户密码明文、相册访问密码、分享链接 rawToken 或完整带 token URL。

### 1.2 Prometheus / Micrometer 业务指标
系统通过 Spring Boot Actuator (`/actuator/prometheus`、`/actuator/metrics`) 暴露核心业务指标：

| 指标名称 | 类型 | 标签 | 含义与告警阈值 |
| :--- | :--- | :--- | :--- |
| `gallery.upload.accepted` | Counter | - | 已成功接收并排队处理的照片上传计数 |
| `gallery.upload.rejected` | Counter | - | 因格式/大小/尺寸超限而被拒绝的上传计数 |
| `gallery.task.failed` | Counter | - | 异步转码/生成变体失败的任务数（若 5min 增量 > 10 需告警） |
| `gallery.task.queue.depth` | Gauge | - | `QUEUED`/`PENDING`/`PROCESSING` 任务数：>50 关注；>100 异常 |
| `gallery.storage.put.error` | Counter | - | 对象存储写入异常次数（发生即告警） |
| `gallery.public.access` | Counter | `slug` | 公开相册访问总频次（用于热点相册监测；注意标签基数） |

**阈值速查**

```text
queue depth > 50：需要关注
queue depth > 100：异常，检查 Worker / MinIO / DB
连续 upload failure / storage.put.error：检查 MinIO / Worker
5min 内 task.failed 增量 > 10：告警
```

本地快速查看：

```bash
curl -s http://localhost:8088/actuator/metrics/gallery.task.queue.depth
curl -s http://localhost:8088/actuator/prometheus | findstr gallery
```

### 1.3 Health / Readiness
- 端点：`GET /actuator/health`（probes 已启用）
- `dependencyHealth` 聚合检查：
  - `database`：MySQL `SELECT 1`
  - `redis`：Redis `PING`
  - `objectStorage`：MinIO `bucketExists` / 本地存储可写探测
- 任一依赖失败时该 indicator 为 **DOWN**，可用于 readiness 判定。

```bash
curl -s http://localhost:8088/actuator/health
```

---

## 2. 可复现演练：上传失败 → requestId → retry / 恢复

> 另一名开发者应能按下列步骤独立复现。本地默认端口：API `8088`，Admin `5173`。

### 2.1 准备
1. 启动依赖与 API：`cd infra && docker compose up -d`
2. 启动 Admin：`bash start-frontend.sh` 或按 README
3. 注册/登录一个测试账号，创建相册并进入工作区

### 2.2 制造失败上传
1. 准备一张损坏文件（例如把 `.txt` 改名为 `.jpg`，或截断 JPEG）
2. 在 Admin 工作区上传该文件
3. 预期：任务进入失败态；前端任务中心展示错误与 **requestId**
4. 同时从浏览器 Network 响应头复制 `X-Request-Id`

### 2.3 用 requestId 定位
```bash
# 容器日志示例（按实际部署调整）
docker logs gallery-api 2>&1 | findstr "req_你的requestId"
# 或
grep "req_你的requestId" /var/log/gallery-api/app.log
```

预期日志中可见：`taskId`、`photoId`、`galleryId`、失败原因（如解码失败 / 存储错误）。**不得**出现密码或 rawToken。

### 2.4 恢复
**路径 A（可恢复瞬态故障）**
1. 修复 MinIO / 网络后，在任务中心点击「重试」，或：
   ```bash
   curl -X POST http://localhost:8088/api/photos/tasks/{taskId}/retry \
     -H "Cookie: VIE_SESSION=..." \
     -H "X-CSRF-TOKEN: ..."
   ```
2. 观察任务重新排队并处理；成功则照片变为 **READY**

**路径 B（不可恢复格式损坏）**
1. 确认 FAILED 原因可解释
2. 删除该照片；配额应通过 `releaseOnce` 回收
3. 重新上传合法图片 → READY

### 2.5 验收勾选
- [x] 能从 UI/响应头拿到 requestId
- [x] 日志能关联到 taskId / photoId
- [x] retry 或重传后最终 READY（或明确 FAILED）
- [x] 损坏上传拒绝可在日志中以 `gallery_upload_rejected` + `requestId` 定位（本轮用脚本验收；`task.failed` 指标需登录态访问 actuator）

自动化脚本（Windows）：`powershell -File scripts/dr05-upload-recovery.ps1`（默认 `API_BASE=http://localhost:8088`）。

---

## 3. 常见故障场景排障与恢复流程

### 场景一：用户上传照片失败或处理超时

1. **定位步骤**：按 §2 使用 requestId。
2. **恢复手段**：任务中心重试；不可逆损坏则删除后重传。

### 场景二：异步任务队列积压与 Worker 租约丢失

1. **现象**：`gallery.task.queue.depth` 升高；任务长期 `PROCESSING`。
2. **定位**：
   ```sql
   SELECT BIN_TO_UUID(id), status, worker_id, heartbeat_at, updated_at
   FROM photo_processing_task
   WHERE status IN ('QUEUED','PROCESSING')
   ORDER BY updated_at;
   ```
3. **恢复**：重启 Worker/API；等待 `recoverStale` 回收租约；必要时对 FAILED 任务 retry。

### 场景三：孤儿对象扫描与配额一致性对账

1. **原理**：上传中断或软删除后遗留未引用对象。
2. **恢复**：后台 `OrphanResourceReconciler` 扫描清理 MinIO 并幂等释放配额。

### 场景四：依赖异常语义

| 依赖 | 现象 | 预期 |
| :--- | :--- | :--- |
| Redis 不可用 | 登录限流/Session 异常；health.redis=DOWN | 修复 Redis；不绕过限流 |
| MinIO 不可用 | 上传失败；health.objectStorage=DOWN；配额回滚 | 修复后重试上传 |
| MySQL 不可用 | API 整体不可用；health.database=DOWN | 恢复 DB / 从备份还原 |

### 场景五：数据库与对象存储备份恢复

1. **MySQL**
   ```bash
   mysqldump -u root -p --single-transaction --databases vie_gallery > backup_$(date +%Y%m%d).sql
   mysql -u root -p vie_gallery < backup_20260910.sql
   ```
2. **MinIO**：`mc mirror` 将桶镜像到冷备。
3. **Redis**：Session/限流状态可丢，用户重新登录即可。

### 场景六：生产部署版本回滚

1. 前端：Nginx 指向上一版 `dist/`。
2. 后端：停新版容器，启旧版 jar；V1 DDL 向前兼容。

---

## 4. 灾难恢复与排障演练记录

| 演练编号 | 演练主题 | 执行日期 | 执行人 | 演练输入与操作 | 观测与恢复结果 | 结论 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DR-01** | `requestId` 全链路排障演练 | 2026-09-10 | creatawork / ZCode | 上传故意损坏的非标准格式文件，触发处理失败 | 响应头获取 `X-Request-Id`，在日志中精准追踪到对应 `taskId` 与解码异常堆栈 | ✅ 成功验证 |
| **DR-02** | 分享链接撤销与即时失效演练 | 2026-09-10 | creatawork / ZCode | 生成 30 天分享链接，访客访问成功；Admin 撤销该链接 | 访客端再次请求立即返回拒绝 | ✅ 成功验证 |
| **DR-03** | 数据库事务与配额回滚演练 | 2026-09-10 | creatawork / ZCode | 模拟存储故障触发上传中断 | `TenantQuota` 成功释放预占容量与计数值 | ✅ 成功验证 |
| **DR-04** | 忘记密码与令牌重置演练 | 2026-09-10 | creatawork / ZCode | 提交忘记密码，从安全日志提取单次 Token，在 `/reset-password` 重置 | 成功更新密码；旧 Token 复用被拒绝 | ✅ 成功验证 |
| **DR-05** | 可复现上传失败恢复（§2） | 2026-09-12 | creatawork / Cursor | 本机 `infra` Docker（API 8088）；`scripts/dr05-upload-recovery.ps1`：损坏 JPG → `IMAGE_DECODE_FAILED`；合法 PNG → task `SUCCEEDED`；日志关联 `requestId`/`taskId`；对 SUCCEEDED 调 retry 得 `409 TASK_STATE_CONFLICT` | `gallery_upload_rejected`/`gallery_upload_accepted`/`gallery_task_transition` 可见；health `UP` | ✅ 成功验证 |

> **说明**：DR-01～04 为既有记录。DR-05 已在本机 Docker 完成 §2 可复现演练。

---

*结论：WP-8 可观测性与 DR-05 真实演练已完成；可进入 M7.5 综合回归。*
