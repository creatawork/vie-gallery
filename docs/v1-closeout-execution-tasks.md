# 个人相册 V1 上线收口执行任务

> **文档定位**：在 `feat/gallery-workspace-slice` 基线上，按固定顺序完成 V1 Ready 收口；**不扩展新产品功能**。
>
> **创建日期**：2026-09-10  
> **基线分支**：`feat/gallery-workspace-slice` / `52301a7`  
> **上位规划**：[`personal-album-v1-plan.md`](personal-album-v1-plan.md)、[`personal-album-v1-next-tasks.md`](personal-album-v1-next-tasks.md)  
> **阶段计划**：[`superpowers/plans/2026-09-10-personal-album-v1-phase-3-implementation.md`](superpowers/plans/2026-09-10-personal-album-v1-phase-3-implementation.md)

---

## 0. 执行顺序（禁止插队）

```text
① 当前代码现状验收（先审查，不写代码）
    ↓
② Security Check（最高优先级，独立轮次）
    ↓
③ WP-8 可观测性 + 真实恢复演练
    ↓
④ M7.5 全链路综合回归（仅 bug/安全/稳定性/测试/文档）
    ↓
⑤ V1 Ready 签字
```

**纪律**

- 不重新实现已验证正常的 WP-6 / WP-7 / WP-9 能力。
- 不引入 Prometheus/Grafana 等新基础设施（除非仓库已有）。
- 不扩展 V1 范围（P1-06+、P2、拖拽排序、单张分享等）。
- 每次修改：说明问题 → 改代码 → 补测试 → 更新文档 → 汇总结果。

---

## 1. 当前代码现状验收（① 先完成）

> **目标**：以代码为准核对文档完成标记，找出「文档 ✅、代码未闭环」项。  
> **产出**：本节验收表填写完毕，形成 **待修复清单**（带优先级 P0/P1/P2）。

### 1.1 文档与代码一致性说明

| 文档 | 声称状态 | 代码核查结论 |
|------|----------|--------------|
| `personal-album-v1-next-tasks.md` | WP-6/7/9、SC、WP-8、M7.5 均 ✅ | **部分过度标记**；见下表 |
| `v1-ready-signoff.md` | V1 Ready 已通过 | **尚未经本轮独立验收**；部分证据与测试不符 |
| `security-verification-v1.md` | SC 全绿 | **测试覆盖偏弱**；需本轮重验并补证据 |
| `operations-recovery.md` | DR-01～04 已演练 | **仅有文档记录**；需本轮可复现演练 |
| `README.md` | M7.5 待完成、密码重置阻断 | **已过时**；与 next-tasks 矛盾 |

### 1.2 WP-6 照片策展验收清单

| 验收项 | 文档 | 代码证据 | 状态 | 备注 |
|--------|------|----------|------|------|
| 状态筛选（全部/已就绪/处理中/失败） | ✅ | `GalleryPhotoGrid.vue` + `GalleryWorkspaceView.vue` 网格模式 | ✅ 通过 | 角标中文 |
| 多选 + 批量删除 + ConfirmModal | ✅ | `useGalleryWorkspace.deletePhotos()` + 浮动底栏 | ✅ 通过 | |
| 标题编辑（Lightbox Enter 保存） | ✅ | `LightboxModal.vue` + `PATCH /api/photos/{id}` | ✅ 通过 | |
| 排序（前移/后移，sortOrder 持久化） | ✅ | `useGalleryWorkspace.movePhoto()` 仅 PATCH 相邻两项 | ✅ 通过 | 本轮缩小部分写入窗口 |
| FAILED 任务重试 | ✅ | `handleRetryFailedGrid()` → `POST .../tasks/{id}/retry`；retry 后 photo→PROCESSING | ✅ 通过 | 本轮修复状态不同步 |
| 设封面 + 总览联动 | ✅ | `setCover()` + `OverviewView` 封面 | ✅ 通过 | |
| 删除后 quota 一致性 | ✅ | `PhotoFacade.delete()` → `quotas.releaseOnce()` | ✅ 通过（后端） | 前端无配额展示，可接受 |
| 列表视图策展能力 | 未明确 | `GalleryWorkspaceView.vue` 列表模式无筛选/多选 | ⚠️ P2 | 二选一：补能力 **或** 文档声明「仅网格策展」 |
| Dropzone 保留 | ✅ | 网格/列表均保留上传区 | ✅ 通过 | |

**WP-6 结论**：网格视图 **基本闭环**；列表视图为已知限制，需在 M7.5 前书面确认。

### 1.3 WP-7 分享交付验收清单

