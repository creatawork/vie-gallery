# VIE Gallery M3 实施指导文档

本文档是 `docs/reconstruction-plan.md` 与 `docs/implementation-plan.md` 中 M3 里程碑的执行规格。M3 在 M2 已完成相册/照片 CRUD、对象存储、缩略图和租户配额的基础上，交付“可安全分享、可密码访问、可在桌面和移动端浏览”的公开展示能力。

## 1. 交付目标与边界

### 1.1 交付目标

M3 完成后，用户可以：

1. 在管理端为相册创建、查看、撤销和删除分享链接，并设置过期时间。
2. 通过公开地址打开相册，看到公开状态、密码状态、过期/撤销状态和空相册状态。
3. 对密码相册完成解锁，在短期访问会话有效期内浏览照片。
4. 在桌面端使用 Three.js 照片墙，在不支持 WebGL、设备能力不足或渲染异常时自动切换到响应式照片网格。
5. 在移动端使用触摸拖拽、缩放/查看详情和返回操作；用户开启 `prefers-reduced-motion` 时不依赖动画完成交互。

### 1.2 M3 不包含

- 团队协作、租户切换、角色扩展和计费。
- 访客账号、评论、点赞、下载原图和批量导出。
- AI 标签、搜索、自定义域名和自动备份。
- 迁移工具、生产切流和完整部署演练；这些属于 M4。
- 重新设计原有视觉方向。旧项目的照片墙、布局模式、粒子和主题效果作为实现参考，M3 只完成 Vue/TypeScript viewer 中的安全接入和必要改造。

## 2. 前置条件与完成定义

### 2.1 前置条件

- M1 已提供认证上下文、统一错误结构、请求 ID、Flyway 基础迁移和租户隔离 Repository。
- M2 已提供 `gallery`、`photo`、`storage_object`、配额校验和对象存储端口；照片接口能取得缩略图元数据。
- `gallery.slug` 在系统内唯一且只允许安全 URL 字符；公开接口不接受客户端传入 `tenantId` 或 `userId`。
- 前端已具备 `gallery-admin`、`gallery-viewer` 两个 Vue 入口和 `packages/gallery-contracts` 共享类型包。

若上述任一项尚未完成，先补齐对应 M1/M2 能力，不在 M3 Controller 中绕过既有应用层直接访问数据库、OSS 或 Session。

### 2.2 M3 完成定义

- 管理端可创建并撤销分享链接；创建响应只出现一次原始 token，数据库和日志中只有 token hash。
- PUBLIC、PRIVATE、PASSWORD 三种相册状态的访问矩阵与本文档一致。
- 任何跨租户管理访问、伪造内部 ID、使用过期/撤销 token、越权照片访问都被拒绝，且不泄露资源存在性。
- 公开 API 不返回租户 ID、内部对象 ID、bucket、object key、永久 OSS URL 或管理字段。
- Three.js 初始化失败、纹理加载失败、WebGL 不可用和移动端能力不足均能落到可用网格视图。
- 后端测试、前端类型检查/构建、移动端手工验收和本地依赖健康检查通过。

## 3. 公开访问模型

### 3.1 可见性语义

M3 固定以下访问规则。相册默认保持 M1/M2 定义；如果此前没有定义默认值，统一采用 `PRIVATE`，避免新建相册意外公开。

| 相册可见性 | 访问凭据 | `/unlock` | `/photos` |
| --- | --- | --- | --- |
| `PUBLIC` | 仅 `slug` | 不需要 | 直接返回公开照片 |
| `PRIVATE` | 有效分享 token | 不需要 | 仅 token 有效时返回 |
| `PASSWORD` | 有效分享 token + 相册密码 | 必须先解锁 | 仅短期访问 Session 有效时返回 |

有效分享 token 必须同时满足：hash 匹配、未撤销、未过期、关联相册未软删除。PUBLIC 相册即使创建过分享链接，也不依赖 token 访问；撤销链接只影响该链接，不改变 PUBLIC 相册本身的公开状态。PRIVATE/PASSWORD 相册没有有效分享链接时对外表现为 404。

### 3.2 分享 URL 与 token 传递

管理端创建成功后展示一次性分享地址：

```text
https://gallery.vie-vibe.cn/g/{slug}#s={rawToken}
```

使用 URL fragment 的原因是原始 token 不会随 HTTP 请求发送，降低反向代理、服务器访问日志和 Referer 泄露风险。viewer 启动时读取 `#s`，立即用 `history.replaceState` 清理地址栏中的 token，并在后续公开 API 请求中通过 `X-Share-Token` 发送。PUBLIC 相册可以不带 fragment。

