# 下一阶段实现指导：M7 Viewer 配置版本化、CDN 与 3D 性能优化

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)
> 当前基线：[next-slice-production-hardening.md](./next-slice-production-hardening.md)（M6.5 发布前硬化，M6 上传任务生产化已收尾）
> 阶段定位：M6.5 修复上线阻断项后，将 Viewer 从“功能可用”演进为“配置可回溯、资源可分发、体验可降级、分享可传播”的面向访客的产品面。
> 当前状态：规划阶段，M7 尚未开始。

---

## 1. 阶段目标

M3.5–M6.5 已经证明链路能跑通：公开访问、发布、协作授权、任务系统、上线阻断项修复。但访客体验和创作者配置仍有明显短板：

- Viewer 配置是“单条覆盖式”的：保存即覆盖 `configJson`，误操作无法回滚（`GalleryViewerConfig.java` 仅有 `withUpdate`）。
- 3D Viewer 一次性加载全部照片纹理，无分级、无自动降级；APM 只观测不干预（`apps/gallery-viewer/src/App.vue` `init3DEngine` 遍历全部照片）。
- SEO meta 由 JS 运行时注入（`apps/gallery-viewer/src/lib/seo.ts`），微信/部分爬虫不执行 JS，社交分享拿到的是空壳 meta。
- 照片资源全部经对象存储短期签名 URL 直出，无 CDN 缓存层；上传管线预留的 `TEXTURE` 阶段（M6 migration 的 `ck_task_stage` 已列出）在 Java 侧从未实现，前端却已在文案中宣称“正在生成 3D 纹理”。

M7 目标按四个垂直能力展开：

```text
配置版本化   创作者可安全改配置：草稿/发布分离、版本历史、一键回滚
资源分发     公开照片走 CDN，签名 URL 短 TTL + 版本化 key，缓存可失效
性能降级     纹理分级、粒子/特效自动降级、移动端自适应、WebGL 不可用回退 2D
传播可预览   SPA 外提供爬虫可读的静态社会预览（og/twitter meta 兜底）
```

产品判断标准：

> 创作者改配置前能看到“这会如何影响访客”，改错后能回滚；访客在任何设备上都能流畅、完整地看到相册，并在社交平台上分享时得到正确的预览卡片。

## 2. 现状与问题

### 2.1 Viewer 配置是覆盖式单记录

- 领域模型：`GalleryViewerConfig(id, galleryId, configJson, enabled, presetName, createdAt, updatedAt)`，`withUpdate` 直接覆盖 JSON，无历史。
- Facade：`GalleryViewerConfigFacade.saveConfig` 有则更新、无则创建——没有版本、草稿、发布状态。
- Admin 配置面板保存即生效，无“影响访客”确认，无回滚。

### 2.2 公开资源直接来自对象存储签名 URL

- 公开照片缩略图由 `PublicAccessFacade.createReadUrl` 生成短期 presigned URL，直接指向 MinIO（`PublicAccessFacade.java:157-178`，`DEFAULT_READ_URL_TTL`）。
- 无缓存层、无版本化失效机制；大流量下对象存储成为热点。

### 2.3 3D 渲染无分级与降级

- `init3DEngine` 一次性创建所有照片 Mesh 并加载全部纹理（`App.vue:141-183`），照片超过一页或高分辨率缩略图时内存/带宽压力大。
- APM 探针已报告 FPS/DrawCalls/DPR（`App.vue:568-599`），但没有自动降级策略；低端设备、高 DPR 屏没有自适应。
- 移动端触控与陀螺仪已有入门支持，但无设备能力探测（如 `DeviceMemory`/`hardwareConcurrency`）驱动的启动配置。
- `TEXTURE` 阶段缺失：M6 migration `V8__m6_upload_task_center.sql` 的 stage 列表含 `'TEXTURE'`，但 worker 只有 VALIDATE/THUMBNAIL/FINALIZE；前端文案已宣称生成 3D 纹理（`useGalleryWorkspace.ts:197`）。

### 2.4 社交预览依赖 JS 注入

- `seo.ts` 对公开相册写入 title/description/og/canonical，规则正确（非公开 noindex、token 不进 og:image），但全部是运行时 DOM 注入。微信、百度、Telegram 等多数抓取器不执行 JS，分享卡片直接退化。