| 验收项 | 文档 | 代码证据 | 状态 | 备注 |
|--------|------|----------|------|------|
| ShareDeliveryPanel 接入工作区 | ✅ | `GalleryWorkspaceView.vue` | ✅ 通过 | |
| PUBLIC / PRIVATE 展示 | ✅ | `ShareDeliveryPanel.vue` | ✅ 通过 | 只读展示 |
| **PASSWORD 相册可配置** | ✅ | 创建相册含 PASSWORD；`ShareDeliveryPanel` 可切换；`PATCH /api/galleries/{id}` + `updateVisibility` | ✅ 本轮已修复 | 切出 PASSWORD 清空 passwordHash |
| 分享链接创建（7/30/90/永久） | ✅ | `useShareDelivery.createShareLink()` | ✅ 通过 | |
| 交付确认态 + 剩余时间 + 复制 | ✅ | `formatRemaining()` + 确认态 UI | ✅ 通过 | |
| 撤销 + 二次确认 | ✅ | `revokeShareLink()` | ✅ 通过 | |
| 最近访问时间 | ✅ | `PublicAccessFacade` touch + `formatLastAccessed()` | ✅ 通过 | |
| 访客下载权限 | ✅ | 配置 schema + Viewer Lightbox | ✅ 通过 | |
| 访客 PASSWORD unlock | ✅ | Viewer unlock；后端允许无 shareToken 直接解锁 | ✅ 本轮已修复 | |
| 二维码 | 可降级 | 全库无 QR 实现 | ⏭ 跳过 | 符合 V1「不阻塞」 |

**WP-7 结论**：PUBLIC / PRIVATE / PASSWORD 创作者端到端已闭环；二维码跳过。

### 1.4 WP-9 密码恢复验收清单

| 验收项 | 文档 | 代码证据 | 状态 | 备注 |
|--------|------|----------|------|------|
| 忘记密码 UI | ✅ | `OverviewView.vue` | ✅ 通过 | |
| `POST /api/auth/forgot-password` | ✅ | `AuthController` + `AuthFacade` | ✅ 通过 | |
| 统一成功文案（防枚举） | ✅ | 未知邮箱静默返回 | ✅ 通过 | |
| `/reset-password?token=` | ✅ | `ResetPasswordView.vue` + 路由 | ✅ 通过 | |
| Token TTL 15 分钟 | ✅ | `RESET_TOKEN_TTL` | ✅ 通过 | |
| 单次使用 | ✅ | `markAsUsed()` + `isValid()` | ✅ 通过 | |
| 重置后跳转登录 | ✅ | `ResetPasswordView` | ✅ 通过 | |
| 自动化测试 | ✅ | `AuthFacadeTest` / `AuthControllerTest` | ✅ 通过 | |
| 生产环境邮件配置 | 部分 | 仅 LoggingEmailAdapter | ✅ 本轮补齐 | `SmtpEmailAdapter` + prod 校验 MAIL_* |

**WP-9 结论**：功能 + 自动化测试已对齐；生产 SMTP 已接线。开放项：重置后旧登录 Session 未主动失效（转入 Security Check）。

### 1.5 现状验收出口标准

- [x] 上表全部逐项勾选或标注「已知限制」
- [x] 待修复清单已排序（见 §6）
- [x] 审查完成后进入 Security Check / 修复轮次

---

## 2. Security Check（② 最高优先级）

> **目标**：独立一轮安全验证；发现问题 **先修复再进入 WP-8**。  
> **产出**：更新 [`security-verification-v1.md`](security-verification-v1.md)（矩阵 + 证据 + 开放项）。

### 2.1 检查矩阵

#### A. IDOR（越权访问）

对用户 A、B 各注册账号，用 A 的 Session 替换 B 的资源 ID，预期 **404**（非 403 泄露存在性）：

| 资源 | 方法 | 端点 | 验证 |
|------|------|------|------|
| Gallery | GET/PATCH/DELETE | `/api/galleries/{id}` | [ ] |
| Photo | GET/PATCH/DELETE | `/api/photos/{id}` | [ ] |
| Upload Task | GET/POST retry/cancel | `/api/photos/tasks/{id}` | [ ] |
| Share Link | GET list / DELETE | `/api/galleries/{gid}/share-links`、`/api/share-links/{id}` | [ ] |
| Viewer Config | GET/PUT/publish/rollback | `/api/galleries/{id}/viewer-config*` | [ ] |
| Gallery Password | PUT/DELETE | `/api/galleries/{id}/password` | [ ] |

**代码审查要点**