约束：

- 原始 token 只在创建响应中返回一次；刷新管理端页面不能再次取回。
- token 使用密码学安全随机源生成，长度不少于 32 字节，编码为 URL-safe Base64 或等价安全编码。
- 服务端只保存固定算法的 token hash；比较使用常量时间语义，日志、异常、审计详情均不得记录原 token。
- CORS 只允许正式 viewer 来源；禁止 `@CrossOrigin("*")`。

### 3.3 密码解锁会话

密码相册的密码 hash 使用现有强哈希方案（优先 Argon2id，若工程已统一使用 BCrypt 则沿用工程方案），禁止明文和可逆加密。

`POST /api/public/g/{slug}/unlock` 的处理顺序：

1. 解析并校验 `slug` 和可选/必需的 `X-Share-Token`。
2. 以统一 404 响应隐藏不存在、已删除、过期和撤销的 PRIVATE/PASSWORD 资源。
3. 检查相册当前为 `PASSWORD`。
4. 校验密码；失败时返回 401 或 403 的统一业务错误，并按 IP + 相册 + token 维度限流。
5. 创建短期、HttpOnly、Secure、SameSite=Lax 的公开访问 Session，Session 只保存 gallery 内部 ID、token 标识 hash/版本和过期时间，不保存密码。

公开访问 Session 与管理端登录 Session 使用不同 Cookie 名称、命名空间和失效策略。建议有效期 30 分钟，滑动续期上限 24 小时；实现时以项目统一 Session 配置为准，但必须有明确 TTL，不能永久有效。撤销分享链接、相册改为 PRIVATE 或删除相册后，公开 Session 立即失效，不能仅等待 TTL。

为防止密码相册被枚举，过期/撤销/不存在/无权限统一返回 404；密码错误只在已确认的有效分享上下文中返回密码错误，不回显相册是否存在之外的内部信息。

## 4. 后端实现

### 4.1 应用层端口与职责

在 `gallery-api-application` 增加或补全以下用例端口，Controller 只做协议转换：

- `CreateShareLink`: 校验当前租户拥有相册、生成 raw token、保存 hash、写审计，并返回一次性 raw token。
- `ListShareLinks`: 仅返回当前租户相册的脱敏链接信息（ID、状态、创建时间、过期时间、最近访问时间）；不返回 hash 或 raw token。
- `RevokeShareLink`: 以租户条件查询并原子设置 `revoked_at`。
- `DeleteShareLink`: 软删除或按 M2 约定删除，并使关联公开 Session 失效。
- `ResolvePublicGallery`: 解析 slug、可见性、分享 token 和状态，返回公开展示 DTO。
- `UnlockPublicGallery`: 验证 token、密码和限流状态，创建公开访问 Session。
- `ListPublicPhotos`: 校验公开访问上下文，按稳定排序返回缩略图展示数据。

所有用例统一经过认证/公开访问上下文解析、输入校验、Repository 租户条件、事务、审计和必要的缓存失效。公开用例不得复用管理 DTO；必须建立独立的 `PublicGalleryView`、`PublicPhotoView` 和状态枚举。

### 4.2 管理 API 契约

保持既有路径，补充以下请求/响应语义：

```text
POST   /api/galleries/{galleryId}/share-links
GET    /api/galleries/{galleryId}/share-links
DELETE /api/share-links/{shareLinkId}
```

创建请求最小字段：

```json
{
  "expiresAt": "2026-10-03T12:00:00Z"
}
```

`expiresAt` 可为空表示不设置时间过期，但仍受撤销和相册删除控制；时间必须是带时区的 ISO-8601，且不能早于当前时间。创建响应只在当次返回：

```json
{
  "id": "public-share-link-id",
  "galleryId": "gallery-id",
  "expiresAt": "2026-10-03T12:00:00Z",
  "createdAt": "2026-09-03T12:00:00Z",
  "status": "ACTIVE",
  "shareUrl": "https://gallery.vie-vibe.cn/g/example#s=...",
  "rawToken": "..."
}
```

展示层可使用 `shareUrl`，`rawToken` 仅用于兼容复制流程，不允许持久化到前端 localStorage。列表接口永远不返回 `rawToken`，已撤销或过期链接仅返回脱敏状态。

统一错误结构沿用：

```json
{
  "code": "PUBLIC_ACCESS_REQUIRED",
  "message": "This gallery requires a valid share link.",
  "requestId": "...",
  "details": {}
}
```