## 3. 配置版本化设计

### 3.1 模型演进

保持 `gallery_viewer_config` 为“已发布有效配置”的读取视图，新增版本历史；或新增视图表 + 历史表。推荐的最小演进：

```text
gallery_viewer_config        承载 DRAFT 编辑态（当前编辑中的配置）
gallery_viewer_config_version 已发布版本历史（只追加）
  ├─ published_config_id      指向当前生效发布版
  ├─ schema_version           配置协议版本号（当前 1）
  ├─ config_json              快照
  ├─ preset_name
  ├─ created_at
  └─ created_by_user_id       谁改的（协作审计前置）
```

读取策略：

- Admin 编辑面板读写 DRAFT 行（单行，无历史）。
- 公开 `GET viewer-config` 只读当前 `published_config_id` 指向的版本快照。
- 未发布过的新相册：公开端返回缺省配置（或 404 空 body，沿用现有 `getPublicConfig` 的 Optional 语义）。

### 3.2 状态与操作

```text
DRAFT  编辑中         | PATCH 任意次数
PUBLISH 发布草稿       | POST /publish   → 追加一条 version，published_config_id 指向它
ROLLBACK 回滚到历史   | POST /rollback  → 基于 `{versionId}` 创建新发布版并切换 published_config_id
```

约束：

- 回滚不删除历史，只追加新发布快照（审计连续性）。
- 同一次发布包含 schema_version 校验：前端只允许以当前 schema_version 发布，旧 schema 拒绝并提示升级。
- `enabled` 开关保留（总开关）；发布不影响 enabled 语义。

### 3.3 API 契约（管理端）

```http
GET    /api/galleries/{galleryId}/viewer-config          # 当前 DRAFT + 已发布快照 id
PUT    /api/galleries/{galleryId}/viewer-config          # 覆盖 DRAFT（现有语义演进，带 schema_version）
POST   /api/galleries/{galleryId}/viewer-config/publish  # 发布 DRAFT → 新 version
GET    /api/galleries/{galleryId}/viewer-config/versions # 版本历史列表（page、limit）
POST   /api/galleries/{galleryId}/viewer-config/rollback # body: { versionId } → 新发布版
```

权限沿用现有能力模型：读写 `CONFIG_WRITE`，历史读取 `CONFIG_READ`。后端仍是最终判断。

### 3.4 Admin 配置面板调整

- “保存”改为“保存草稿”（Toast 文案同步）。
- 新增“发布到访客”主按钮：点击后显示差异说明（如有）并确认发布。
- 新增版本历史列表：版本号、发布时间、修改人、回滚按钮。
- 先预览后发布：保持现有 `postMessage` 实时预览基于 DRAFT，公开端不受影响，直到按下发布。

## 4. CDN 与资源分发

### 4.1 目标拓扑

```text
访客浏览器 ──> CDN 边缘（media.vie-vibe.cn 或同类域名）
               └── 回源：MinIO 私有桶（原图/缩略图/纹理）
公开 JSON（viewer-config、photos 列表）仍走 API，不经 CDN
```

- 使用独立媒体子域（避免主域 cookie 与媒体请求混淆）。
- 桶保持私有；CDN 回源使用签名请求，边缘缓存公开资源。

### 4.2 版本化 key 与失效

- 对象 key 追加内容指纹或 photoId+updatedAt 时间戳：`thumbs/{photoId}-{hashOrTime}.jpg`。
- 每次发布/替换后 key 变化 → CDN 缓存自然失效；不依赖缓存 purge。
- 签名 URL TTL 缩短（面向浏览器直读），配合 CDN 边缘长缓存：`?v=` 作为不可缓存变化时使用。

### 4.3 分级资源（衔接 M6 的 TEXTURE 阶段）

M7 真正落地 M6 预留的 `TEXTURE` 阶段，在 worker 增加：

```text
VALIDATE(10) → THUMBNAIL(35) → TEXTURE(60) → FINALIZE(80) → SUCCEEDED
```

产物分级建议：

```text
photo_thumb_medium  卡片/2D 网格，最长边 ~640px
photo_thumb_high    封面/详情，最长边 ~1600px（现缩略图语义）
photo_texture       3D 纹理，最长边 ~2048px 上限 + WebP 编码（有损配置）
```