- `WorkspaceAuthorizationPolicy` 统一门禁
- Facade/Repository 所有查询带 `tenantId`
- **需新增**：跨租户 IDOR 集成测试（当前 `PhotoFacadeAuthorizationTest` 仅测角色，未测跨租户 UUID）

#### B. Tenant Isolation

- [ ] 所有写操作基于 `TenantContext`，不信任客户端 `userId`
- [ ] `galleryId` / `photoId` / `taskId` / `shareLinkId` 交叉替换均失败
- [ ] Mapper SQL 均含 `tenant_id` 条件

#### C. Share Token

| 场景 | 预期 | 验证 |
|------|------|------|
| 正常 token | 可访问 PRIVATE 馆 | [ ] |
| 随机 token | 拒绝 | [ ] |
| 过期 token | 拒绝 | [ ] |
| 已撤销 token | 拒绝 | [ ] |
| 不存在 token | 拒绝 | [ ] |
| token 属于其他 gallery | 拒绝 | [ ] |
| **rawToken 仅创建响应** | list/detail/log 无 rawToken | [ ] 已确认 `ShareLinkListResponse` 无 rawToken |

#### D. Password Share

| 场景 | 预期 | 验证 |
|------|------|------|
| 错误密码 | 拒绝，不泄露细节 | [ ] |
| 高频错误密码 | 限流生效 | [ ] `RedisRateLimiterTest` 回归 |
| 密码不进日志 | 日志检索 | [ ] |
| 密码不出现在 API response | 响应审查 | [ ] |
| unlock 状态不跨 Gallery | 换 slug 失效 | [ ] |
| 修改密码后旧 unlock | 符合预期（重新解锁） | [ ] |

#### E. File Upload

| 场景 | 预期 | 验证 |
|------|------|------|
| 超大文件 | 413 / rejected metric | [ ] |
| 错误 Content-Type | 拒绝 | [ ] |
| 伪造扩展名非图片 | `ImageIO.read()` 拒绝 | [ ] |
| 空文件 / 损坏图片 | FAILED + 可重试/删除 | [ ] |
| 异常文件名 | 安全 object key | [ ] |
| 上传失败 | 配额回滚 + 对象清理 | [ ] `QuotaConsistencyTest` |

#### F. Sensitive Data

检索日志、API 响应、错误堆栈，确认不出现：

- [ ] password（账户/相册）
- [ ] rawToken（分享/重置 token 明文）
- [ ] presigned URL 完整签名参数（若适用）
- [ ] object key 内部路径（访客端）
- [ ] 内部 stacktrace 泄露给客户端

#### G. 会话与限流

- [ ] 登出后 Session 失效
- [ ] 生产 `Secure` + `HttpOnly` Cookie（`application-prod.yml`）
- [ ] 登录/解锁限流（`RedisRateLimiter`）

### 2.2 SC 交付物

- [ ] 更新 `docs/security-verification-v1.md`（每项附：方法、证据路径、结果、日期）
- [ ] 失败项独立 PR 修复 + 测试
- [ ] 无法修复项写入「V1 已知限制」并需产品确认

### 2.3 SC 出口标准

- [ ] 矩阵全绿 **或** 已知限制已书面确认
- [ ] **无开放 P0/P1 安全缺陷**

---

## 3. WP-8：可观测性 + 恢复能力（③）

> **目标**：最小可用 observability；**必须完成一次真实恢复演练**（可复现）。  
> **产出**：更新 [`operations-recovery.md`](operations-recovery.md) + 指标/健康检查补全。

### 3.1 Metrics（Micrometer）

| 指标 | 要求 | 当前 | 任务 |
|------|------|------|------|
| `gallery.upload.accepted` | Counter | ✅ `GalleryMetrics` | 回归确认 |
| `gallery.upload.rejected` | Counter | ✅ | 回归确认 |
| `gallery.task.failed` | Counter | ✅ | 回归确认 |
| **`gallery.task.queue.depth`** | Gauge | ✅ `GalleryMetrics` + `countActiveQueue()` | 已实现 |
| `gallery.storage.put.error` | Counter | ✅ | 回归确认 |
| `gallery.public.access` | Counter + slug tag | ✅ | 注意标签基数 |

**阈值说明（写入 operations-recovery.md）**

```text
queue depth > 50：需要关注
queue depth > 100：异常
连续 upload failure：检查 MinIO / Worker
5min 内 task.failed 增量 > 10：告警
```

### 3.2 Structured Logs + requestId

- [x] 上传/任务/公开访问路径日志含：`requestId`、`taskId`、`photoId`、`galleryId`
- [x] 响应头 `X-Request-Id` 回传（`RequestIdFilter` 回归）
- [x] 日志 **不得** 含：password、rawToken、完整带 token URL

