# 个人相册 V1 下一步实现计划

> **For agentic workers:** 按工作包顺序实施；每包合并前跑 `npm run verify` 与相关 `mvn test`，并更新 `docs/testing-guide.md` 验收条目。
>
> **Goal:** 在基线 `2358489` 之上，闭环「上传任务 → 总览摘要 → 统一发布 → CI 门禁 → 生产安全」五条主线，使个人用户无需读内部文档即可完成创建→上传→整理→预览→发布→分享。
>
> **Architecture:** 服务端提供事实字段（任务、摘要、发布就绪），Admin 只展示不猜测；发布中心聚合 Gallery 状态与 Viewer 配置版本；CI 用 Testcontainers 跑真实依赖链路；生产配置与开发默认彻底分离。
>
> **Tech Stack:** Spring Boot 17、Vue 3 + TypeScript、MySQL 8.4、Redis 7、MinIO、Testcontainers、Playwright（smoke）、GitHub Actions
>
> **基线:** `feat/gallery-workspace-slice` / `2358489`（创作者草稿预览令牌、上传即时排队、模态 Esc）
>
> **范围纪律:** 不扩展多工作区、团队邀请、AI、视频、完整 SSR；PRIVATE 仍仅分享 Token 可访问。

## Global Constraints

- 提交作者：`creatawork` / `113406486+creatawork@users.noreply.github.com`；commit message 禁止 AI trailer。
- 未发布相册对无 `preview` 令牌的访客仍 404；预览令牌 15 分钟内存，不写 canonical/分享链接。
- 任务中心最终为上传状态唯一事实来源；Dropzone 不得再独立轮询误报失败。
- 2D 永远可用；3D/WebGL 失败不得白屏（P1-06 与本计划并行，不阻塞 P1-01/02/04）。
- 每个工作包合并须含：代码、测试、用户可见错误文案、文档更新、可重复验收步骤。
- 现行文档入口：`docs/personal-album-v1-plan.md`、`docs/personal-album-v1-next-tasks.md`、`docs/testing-guide.md`。

---

## 推荐执行顺序

```text
阶段 1（体验闭环，约 1–2 周）
  WP-1  P1-01  上传任务中心统一
  WP-2  P1-02  相册总览摘要 API + UI
  WP-3  P1-04  统一发布中心（草稿预览已完成，补聚合层）

阶段 2（上线阻断，可与阶段 1 并行）
  WP-4  P0-01  Testcontainers 集成测试 + Playwright smoke
  WP-5  P0-04  生产安全与部署基线

阶段 3（依赖阶段 1/2）
  P1-03 照片策展、P1-05 分享交付、P0-05 可观测性、P1-06+ Viewer 性能
```

**依赖关系**

| 工作包 | 阻塞 | 被阻塞 |
|--------|------|--------|
| WP-1 | P0-02 ✅ | WP-3 发布前 READY 检查展示 |
| WP-2 | 无 | WP-3 待发布变更 badge |
| WP-3 | WP-2 摘要字段 | P1-05 分享交付 |
| WP-4 | 无 | M7.5 综合回归 |
| WP-5 | 生产域名/Secret 方案 | 正式上线 |

---

## WP-1：P1-01 统一上传状态与任务中心

**当前缺口（2358489 之后）**

- `useGalleryWorkspace.uploadFiles()` 仍对单文件 `pollTask()`（30×800ms），超时 toast 与任务中心矛盾。
- `rememberLocal()` 占位任务与远端 `photo-tasks` 列表未去重合并。
- `UploadTaskCenter` 接收 `summary` 但未渲染批次条；`filter` 无 UI。
- 任务 SUCCEEDED 后照片网格 / `photoCount` 不自动刷新。
- Dropzone 仍展示 `workspace.uploading` 进度条，形成第二套状态源。

### Task 1.1：契约与 API 对齐

**Files:**
- Modify: `packages/gallery-contracts/src/index.ts`
- Modify: `apps/gallery-admin/src/composables/useUploadTasks.ts`（改为从 contracts 导入类型）

**Interfaces — Produces:**
```typescript
export interface UploadTask { id: string; galleryId?: string; filename?: string; status: UploadTaskStatus; progress: number; /* 同现有 */ }
export interface UploadTaskSummary { queued: number; processing: number; succeeded: number; failed: number; cancelRequested: number; cancelled: number }
export interface UploadTaskPage { items: UploadTask[]; summary: UploadTaskSummary; total: number }
```