- 纹理只在需要时生成：相册配置为 3D 模式时排队 TEXTURE；纯 2D/画廊态相册可不生成（减负）。
- 前端上传文案“正在生成 3D 纹理”随之真实落地。

### 4.4 部署硬化

- nginx/Compose 增加媒体站点配置段；本地可先用 MinIO 直连 fallback。
- 生产环境必须覆盖 `STORAGE_PUBLIC_ENDPOINT`（Compose 已有注释提醒）。
- 媒体域名与 API 域名分开，相关 cookie/安全策略在部署清单中固定。

## 5. 3D 性能与移动端降级

### 5.1 纹理与网格分级（LOD）

- 按相机距离切换纹理：远处照片用 `photo_thumb_medium`，近处用 `photo_texture`；实现为材质换图，不重建 Mesh。
- 首批只加载可见范围内照片，其余按进入视野加载（异步 `TextureLoader` 队列，低优先级）。
- 全部照片 > 阈值（如 50 张）时，3D 模式默认启用距离剔除。

### 5.2 自动降级（承接 APM 数据）

在现有 `metrics:update` 事件基础上加策略引擎：

```text
FPS < 40 持续 N 秒   → 关闭粒子 → 关闭 Bloom → 关闭雾 → 降 DPR 到 1
恢复后逐级回退      （不一次拉满，防抖动）
```

- 启动时能力探测：`DeviceMemory`、`hardwareConcurrency`、`devicePixelRatio`、是否移动端 → 决定初始特效与纹理质量。
- 保留手动 APM 开关（移到隐蔽入口或 DEV 构建，M6.5 已移出访客主 UI）。

### 5.3 WebGL 不可用回退

- `init3DEngine` 失败或 WebGL 上下文创建失败时，自动切换到 2D 网格视图，并提示“当前设备不支持 3D，已切换经典视图”。
- 2D 视图保持不变，作为永不失效的保底形态（现状已具备，补自动切换与提示即可）。

### 5.4 移动端

- 触控：单指旋转 / 双指缩放（OrbitControls 开启 touches），与现有事件不冲突。
- 悬停标签在触屏设备改为点击后短暂显示。
- 现有 768px 断点保持；补充低端 Android 设备验证（`webgui-tester` 可模拟）。

## 6. 社交分享与 SEO 兜底

### 6.1 目标

微信/Telegram/百度等不执行 JS 的抓取器，在访问 `/g/:slug` 时也应得到正确的 og/twitter meta 与图片。

### 6.2 方案（不做 SSR，做边缘 meta）

- 选项一（推荐）：爬虫/社交抓取 UA 识别（nginx `$http_user_agent` 规则或轻量 Node/Meta 服务），返回带完整 meta 的静态 HTML 壳（title/description/og:image/canonical）。
- 选项二：独立 `meta/g/:slug` 渲染端点 + 主域名跳转方案；成本略高。
- 数据来源：公开 `viewer-config` 系列 API 或一个只读 `public gallery meta` 数据（title、cover URL、photoCount），带短 TTL 缓存。
- 图片：用 `photo_thumb_high` 或封面 URL；绝不使用带 token 的 URL（seo.ts 现有防泄漏规则必须延续到新方案）。
- noindex 规则不变：非 PUBLIC / 解锁态相册的静态壳同样 noindex。

### 6.3 验收

社交调试工具（微信公众平台/Telegram/facebook og debugger）对 PUBLIC 相册能拿到标题、描述、封面；PRIVATE/PASSWORD 相册不泄漏信息且 noindex。

## 7. API 契约与共享 packages

- `gallery-contracts` 增加：`ViewerConfigVersion`、`ViewerConfigSnapshot(schemaVersion, presetName, layout, ...)`、`PublishConfigRequest`、`RollbackConfigRequest`。
- 前后端同时更新，禁止单侧漂移（沿用现有契约包纪律）。
- 公开 viewer-config 响应补齐 `schemaVersion` 字段，旧客户端兼容读取（缺省 1）。

## 8. 实施顺序

### M7.1：配置版本化