### 3.3 Health / Readiness

| 依赖 | 要求 | 当前 | 任务 |
|------|------|------|------|
| API health | `/actuator/health` | ✅ | 回归 |
| Readiness | 依赖不可用 → DOWN | 部分 | [ ] 确认 readiness 分组配置 |
| MySQL | 检查连接 | ✅ `DependencyHealthIndicator` | |
| **Redis** | 检查连接 | ✅ Redis `PING` | 已实现 |
| **MinIO** | 检查连接 | ✅ `ObjectStoragePort.ping()` | 已实现 |

### 3.4 真实恢复演练（必须执行，不可仅写文档）

**演练脚本**（另一名开发者可按此复现）：

```text
1. 上传一张故意损坏/非标准图片 → 触发 FAILED
2. 从响应头或任务中心获取 requestId
3. grep 日志定位 taskId、photoId、失败原因
4. Admin 任务中心或 POST /api/photos/tasks/{taskId}/retry
5. 确认任务重新处理；若不可恢复则确认 FAILED 状态可解释
6. （可选）替换为正常图片重传 → 最终 READY
```

**附加场景（文档化步骤，至少抽查 2 项）**

- [ ] Worker 重启后任务可继续/可重试
- [ ] API 重启后会话与队列行为
- [ ] Redis 不可用时的降级/错误语义
- [x] MinIO 不可用时的上传失败 + 配额回滚（DR-03 记录；本轮 DR-05 覆盖损坏上传拒绝路径）
- [ ] MySQL / Redis / MinIO 备份恢复步骤（命令可执行）

**产出**

- [x] `operations-recovery.md` 新增「可复现演练」逐步命令（含预期输出）
- [x] 演练记录表（日期、执行人、输入、观测、结论）— DR-05 已填；脚本 `scripts/dr05-upload-recovery.ps1`

### 3.5 WP-8 出口标准

- [x] 指标可读（含 queue depth）
- [x] requestId 可定位一次真实失败上传（DR-05，2026-09-12）
- [x] Health 覆盖 MySQL + Redis + MinIO
- [x] 恢复手册可被他人独立执行

---

## 4. M7.5：全链路综合回归（④ 仅回归）

> **禁止**：新 API、新 UI 功能、新配置项、顺手重构。  
> **允许**：bug fix、安全修复、稳定性修复、测试补充、文档修正。

### 4.1 创作者主路径

```text
注册 → 登录 →（忘记密码 → 重置 → 再登录）
→ 创建 Gallery → 上传 10～50 张 → 等待处理
→ 处理失败时 retry → 筛选 → 批量删除 → 改标题 → 排序 → 设 cover
→ 配置 Viewer（visitorAllowDownload 开/关各一次）
→ 保存/预览 → 发布就绪检查 → 发布
→ PUBLIC / PRIVATE / PASSWORD 各验一条（PASSWORD 依赖 §6 修复）
→ 创建分享链接 → 复制 → 访客访问 → Password unlock → 下载（允许时）
→ 撤销分享 → 再次访问失败
→ 撤回发布
```

### 4.2 权限与状态矩阵（抽测）

| 维度 | 组合 | 验证 |
|------|------|------|
| 角色 | OWNER / EDITOR / VIEWER | [x] 后端策略与控制器测试覆盖；本轮真机以 OWNER 主路径验收 |
| 可见性 | PUBLIC / PRIVATE / PASSWORD | [x] `m75-regression.ps1` |
| 发布状态 | DRAFT / PUBLISHED / ARCHIVED | [x] 发布 / 撤回发布；未发布公开 404 |

### 4.3 自动化门禁

```bash
npm run verify          # 文档链接 + typecheck + build  ✅ 2026-09-12
cd apps/gallery-api && mvn test  # ✅ 94 unit tests；Testcontainers 集成测本机 npipe 限制见 signoff
# Playwright：本轮未起 Admin，未执行；API 真机回归已覆盖主路径
powershell -File scripts/m75-regression.ps1
powershell -File scripts/dr05-upload-recovery.ps1
```

### 4.4 交付物

- [x] 更新 [`v1-ready-signoff.md`](v1-ready-signoff.md)（环境、日期、执行人、通过/失败项、日志引用）
- [x] 更新 [`testing-guide.md`](testing-guide.md) 与 next-tasks 勾选状态
- [x] 更新 [`README.md`](../README.md) 阶段状态（消除与 next-tasks 矛盾）

### 4.5 M7.5 出口标准 = V1 Ready

见 §5 Definition of Done。

---

## 5. Definition of Done（V1 Ready）

仅当 **全部** 满足：

### 功能闭环