- [ ] 将 `UploadTask` / `UploadTaskSummary` / `UploadTaskPage` 迁入 `gallery-contracts`。
- [ ] Admin composable 删除重复 interface，改 import。
- [ ] 确认 `GET /api/galleries/{id}/photo-tasks` 响应与 contract 一致（字段名 `summary` 或扁平计数）。

**可选 API 增强（YAGNI：先做 UI 聚合，不够再加端点）**
- `GET /api/galleries/{id}/photo-tasks?batchId={uuid}` — 若批次视图需要服务端过滤。

### Task 1.2：去掉 workspace 内轮询，任务中心驱动刷新

**Files:**
- Modify: `apps/gallery-admin/src/composables/useGalleryWorkspace.ts` — `uploadFiles()`, 删除或缩短 `pollTask()`
- Modify: `apps/gallery-admin/src/views/GalleryWorkspaceView.vue` — `handleUpload()`

- [ ] `uploadFiles(files, { onQueued })`：POST 成功后只 `rememberLocal` + `tasks.load()`，不再 per-file poll。
- [ ] 删除或降级 `pollTask()`：仅保留「API 返回同步 READY」的极少数路径（若有）。
- [ ] `useUploadTasks` 在 `ACTIVE` 任务从非空→空时触发 `onIdle` 回调。
- [ ] `GalleryWorkspaceView` 注册 `onIdle` → `workspace.reload()`（刷新照片列表与 gallery 摘要）。

### Task 1.3：本地占位与远端去重

**Files:**
- Modify: `apps/gallery-admin/src/composables/useUploadTasks.ts` — `rememberLocal()`, `load()`, `mergeTasks()`

- [ ] `rememberLocal` 生成 `local:{batchId}:{index}` id，记录 `clientBatchId`（与 `UploadResponse.batchId` 对齐）。
- [ ] `load()` 合并逻辑：远端任务到达后，按 `filename + createdAt` 或 `batchId` 移除对应 `local:*` 行。
- [ ] 刷新页面后仅显示远端任务（local 行不持久化）。

### Task 1.4：任务中心 UI 闭环

**Files:**
- Modify: `apps/gallery-admin/src/components/gallery-workspace/UploadTaskCenter.vue`
- Modify: `apps/gallery-admin/src/components/gallery-workspace/GalleryUploadDropzone.vue`

- [ ] 顶部渲染 `summary` 条：`排队 n · 处理中 n · 已完成 n · 失败 n`。
- [ ] 增加 filter chips：`全部 | 进行中 | 失败 | 已完成`，绑定 `useUploadTasks.filter`。
- [ ] 取消任务：展示 `CANCEL_REQUESTED` → `CANCELLED` 过渡，终态后保留一行「已取消」。
- [ ] Dropzone：上传中仅显示「已加入队列」短文案，移除独立进度条；进度只在任务中心行内展示。
- [ ] 失败行保留 `error.message` + `requestId`（可复制）+ 重试按钮。

### Task 1.5：测试与文档

**Files:**
- Test: 手工流程见 `docs/testing-guide.md` 浏览器步骤 4
- Modify: `docs/personal-album-v1-next-tasks.md` — P1-01 标完成

**验收标准**
- [ ] 投放 3 张图：任务中心立即 3 行，无需刷新。
- [ ] 处理完成后照片网格自动出现新图，hero 计数更新。
- [ ] 刷新 / 重新登录后任务列表与照片列表一致。
- [ ] 人为断开 API 不再出现 Dropzone「上传失败」而任务中心仍排队的不一致。

---

## WP-2：P1-02 相册总览与管理摘要

**当前缺口**

- `GalleryResponse` 仅有 `id, slug, name, visibility, status, publishedAt, cover*, createdAt`。
- `OverviewView` 仅客户端 `name/slug` 搜索，无状态筛选、排序、摘要 badge。

### Task 2.1：扩展 Gallery 列表 DTO

**Files:**
- Modify: `apps/gallery-api/.../GalleryController.java` — `GalleryResponse`, `list()`
- Modify: `apps/gallery-api/.../GalleryFacade.java` 或新建 `GallerySummaryQuery`
- Modify: `packages/gallery-contracts/src/index.ts` — 新增 `GallerySummary` 或扩展 `Gallery`