错误码至少包括 `GALLERY_NOT_FOUND`、`SHARE_LINK_REQUIRED`、`SHARE_LINK_INVALID`、`SHARE_LINK_EXPIRED`、`SHARE_LINK_REVOKED`、`PASSWORD_REQUIRED`、`PASSWORD_INVALID`、`PUBLIC_SESSION_EXPIRED`、`RATE_LIMITED`。对外 HTTP 状态映射固定为：资源不可见 404、未解锁 401、密码错误 403、限流 429、参数错误 400。

### 4.3 公开 API 契约

保持公开路径：

```text
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET  /api/public/g/{slug}/photos
```

`GET /api/public/g/{slug}` 返回最小状态 DTO：

```json
{
  "slug": "example",
  "title": "旅行相册",
  "visibility": "PASSWORD",
  "accessState": "PASSWORD_REQUIRED",
  "cover": {
    "url": "https://short-lived-url.example/...",
    "width": 1200,
    "height": 800
  },
  "photoCount": 42
}
```

`accessState` 只允许 `READY`、`PASSWORD_REQUIRED`、`SHARE_LINK_REQUIRED`、`EMPTY`；过期、撤销、不存在和软删除统一使用 404，不在 JSON 中区分。公开响应禁止出现 `id`、`tenantId`、`bucket`、`objectKey`、`sha256`、审计字段和管理时间字段。

`unlock` 请求：

```json
{ "password": "用户输入的密码" }
```

成功返回 `{ "unlocked": true, "expiresAt": "..." }`，并通过 Set-Cookie 写公开访问 Session。`GET /photos` 返回缩略图 URL、宽高、标题和展示排序等必要字段；签名 URL 的 TTL 不超过 15 分钟，前端在失效后通过公开 API 刷新，不保存永久 URL。

公开照片分页默认按 `sortOrder ASC, id ASC` 稳定排序。M3 首版使用 `page`、`pageSize`、`total`，最大 `pageSize` 固定为 100；超出上限时服务端截断或返回参数错误，选择一种并在契约测试中固定。推荐截断为 100，以防止公开请求放大。

### 4.4 缓存、撤销和并发

- Redis 只缓存公开状态和短期签名 URL 的可安全派生数据，缓存 key 必须包含 gallery slug、可见性版本和访问上下文，不缓存密码或 raw token。
- 修改相册可见性、密码、封面、照片排序、照片删除、分享链接撤销时清理 gallery 公开缓存。
- 撤销链接使用数据库原子更新并发布缓存失效事件；公开 Session 校验链接状态或版本，确保撤销后立即不可用。
- 分享链接创建使用事务；数据库唯一约束防止同一 token hash 重复，随机碰撞时重试生成，不重试业务失败。
- 签名 URL 生成失败时公开接口返回可识别的暂时性错误，不能把 object key 作为降级数据返回。

### 4.5 限流与审计

至少配置以下限流桶：

- 创建/撤销分享链接：按已登录用户和租户限流。
- `unlock`：按 IP、gallery slug、token hash 组合限流；密码错误增加退避。
- 公开 gallery/photos：按 IP 和路由限流，防止批量抓取和签名 URL 放大。

审计动作至少包括 `SHARE_LINK_CREATED`、`SHARE_LINK_REVOKED`、`PUBLIC_UNLOCK_SUCCEEDED`、`PUBLIC_UNLOCK_FAILED`、`PUBLIC_PHOTOS_VIEWED`。审计记录保留 request ID、操作者/访客标识（无登录用户时为空）、脱敏 IP、资源类型、资源内部 ID、结果和时间；密码、raw token、Cookie 和完整 Referer 不得写入。

## 5. viewer 前端实现

### 5.1 路由与状态机

`gallery-viewer` 提供 `/g/:slug` 路由。启动时按以下顺序执行：

1. 从 fragment 读取 `s`，调用 `replaceState` 清理 token，再把 token 放入仅内存的请求上下文。
2. 请求公开状态接口。
3. 根据 `accessState` 渲染密码页、分享链接无效页、空相册页或照片墙。
4. PASSWORD 相册解锁成功后刷新状态并加载照片；刷新页面后不依赖 localStorage，使用 HttpOnly Session 重新判定。
5. 页面卸载时释放 Three.js renderer、scene、camera、controls、纹理和事件监听器。

页面状态固定为：`loading`、`ready`、`password-required`、`share-required`、`empty`、`not-found`、`rate-limited`、`error`。状态组件不显示内部错误详情；使用 request ID 提供客服排查线索。

### 5.2 Three.js 适配边界

