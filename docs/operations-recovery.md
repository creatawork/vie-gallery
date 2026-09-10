# VIE Gallery 运维可观测与灾难恢复手册

> **文档状态**：V1 Ready 基线  
> **适用系统**：VIE Gallery 后端 API、Admin 管理端、Viewer 访客端、MySQL 8.4、Redis 7、MinIO  
> **核心排障原则**：任何生产异常优先通过 **`requestId` → 结构化日志 → 任务/对象 ID → 数据库/存储事实** 进行定位与修复。

---

## 1. 可观测性与监控指标

### 1.1 结构化日志与 RequestId
- 系统已启用 `RequestIdFilter`，所有外部 HTTP 请求（Admin、Viewer、公开访问）均会在响应头附带 `X-Request-Id`，并在 MDC 中绑定 `requestId`。
- 日志格式包含：`timestamp [thread] level logger - [requestId] message`。
- **安全红线**：日志严禁记录用户密码明文、相册访问密码、分享链接 rawToken 或完整带 token URL。

### 1.2 Prometheus / Micrometer 业务指标
系统通过 Spring Boot Actuator (`/actuator/prometheus`) 暴露核心业务指标：

| 指标名称 | 类型 | 标签 | 含义与告警阈值 |
| :--- | :--- | :--- | :--- |
| `gallery.upload.accepted` | Counter | - | 已成功接收并排队处理的照片上传计数 |
| `gallery.upload.rejected` | Counter | - | 因格式/大小/尺寸超限而被拒绝的上传计数 |
| `gallery.task.failed` | Counter | - | 异步转码/生成变体失败的任务数（若 5min 增量 > 10 需告警） |
| `gallery.storage.put.error` | Counter | - | 对象存储写入异常次数（发生即告警） |
| `gallery.public.access` | Counter | `slug` | 公开相册访问总频次（用于热点相册监测与基数统计） |

---

## 2. 常见故障场景排障与恢复流程

### 场景一：用户上传照片失败或处理超时

1. **定位步骤**：
   - 获取前端报错弹窗或任务中心中展示的 `requestId`（例如 `req_8f12a3`）。
   - 在日志中执行检索：
     ```bash
     grep "req_8f12a3" /var/log/gallery-api/app.log
     ```
   - 提取日志中的 `taskId`、`photoId` 和具体异常堆栈（如 `IMAGE_DIMENSIONS_INVALID` 或 `STORAGE_UNAVAILABLE`）。
2. **恢复手段**：
   - 若为瞬态网络或 MinIO 抖动导致的失败：在 Admin 任务中心点击「重试」，或管理员调用：
     ```bash
     curl -X POST http://localhost:8088/api/photos/tasks/{taskId}/retry \
       -H "Cookie: VIE_SESSION=..."
     ```
   - 若为不可逆格式损坏：照片状态保持 `FAILED`，用户可一键删除。

---

### 场景二：异步任务队列积压与 Worker 租约丢失

1. **现象**：任务长期处于 `PROCESSING` 状态，进度停滞。
2. **定位步骤**：
   - 检查数据库中 `photo_processing_task` 表 `updated_at` 超过 10 分钟且状态为 `PROCESSING` 的任务。
3. **恢复手段**：
   - 执行任务重置或通过 TaskStateMachine 重新触发调度。

---

### 场景三：孤儿对象扫描与配额一致性对账

1. **原理**：上传后未完成提交或软删除后遗留在私有存储中的未引用对象。
2. **恢复手段**：
   - 运行后台对账工具 `OrphanResourceReconciler`，扫描 `storage_object` 中标记软删除超过保留期的记录，清理 MinIO 底层文件并释放配额。

---

### 场景四：数据库与对象存储备份恢复

1. **MySQL 备份与恢复**：
   - **备份命令**：
     ```bash
     mysqldump -u root -p --single-transaction --databases vie_gallery > backup_$(date +%Y%m%d).sql
     ```
   - **恢复命令**：
     ```bash
     mysql -u root -p vie_gallery < backup_20260910.sql
     ```
2. **MinIO 数据备份**：
   - 通过 `mc mirror` 工具将存储桶数据备份至冷备存储。

---

### 场景五：生产部署版本回滚

1. **前端静态资源回滚**：
   - 将 Nginx 站点根目录指向上一版本 `dist/` 备份目录即可，秒级生效。
2. **后端服务回滚**：
   - 停止新版容器/进程，启动旧版 `gallery-api.jar`；
   - 数据库迁移采用向前兼容（Non-destructive）原则，V1 增量 DDL 均向下兼容。

---

## 3. 灾难恢复与排障演练记录

| 演练编号 | 演练主题 | 执行日期 | 执行人 | 演练输入与操作 | 观测与恢复结果 | 结论 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DR-01** | `requestId` 全链路排障演练 | 2026-09-10 | creatawork / ZCode | 上传故意损坏的非标准格式文件，触发处理失败 | 响应头获取 `X-Request-Id`，在日志中精准追踪到对应 `taskId` 与解码异常堆栈 | ✅ 成功验证 |
| **DR-02** | 分享链接撤销与即时失效演练 | 2026-09-10 | creatawork / ZCode | 生成 30 天分享链接，访客访问成功；Admin 撤销该链接 | 访客端再次请求立即返回 403 / `SHARE_LINK_REQUIRED` | ✅ 成功验证 |
| **DR-03** | 数据库事务与配额回滚演练 | 2026-09-10 | creatawork / ZCode | 模拟存储故障触发上传中断 | `TenantQuota` 成功释放预占容量与计数值，无脏数据残留 | ✅ 成功验证 |
| **DR-04** | 忘记密码与令牌重置演练 | 2026-09-10 | creatawork / ZCode | 提交忘记密码，从安全日志提取单次 Token，在 `/reset-password` 重置 | 成功更新密码并完成登录，旧 Token 再次使用被拒绝 | ✅ 成功验证 |

---

*结论：系统已建立完整的可观测基线与可执行的恢复手册，满足 V1 Ready 运维上线标准。*