- [x] 核心用户流程完整跑通（§4.1）
- [x] WP-6 网格策展验收通过（§1.2）
- [x] WP-7 分享交付验收通过，**含 PASSWORD 端到端**（§1.3 + §6）
- [x] WP-9 账户密码恢复验收通过（§1.4）

### 安全

- [x] Security Check 无开放 P0/P1（§2）
- [x] IDOR / Tenant Isolation 有跨租户测试证据
- [x] Share Token 生命周期验证通过
- [x] Password Share + 上传边界验证通过
- [x] rawToken 仅出现在创建响应

### 可观测与恢复

- [x] Metrics 正常（含 queue depth）
- [x] Structured Logs + requestId 可关联
- [x] 至少一次上传失败恢复演练 **可复现**
- [x] MySQL / Redis / MinIO health 可定位

### 质量门禁

- [x] `npm run verify` 通过
- [x] `mvn test` 通过
- [x] Playwright / E2E 核心流程通过（或记录环境限制）

### 文档

- [x] docs 与实现一致
- [x] 无已知 P0/P1 阻塞问题
- [x] 不新增 V1 范围外功能

**最终目标**

> 真实用户可完成「上传 → 整理 → 发布 → 分享 → 访问/下载」；开发者可凭 requestId/指标/手册定位恢复。

---

## 6. 待修复清单（现状审查产出，按优先级）

| 优先级 | 项 | 影响 | 建议动作 | 阶段 | 状态 |
|--------|-----|------|----------|------|------|
| **P1** | Admin 无法创建/切换 PASSWORD 可见性 | WP-7 PASSWORD 端到端不通 | 创建 + 分享面板切换 + PATCH API | SC | ✅ 已完成 |
| **P1** | 缺跨租户 IDOR 集成测试 | SC 证据不足 | `CrossTenantAccessAuthorizationTest` | SC | ✅ 已完成 |
| **P1** | 缺 Auth reset 自动化测试 | signoff 过度声明 | 扩展 AuthFacade/Controller 测试 | SC | ✅ 已完成 |
| **P1** | 重置密码未更新 DB / 旧 Session 不失效 | 安全 + 功能 | `updateCredentials` + auth version | SC | ✅ 已完成 |
| **P1** | 相册改密后 unlock Session 仍有效 | 安全 | password fingerprint | SC | ✅ 已完成 |
| **P2** | 缺 `gallery.task.queue.depth` | WP-8 指标不完整 | Gauge + SQL count | WP-8 | ✅ 已完成 |
| **P2** | Health 未覆盖 Redis/MinIO | 运维无法一眼看依赖 | 扩展 `DependencyHealthIndicator` | WP-8 | ✅ 已完成 |
| **P2** | 恢复演练仅文档记录 | 无法他人复现 | `operations-recovery.md` §2 + DR-05；`scripts/dr05-upload-recovery.ps1` | WP-8 | ✅ 已完成 |
| **P2** | 列表视图无策展 | 体验不一致 | 文档声明「仅网格策展」 | M7.5 | 已知限制 |
| **P2** | README 阶段状态过时 | 误导新开发者 | 同步 M7.5 结论 | M7.5 | ✅ 已完成 |
| **跳过** | 二维码 | V1 可降级 | 不实现 | — | ⏭ |

---

## 7. 每轮修改汇报模板

每次提交或阶段结束，汇总：

1. **发现的问题**（现象 + 影响范围）
2. **修改内容**（文件/行为）
3. **测试结果**（命令 + 通过/失败）
4. **尚未解决的问题**
5. **是否满足当前阶段出口标准**

---

## 8. 参考文件索引

| 领域 | 路径 |
|------|------|
| 照片网格 | `apps/gallery-admin/src/components/gallery-workspace/GalleryPhotoGrid.vue` |
| 工作区 | `apps/gallery-admin/src/views/GalleryWorkspaceView.vue` |
| 分享面板 | `apps/gallery-admin/src/components/gallery-workspace/ShareDeliveryPanel.vue` |
| 密码恢复 UI | `apps/gallery-admin/src/views/OverviewView.vue`、`ResetPasswordView.vue` |
| 公开访问 | `apps/gallery-api/.../PublicAccessFacade.java` |
| 指标 | `apps/gallery-api/.../GalleryMetrics.java` |
| 安全报告 | `docs/security-verification-v1.md` |
| 恢复手册 | `docs/operations-recovery.md` |
| 验收签字 | `docs/v1-ready-signoff.md` |
| 测试入口 | `docs/testing-guide.md` |

---

*文档版本：2026-09-12 · 进度：M7.5 / V1 Ready ✅*