从旧项目迁移视觉逻辑时，允许参考 `static/js/gallery.js`、`static/js/effects/layout-modes.js`、`static/js/effects/particles.js` 和 `static/js/effects/theme.js`，但不得把旧页面的全局变量、永久 CDN URL、内联上传逻辑或管理接口带入 viewer。

viewer 内部按职责拆分：

- `public-gallery-api`：只调用公开契约，维护签名 URL 刷新和分页。
- `gallery-scene`：创建/销毁 Three.js 场景、相机、渲染器和资源。
- `layout-modes`：实现球体、螺旋、网格、银河、心形五种布局；输入为照片展示模型和容器尺寸，输出目标变换。
- `texture-loader`：缩略图优先、并发数受限、失败重试一次，失败后显示占位纹理。
- `viewer-controls`：桌面拖拽/滚轮、移动端触摸拖拽/点击详情，统一转为场景状态事件。
- `fallback-grid`：不依赖 WebGL 的响应式网格，与详情面板共享照片数据和状态。
- `photo-detail-panel`：键盘、触摸和关闭按钮可达，展示大图时再次请求短期 URL。

初始化条件：检测 `WebGLRenderingContext`、容器尺寸和基础纹理能力。运行时捕获 renderer/context lost、纹理批量失败和内存异常；销毁场景并切换网格，给用户一个可继续浏览的提示。降级不是空白页，也不能要求用户刷新才能恢复。

布局切换只改变照片目标位置和相机参数，不重新请求照片。动画使用 GSAP 或现有等价实现，但必须支持即时跳转；`prefers-reduced-motion: reduce` 下关闭粒子、自动旋转、长距离补间和镜头晃动，布局切换使用无动画或不超过 100ms 的淡化。

### 5.3 加载、性能和资源释放

- 首屏先加载封面和首批缩略图，再分批加载其余照片；默认并发不超过 6 个图片请求。
- `<img>` 网格使用 `loading="lazy"`、`decoding="async"`；Three.js 纹理使用尺寸合适的缩略图，不在照片墙初始化时加载原图。
- 纹理按可见范围维护；离开视口的对象释放纹理引用，避免打开大相册后持续增长。
- 详情面板只在用户主动查看时加载大尺寸图片，并显示加载、失败和重试状态。
- viewer 的初始 JS 与 CSS 以现有构建工具能力为准，避免把 admin 依赖打入公开包；Three.js 仅由 viewer 引入。
- 以 100、500、1000 张照片做本地基准：首屏可交互、滚动/拖拽不出现持续阻塞，移动端内存和长任务可观察；若设备探测失败，优先网格降级。

### 5.4 移动端交互

- 断点采用移动优先布局；窄屏默认网格或低复杂度照片墙，横屏和宽屏再启用完整 3D。
- `touchstart/move/end` 使用被动监听与指针事件，避免阻塞页面滚动；拖拽与点击设置最小位移阈值，防止误触打开详情。
- 详情面板使用底部抽屉或全屏面板，支持返回键/关闭按钮、焦点恢复和安全区域 padding。
- 所有交互控件提供可见焦点、可操作名称和至少 44px 触控尺寸；图片提供替代文本，装饰性粒子不进入辅助技术树。
- 横竖屏切换、浏览器地址栏收缩、网络中断和恢复都不能丢失当前公开访问上下文。

## 6. 管理端接入

管理端在相册详情页增加“分享链接”区域：列表展示状态、创建时间、过期时间、最近访问时间和复制按钮；创建成功使用一次性 raw token 生成 URL，复制失败时允许用户手动复制当前响应中的 share URL，但刷新后不再显示 token。

交互要求：

- 创建和撤销操作显示进行中状态，防止重复提交。
- 撤销前要求确认；撤销成功后立即从列表标记为 REVOKED，并清理 viewer 公开缓存。
- 401 统一回登录页；403 显示无权限；404 不区分相册不存在和不属于当前租户。
- 不把分享 token 放入 Pinia 持久化插件、localStorage、IndexedDB、埋点 payload 或错误上报。

共享类型只放请求/响应、分页、错误码和状态枚举；管理端和 viewer 各自维护页面组件、路由和状态管理，不共享管理布局。

## 7. 测试计划

### 7.1 后端单元与集成测试