**Produces — `GallerySummary` 字段（V1 最小集）:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `photoCount` | number | READY 且未软删除 |
| `failedPhotoCount` | number | FAILED 或最近失败任务关联 |
| `processingCount` | number | QUEUED/PROCESSING 任务数 |
| `updatedAt` | string | gallery.updated_at |
| `hasUnpublishedConfig` | boolean | 配置草稿 ≠ 已发布版本 |
| `storageUsedBytes` | number? | 租户配额用量（若已有查询） |

- [ ] 写 `GallerySummaryQuery` 单次 SQL/聚合，避免 N+1。
- [ ] `GET /api/galleries` 返回扩展字段；`GET /api/galleries/{id}` 同步。
- [ ] 单元测试：空馆、有失败、有处理中、有未发布配置各一例。

### Task 2.2：总览 UI

**Files:**
- Modify: `apps/gallery-admin/src/views/OverviewView.vue`

- [ ] 搜索框保留；增加状态筛选：`全部 | 草稿 | 已发布 | 已归档`。
- [ ] 排序：`最近更新`（默认）| `最近创建` | `名称`。
- [ ] 卡片 meta：`{photoCount} 张` · `{processingCount} 处理中` · `{failedPhotoCount} 失败` · 相对 `updatedAt`。
- [ ] Badge：`待发布配置`（`hasUnpublishedConfig`）、`处理中`。
- [ ] 空状态 CTA 改为「创建第一组照片」。
- [ ] 无权限 / 不存在：workspace 已有错误态；总览 catch-all 可改为简短 404 页（可选）。

### Task 2.3：契约与文档

- [ ] Admin `Gallery` 类型改用 `GallerySummary`。
- [ ] 更新 `docs/testing-guide.md` 记录与管理矩阵。

**验收标准**
- [ ] 10+ 相册时一次列表请求可筛选「有失败」或「草稿」。
- [ ] 卡片数字与进入工作区后一致。

---

## WP-3：P1-04 统一发布中心

**已完成（勿重复）:** 预览令牌、`openCreatorPreview`、配置页真预览 iframe、无令牌 404。

**当前缺口**

- Gallery `POST .../publish` 与 Viewer Config `POST .../viewer-config/publish` 两处入口，用户不知访客看到什么。
- 无发布前 READY 检查 UI；`GALLERY_NOT_READY` 仅 toast。
- 无 unpublish；版本历史只在配置页「版本」tab。

### Task 3.1：发布就绪 API

**Files:**
- Create: `apps/gallery-api/.../PublishReadinessResponse.java`（或 record 内嵌 Controller）
- Modify: `apps/gallery-api/.../GalleryController.java` — `GET /api/galleries/{id}/publish-readiness`
- Modify: `packages/gallery-contracts/src/index.ts`

**Produces — `PublishReadinessResponse`:**
```typescript
{
  galleryStatus: GalleryStatus
  readyPhotoCount: number
  galleryPublishable: boolean        // readyPhotoCount >= 1 && status !== ARCHIVED
  configDraftChanged: boolean
  publishedConfigVersionId?: string
  draftConfigVersionId?: string
  blockers: Array<{ code: string; message: string }>  // 如 NO_READY_PHOTOS, CONFIG_INVALID
}
```

- [ ] Facade 聚合：照片 READY 计数、`GalleryViewerConfigFacade` 草稿/已发布版本对比。
- [ ] 权限：`GALLERY_READ` + `PUBLISH` capability。
- [ ] 测试：`PublishReadinessFacadeTest` 覆盖空馆、仅配置变更、可发布。

### Task 3.2：发布中心 UI 组件

**Files:**
- Create: `apps/gallery-admin/src/components/gallery-workspace/PublishCenterPanel.vue`
- Modify: `apps/gallery-admin/src/views/GalleryWorkspaceView.vue` — hero 区或侧栏嵌入
- Modify: `apps/gallery-admin/src/views/GalleryConfigPanel.vue` — 链接到同一组件或共享 composable

**UI 结构（单页三块）:**

```text
┌─ 访客当前看到 ─────────────────────────┐
│ 状态：已发布 / 草稿                    │
│ 配置版本：v3 · 发布于 2026-09-08       │
│ [内部预览]  [打开公开链接]（已发布时）   │
└────────────────────────────────────────┘
┌─ 待发布变更 ───────────────────────────┐
│ · 相册尚未发布（或：配置草稿未同步）    │
│ · 0 张可展示照片（阻断发布）           │
└────────────────────────────────────────┘
┌─ 操作 ─────────────────────────────────┐
│ [发布到访客]  [撤回发布]  [配置版本历史] │
└────────────────────────────────────────┘
```