- V9 migration（config version 表 / published_config_id 字段）。
- DRAFT/发布/回滚 API + 权限与 schemaVersion 校验。
- Admin 面板：保存草稿、发布、版本历史、回滚。

### M7.2：TEXTURE 与资源分级

- Worker 增加 TEXTURE 阶段与 WebP 纹理产物。
- 缩略图分级 key 与生成策略。
- 上传文案对齐（3D 纹理真实生成）。

### M7.3：性能降级

- LOD 换图、按视野加载、距离剔除。
- FPS 自动降级策略 + 启动能力探测。
- WebGL 失败自动切 2D；移动端触控补齐。

### M7.4：CDN 与社交预览

- 媒体子域与 CDN 配置段；签名 URL/缓存策略。
- 边缘静态 meta 壳 + 抓取 UA 路由。
- 公开访问数据（title/cover/photoCount）对预览壳只读适配。

### M7.5：综合验收与回归

- Docker/CLI/浏览器 MCP 全链路验收（含移动端模拟、社交调试器检查）。
- M4（发布/SEO）、M5（授权）、M6（任务）回归。

## 9. 测试矩阵

### 配置版本化

- 空库 V1–V9 与已有数据升级；历史记录只追加不覆盖。
- DRAFT 多次保存不产生版本；发布产生新版本并切换 published id。
- 回滚后公开端立即生效；回滚本身成为一条新版本记录。
- 旧 schema_version 发布被拒；跨 tenant/VIEWER 读取与写入 403。
- Admin 保存草稿不影响公开端，直到发布。

### 资源与性能

- TEXTURE 阶段生成 WebP 纹理；纯 2D 相册不生成纹理（配置可关）。
- LOD 切换近/远纹理无闪烁（换图时序）；批量加载不阻塞主线程。
- 低端设备探测初始特效降级；FPS 低于阈值自动降级并在恢复后回退。
- WebGL 禁用时自动切 2D 且有提示。
- 移动端模拟：单指旋转、双指缩放、悬停标签行为。

### CDN 与社交预览

- 媒体子域回源与缓存失效（key 变化即失效）。
- 抓取 UA 拿到完整 meta 壳；普通浏览器仍走 SPA。
- PRIVATE/PASSWORD 静态壳 noindex、无 token 泄漏。
- 签名 URL 短 TTL、Compose 覆盖 `STORAGE_PUBLIC_ENDPOINT` 验证。

## 10. 不做

- 不引入完整 SSR 框架（仅边缘静态壳）。Vue SSR/SSG 列为远期评估。
- 不做 AI 相册、视频、多租户商业化计费。
- 不把公开端改为登录态体验（登录访客/PRIVATE 登录访问属 M8）。
- 不在本阶段做配置迁移工具链（schema 演进先以新增字段 + 兼容读取实现）。

## 11. Definition of Done

- [ ] 配置版本化闭环（草稿/发布/回滚/版本历史）实现，Admin 面板可操作。
- [ ] schema_version 校验与契约包字段同步更新，前后端一致。
- [ ] TEXTURE 阶段真实施，上传文案与服务端行为一致。
- [ ] 缩略图分级、LOD 换图与按视野加载可用；FPS 自动降级与能力探测有证据。
- [ ] WebGL 不可用自动切 2D 并提示；移动端触控行为正确。
- [ ] CDN/媒体子域配置段与失效策略落地，签名 URL 短 TTL 生效。
- [ ] 社交抓取 UA 得到完整 meta 壳；PRIVATE/PASSWORD 无泄漏且 noindex。
- [ ] M4/M5/M6 全量回归；Docker、CLI、浏览器 MCP 与测试矩阵通过。

## 12. 完成后进入的阶段

M7 完成后进入 M8（候选，按产品优先级择一启动）：

- 创作者体验：总览卡片产品事实（photoCount/updatedAt 服务端聚合、搜索筛选排序）。
- 协作增强：双 EDITOR 并发冲突可见性、角色变更后的会话即时失效审计。
- 多工作区切换与邮箱邀请（Roadmap 已列为后续，依赖 M6.5/M8 的邮箱能力）。
- 登录访客与 PRIVATE 登录访问（M6.5 方案 B 的完整实现）。
- 更完整的任务历史/审计与批量导入。