- 可见性矩阵：PUBLIC 无 token 可访问；PRIVATE 必须有效 token；PASSWORD 必须 token、正确密码和有效公开 Session。
- token 安全：原始 token 只返回一次；数据库仅有 hash；日志和审计不含 raw token；错误 token、过期 token、撤销 token 均按约定处理。
- Session：成功解锁创建正确 TTL；错误密码不创建 Session；撤销链接、修改可见性和删除相册后 Session 立即失效。
- 隔离：用户 A 不能读取、修改或撤销用户 B 的 gallery/share link/photo；伪造 `tenantId`、`userId` 和内部 ID 不改变结果。
- DTO 泄露：公开响应不含内部 ID、租户、bucket、object key、永久 URL 和管理字段。
- 输入与限流：非法 slug、过期时间、超大 pageSize、空密码、重复提交和超过阈值请求均得到固定错误。
- Repository/数据库：软删除过滤、唯一约束、索引查询、并发撤销和缓存失效事件。

使用 MockMvc（或项目既有 HTTP 测试工具）覆盖 Controller 契约，使用真实 MySQL/Redis/MinIO 容器覆盖 Session、签名 URL 和迁移后的对象元数据读取。

### 7.2 前端测试

- API 状态映射测试覆盖 loading、ready、password-required、share-required、empty、not-found、rate-limited 和 error。
- fragment token 读取后地址清理；token 不进入持久化存储；请求头正确传递。
- 密码解锁成功/失败、Session 过期和网络重试。
- Three.js 正常初始化、WebGL 不可用、context lost、纹理失败和切换网格降级。
- 五种布局在照片数量为 0、1、边界数量和大批量时不产生 NaN/越界位置。
- reduced-motion 分支不启动粒子和自动旋转；键盘、触摸、详情面板和焦点恢复可用。
- 管理端分享链接创建、一次性复制、列表刷新、撤销确认和错误提示。

### 7.3 手工验收矩阵

至少验证 Chrome/Edge 桌面端、iOS Safari、Android Chrome；覆盖窄屏、横屏、弱网、图片 404、WebGL 禁用、系统减少动画、密码错误、分享链接过期和链接撤销后的已打开页面。

每个场景记录：请求 ID、浏览器/设备、公开状态、是否降级、首屏可交互时间、照片数量和错误表现。不得以“控制台无报错”作为展示成功标准，必须确认用户仍能看到照片或明确可操作的状态页。

## 8. 验收与发布步骤

1. 先在本地用 MySQL、Redis、MinIO 跑 Flyway 和后端集成测试。
2. 用测试租户创建三种可见性相册，验证管理 API、公开 API 和分享链接生命周期。
3. 在 viewer 完成桌面 3D、WebGL 降级、移动端网格和密码流程验收。
4. 执行跨租户、安全泄露、限流和软删除回归测试。
5. 执行 `mvn -DskipTests verify`、前端 `npm run build` 和 Docker Compose 健康检查；再运行完整测试套件。
6. 仅部署到与 `2wmei.top` 并行的测试/预发布入口，不在 M3 执行生产流量切换。
7. 发布后观察 404/401/403/429 比例、公开 API 延迟、签名 URL 失败率、WebGL 降级率、前端异常和对象存储流量；异常时可关闭 3D viewer 功能开关，保留网格展示。

## 9. 失败处理与回滚

- 分享链接数据库迁移或应用发布失败：停止公开功能开关，保留 M2 管理和照片能力，不删除既有数据。
- 公开 API 或 Session 异常：将 viewer 默认切换为维护/错误状态，不返回内部对象地址；恢复 Redis/数据库后重新验证。
- Three.js 发布导致高错误或高内存：通过 viewer 功能开关关闭 WebGL，继续提供响应式网格。
- 签名 URL 过期或对象缺失：展示占位和重试，不把永久 URL 写入响应；对象修复属于 M4/M2 运维流程。
- M3 不执行不可逆数据删除；撤销分享链接和软删除相册/照片均可由数据库恢复，具体回收由后续回收任务处理。

## 10. 实现顺序

按以下顺序提交，确保每一步都有可验证产物：

1. 公开访问 DTO、错误码、share link 用例端口和 Flyway 补充约束。
2. 创建/列表/撤销分享链接及 token hash、一次性返回和审计。
3. 公开 gallery 状态、照片列表、签名 URL 和访问矩阵。
4. PASSWORD 解锁、公开 Session、撤销即时失效和限流。
5. viewer 状态页、API 客户端和网格降级基础能力。
6. Three.js 场景、旧视觉模块适配、布局切换、纹理生命周期。
7. 移动端手势、详情面板、可访问性和 reduced-motion。
8. admin 分享链接 UI、契约同步、端到端回归和发布演练。

完成以上步骤并满足第 2.2 节完成定义后，M3 才算完成；迁移工具和生产切流不得以 M3“已可展示”为理由提前纳入。