- [ ] 创建 `usePublishCenter(galleryId)` composable：`loadReadiness()`, `publishAll()`, `unpublish()`。
- [ ] `publishAll()` 顺序：若 `configDraftChanged` 先 `viewer-config/publish`，再 `galleries/publish`（或产品定单一按钮调新组合端点——优先复用现有两个 POST，避免新 API）。
- [ ] 发布成功：展示 `publishedAt` + 配置版本号 + 「访客现在可以看到」确认态。
- [ ] 撤回：`unpublish()` 仅 OWNER；确认模态 + Esc（复用 `useModalFocus`）。
- [ ] 配置页「同步到访客端」改为与发布中心同一文案体系（已发布 vs 草稿）。

### Task 3.3：发布前检查与错误

- [ ] `blockers` 非空时禁用主按钮，列表展示原因。
- [ ] 映射 `GALLERY_NOT_READY`、`CONFIG_VALIDATION_ERROR` 为用户中文文案。
- [ ] 空馆禁止发布（后端已有则前端预检一致）。

### Task 3.4：文档与验收

- [ ] 更新 `docs/personal-album-v1-next-tasks.md` P1-04 已完成项。
- [ ] `docs/testing-guide.md` 增加：发布中心 READY 检查、撤回、双版本状态。

**验收标准**
- [ ] 用户在一个面板理解「草稿 / 访客版本 / 待发布」。
- [ ] 0 张 READY 照片时无法发布且原因可见。
- [ ] 发布成功后无 preview 令牌的公开 URL 可访问（PUBLIC）。

---

## WP-4：P0-01 CI 与真实依赖测试

**当前:** `.github/workflows/quality.yml` 跑单元测试 + 前端 build；无 Testcontainers / Playwright。

### Task 4.1：Testcontainers 基础

**Files:**
- Create: `apps/gallery-api/gallery-api-boot/src/test/java/.../AbstractIntegrationTest.java`
- Modify: `apps/gallery-api/pom.xml` — testcontainers BOM + mysql/redis + minio（或 testcontainers localstack/minio module）
- Modify: `.github/workflows/quality.yml` — 新 job `integration`

- [ ] `@SpringBootTest` + `@DynamicPropertySource` 注入容器端口。
- [ ] 每个测试类 `@Testcontainers` 共享容器（JUnit 5 扩展或 static 容器）。
- [ ] Flyway 从空库 migrate；至少一个测试验证 V11/V12 迁移可应用。

### Task 4.2：核心链路集成测试

**Files:**
- Create: `GalleryLifecycleIntegrationTest.java`

**场景（单测试类多 `@Test`）:**
1. 注册 → 登录（Session cookie）
2. 创建 DRAFT gallery
3. 上传照片 → 等待任务 SUCCEEDED（或 mock worker 若 CI 无 ImageMagick）
4. `publish-readiness` → `publish`
5. 公开 `GET /api/public/g/{slug}` 200
6. 创建 PRIVATE share link → 带 `?t=` 访问 200
7. 登出 → 公开仍 200（PUBLIC）

- [ ] 权限矩阵：`VIEWER` 不能 `POST publish`（403）。
- [ ] 预览令牌：`DRAFT` + `?preview=` 200，无 token 404。

### Task 4.3：Playwright smoke

**Files:**
- Create: `apps/gallery-admin/playwright.config.ts`
- Create: `apps/gallery-admin/e2e/smoke.spec.ts`
- Modify: `.github/workflows/quality.yml` — 启动 compose 或 testcontainers 后跑 e2e

**Smoke 路径（≤3 分钟）:**
1. 登录页 → 注册/登录
2. 创建相册 → 进入工作区
3. 上传 1 张 fixture 图 → 任务中心出现完成
4. 点击预览 → URL 含 `preview=`

- [ ] 失败上传 screenshot + trace 为 artifact。
- [ ] CI 仅在 `main` 与 `feat/*` PR 运行（控制成本）。

### Task 4.4：统一 verify 命令

- [ ] `package.json` 的 `verify` 文档说明：本地全量 = `verify` + `mvn test` + 可选 integration profile。
- [ ] 或新增 `npm run verify:full` 调用 integration。

**验收标准**
- [ ] 干净 clone + CI 绿，不依赖开发者本地 MySQL。
- [ ] 集成测试失败打印 endpoint + status + body code。

---

## WP-5：P0-04 生产安全与部署基线

### Task 5.1：配置分环境

**Files:**
- Create: `apps/gallery-api/.../application-prod.yml`
- Modify: `apps/gallery-api/.../application.yml` — 默认值标注 `local-only`
- Create: `apps/gallery-api/.../ProductionConfigValidator.java` — 启动时拒绝弱口令

- [ ] `SESSION_COOKIE_SECURE=true`（prod profile）。
- [ ] `spring.datasource.*`、`redis`、`minio`、`mail` 全部来自 env，无默认密码。
- [ ] Actuator：prod 仅 `health`（readiness）对外；`metrics` 内网。

### Task 5.2：健康检查

**Files:**
- Create: `MysqlHealthIndicator`, `RedisHealthIndicator`, `MinioHealthIndicator`（或组合 `DependencyHealthIndicator`）

- [ ] `readiness` 任依赖失败 → HTTP 503。
- [ ] `liveness` 仅进程存活。

### Task 5.3：Nginx 与镜像

**Files:**
- Modify: `infra/nginx.conf`
- Create: `infra/Dockerfile.api`, `infra/Dockerfile.admin`（multi-stage）
- Create: `infra/docker-compose.prod.yml` — digest 固定镜像 tag

- [ ] `client_max_body_size` 对齐上传限制。
- [ ] `proxy_read_timeout` / `send_timeout`。
- [ ] Headers: `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, 基础 `CSP`。
- [ ] `X-Forwarded-For` 仅信任 Nginx 注入；Spring `server.forward-headers-strategy=framework`。

### Task 5.4：Viewer postMessage 加固

**Files:**
- Modify: `apps/gallery-viewer/src/App.vue`
- Modify: `apps/gallery-admin/src/views/GalleryConfigPanel.vue` — postMessage target origin

- [ ] Admin 嵌入 iframe 时计算 `viewerOrigin()`（已有 `preview.ts`）。
- [ ] Viewer `message` 监听校验 `event.origin` 与 `event.source === parent`。
- [ ] 消息 schema：`{ type: 'VIE_CONFIG_UPDATE', payload: ... }`，非法丢弃。

**验收标准**
- [ ] `SPRING_PROFILES_ACTIVE=prod` + 默认密码 → 启动失败。
- [ ] 停止 MySQL → `/actuator/health/readiness` 503。
- [ ] 伪造 `X-Forwarded-For` 不绕过限流（集成测试或手工）。

---

## 横切：每包合并检查单

1. `packages/gallery-contracts` 与 API DTO 同步。
2. `npm run check:docs` + `npm run verify` + 相关 `mvn test` 绿。
3. `docs/testing-guide.md` 与 `docs/personal-album-v1-next-tasks.md` 状态更新。
4. 用户可见文案中文、可恢复、含 requestId（错误时）。
5. 不提交 `.impeccable/`、截图临时文件。

---

## 暂缓（本计划不实施）

| 项 | 原因 |
|----|------|
| P1-03 批量策展 / 拖拽排序 | 依赖 WP-2，排在发布中心之后 |
| P1-05 二维码 / 下载开关 | 依赖 WP-3 |
| P1-06~08 Viewer 性能 | M7.3 独立里程碑 |
| P2 社交 Meta / CDN | 不阻塞本地主流程 |
| 预览令牌 Redis 持久化 | 内存令牌已够用；多实例上线时再改 |

---

## 参考文件索引

| 领域 | 路径 |
|------|------|
| 任务 composable | `apps/gallery-admin/src/composables/useUploadTasks.ts` |
| 工作区上传 | `apps/gallery-admin/src/composables/useGalleryWorkspace.ts` |
| 任务中心 UI | `apps/gallery-admin/src/components/gallery-workspace/UploadTaskCenter.vue` |
| 总览 | `apps/gallery-admin/src/views/OverviewView.vue` |
| 配置/发布 | `apps/gallery-admin/src/views/GalleryConfigPanel.vue` |
| 预览令牌 | `apps/gallery-admin/src/lib/preview.ts`, `CreatorPreviewTokens.java` |
| Gallery API | `apps/gallery-api/.../GalleryController.java` |
| 公开访问 | `apps/gallery-api/.../PublicAccessFacade.java` |
| 契约 | `packages/gallery-contracts/src/index.ts` |
| CI | `.github/workflows/quality.yml` |
| 任务清单 | `docs/personal-album-v1-next-tasks.md` |

---

*文档版本：2026-09-10 · 对应基线 2358489*
