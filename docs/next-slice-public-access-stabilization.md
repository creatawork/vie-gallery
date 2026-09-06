# 下一阶段实现指导：访客访问与公开数据一致性稳定化

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)  
> 上一阶段（归档记录）：[next-slice-gallery-workspace-implementation.md](./archive/next-slice-gallery-workspace-implementation.md)
> 阶段定位：完成 Gallery 单相册工作台之后，优先修通访客访问闭环和公开数据契约。
> 当前状态：M3.5 核心修复、单 Gallery 详情、短期签名 URL 和 Docker CLI 主流程已验证。PASSWORD 成功解锁、签名 URL 过期恢复、Token 日志审计和前端自动化测试仍待补证。
> 建议分支：从当前工作区切片分支继续开发，阶段提交保持可独立构建。

---

## 1. 阶段结论

当前项目已经完成了创作者侧的第一条主路径（代码已落地，运行态 E2E 仍需在 M3.5 验收）：

```text
登录 → /app/ → /app/galleries/:id → 上传/封面/分享/配置 → /g/:slug
```

但最后的访客链路仍存在会直接阻断产品使用的缺陷：

1. PASSWORD 相册解锁后，服务端 Session 保存的是 slug，照片请求却被转换为随机 UUID，后续访问必然被判定为 Session 过期。
2. 后端生成分享链接时使用 `#s=token`，Viewer 只读取 query 参数，Admin 又自行拼接 `?t=token`，同一条分享链接在不同入口行为不一致。
3. 公开照片接口在分页后才过滤 `READY`，导致页大小不稳定；`total` 使用当前页数量，访客无法正确判断是否还有更多照片。
4. 公开相册的照片数量可能包含处理中、失败或已删除照片，与实际可见内容不一致。
5. Viewer 对非 JSON 错误响应的解析不安全，错误文案和状态处理仍有英文硬编码，难以诊断和恢复。

因此本阶段选择一个垂直切片：

> **让 PUBLIC、PRIVATE、PASSWORD 三种相册都能够按照同一套明确规则被访问、解锁、分页和展示。**

本阶段完成后，访客可以可靠地打开公开链接、使用分享 Token、输入密码、加载准确的照片列表，并在访问失败时获得明确的下一步提示。

---

## 2. 用户流程与完成目标

### 2.1 PUBLIC 相册

```text
访问 /g/:slug
  ↓
获取相册状态：READY / EMPTY / NOT_FOUND
  ↓
加载仅包含 READY 照片的分页列表
  ↓
访客浏览照片和 3D Viewer
```

### 2.2 PRIVATE 相册

```text
访问 /g/:slug
  ↓
显示“需要分享链接”
  ↓ 携带 ?t=<rawToken> 或统一后的 token 入口再次访问
验证 token
  ↓
加载仅包含 READY 照片的分页列表
```

### 2.3 PASSWORD 相册

```text
访问 /g/:slug
  ↓
显示密码输入状态
  ↓ 输入密码
服务端验证密码并创建 gallery-scoped session
  ↓
加载照片
  ↓ session 失效时回到密码输入状态
```

### 2.4 本阶段结束时必须成立的事实

- 访问权限由后端判定，Viewer 不通过隐藏元素实现权限控制。
- Session 只能授权真实的 gallery ID，不能依赖随机 UUID 或客户端猜测。
- 分享 Token 在 Admin、后端和 Viewer 之间使用同一种 URL 约定。
- `photoCount`、分页 `total` 和实际返回照片都遵循同一条规则：只统计和返回可公开展示的 `READY` 照片。
- 访问失败、密码错误、分享链接失效、Session 过期和网络错误都能区分处理。
- 不向访客响应暴露 tenantId、passwordHash、tokenHash、内部对象存储路径或任务内部字段。

---

## 3. 当前实现基线

### 3.1 已有能力

以下能力已在当前代码中落地；自动化/运行态验收状态见本文 Definition of Done：

- `GET /api/public/g/{slug}`：返回公开相册访问状态、封面和照片数量。
- `POST /api/public/g/{slug}/unlock`：验证 PASSWORD 相册密码并创建 Session。
- `GET /api/public/g/{slug}/photos`：按 page/pageSize 获取公开照片。
- `GET /api/public/g/{slug}/viewer-config`：读取启用的 Viewer 配置。
- `POST /api/galleries/{galleryId}/share-links`：Admin 创建分享链接。
- `GET /api/galleries/{galleryId}/share-links`：Admin 查看分享链接。
- `DELETE /api/share-links/{shareLinkId}`：后端撤销能力已在 M4 接入 Admin 分享列表、状态展示和二次确认 UI。
- Viewer 已有 `loading`、`ready`、`password_prompt`、`share_required`、`empty`、`not_found`、`error` 状态机。

### 3.2 关键文件

后端：

```text
apps/gallery-api/gallery-api-boot/src/main/java/cn/vie/vibe/gallery/api/PublicGalleryController.java
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PublicAccessFacade.java
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/ShareLinkFacade.java
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PhotoRepository.java
apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/persistence/mapper/PhotoMapper.java
apps/gallery-api/gallery-api-boot/src/main/java/cn/vie/vibe/gallery/api/GlobalExceptionHandler.java
```

Viewer：

```text
apps/gallery-viewer/src/api/client.ts
apps/gallery-viewer/src/composables/useViewerState.ts
apps/gallery-viewer/src/types/api.ts
apps/gallery-viewer/src/App.vue
```

Admin 分享入口：

```text
apps/gallery-admin/src/views/GalleryWorkspaceView.vue
```

共享契约：

```text
packages/gallery-contracts/src/index.ts
```

### 3.3 已确认的实现问题

#### 问题 A：PASSWORD Session 授权对象错误

`PublicGalleryController.unlock()` 当前将 slug 写入 Session；`getPhotos()` 虽然读取了 slug，却在匹配成功后使用 `UUID.randomUUID()` 作为 `publicSessionGalleryId`。`PublicAccessFacade.validatePublicAccess()` 最终要求该 ID 等于真实 gallery ID，因此密码验证成功后无法读取照片。

修复要求：

- 解锁时查询真实 Gallery，并将真实 `gallery.id` 写入 Session；或者由 Facade 返回已验证的 gallery ID，避免 Controller 重复查询。
- 读取 Session 时校验类型、gallery ID、过期时间和当前 slug 对应的 gallery。
- Session 必须只授权当前 gallery，不能因为访问过一个 PASSWORD 相册而解锁另一个相册。
- 不把 password、raw token 或 passwordHash 写入 Session。

#### 问题 B：分享链接 URL 协议漂移

当前存在三套行为：

- `ShareLinkFacade` 生成 `.../g/{slug}#s={token}`。
- Admin 工作台自行生成 `.../g/{slug}?t={token}`。
- Viewer `PublicApiClient` 只从 `location.search` 读取 `t` 或 `token`。

本阶段统一使用：

```text
/g/:slug?t=<rawToken>
```

要求：

- 后端创建响应的 `shareUrl` 使用 query 参数。
- Admin 优先使用后端返回的 `shareUrl`，不再自行拼接协议；若开发环境需要覆盖 host，应只替换 origin，不改变 path/query。
- Viewer 继续支持 `t`，可兼容 `token`；旧 hash 链接是否兼容由测试决定，但新链接不能再生成 hash token。
- raw token 只出现在创建响应和可复制链接中；日志、列表接口和普通 Viewer 响应不得返回 raw token。

#### 问题 C：公开照片列表过滤和分页顺序错误

当前 SQL 先按全部未删除照片分页，再由 Java 过滤 `READY`。处理中或失败照片会占用分页位置，导致访客一页中照片不足，后续页也无法稳定判断。

正确顺序应为：

```text
WHERE gallery_id = ?
  AND deleted_at IS NULL
  AND status = 'READY'
ORDER BY sort_order, created_at
LIMIT ? OFFSET ?
```

同时增加与相同可见性规则一致的 count：

```text
COUNT(*)
WHERE gallery_id = ?
  AND deleted_at IS NULL
  AND status = 'READY'
```

#### 问题 D：photoCount 和分页 total 不准确

- `resolvePublicGallery()` 当前使用通用 `countByGalleryId()`，会统计非 READY 照片。
- `PublicGalleryController.getPhotos()` 当前把当前页 `items.size()` 作为 `total`。

本阶段要求：

- `photoCount` 等于当前相册可公开展示的 READY 照片总数。
- `PhotoListResponse.total` 等于查询条件下的 READY 照片总数，不是当前页数量。
- `page` 小于 0、`pageSize` 小于 1 或过大时，返回明确的 400/422 错误，不允许产生负 offset。
- 服务端将 pageSize 限制在明确上限，例如 100。

#### 问题 E：Viewer 错误解析脆弱

`PublicApiClient` 在非 2xx 响应时直接执行 `response.json()`。当反向代理、服务启动失败或网关返回 HTML/空 body 时，会抛出 JSON 解析异常，覆盖真正的 HTTP 状态。

本阶段要求：

- 封装安全的错误解析：优先 JSON，失败时根据 HTTP status 生成 ApiError。
- 保留 `code`、`message`、`requestId`、`status`。
- 对 401、403、404、409、429、5xx 形成稳定的 Viewer 状态或用户文案。
- 网络异常与服务端业务错误分开处理。

---

## 4. API 与数据契约

### 4.1 公开相册响应

保留当前 API 路径，优先修正语义而不是重命名接口：

```json
{
  "slug": "nature-space",
  "title": "自然风光摄影空间",
  "visibility": "PUBLIC",
  "accessState": "READY",
  "cover": {
    "url": "https://...",
    "width": 2400,
    "height": 1600
  },
  "photoCount": 24
}
```

`photoCount` 只统计：

```text
status = READY AND deleted_at IS NULL
```

`cover` 也必须使用同一可见性规则；无可用 READY 封面时返回 `null`。

### 4.2 解锁响应

```json
{
  "unlocked": true,
  "expiresAt": "2026-09-05T11:00:00Z"
}
```

不返回 gallery ID、Session ID、raw password 或 token。

### 4.3 公开照片列表响应

```json
{
  "items": [
    {
      "title": "山谷晨雾",
      "thumbnailUrl": "https://...",
      "width": 2400,
      "height": 1600,
      "sortOrder": 1
    }
  ],
  "page": 0,
  "pageSize": 50,
  "total": 24
}
```

约束：

- `items` 只包含 READY 照片。
- `total` 是全部 READY 照片数。
- `page` 从 0 开始，`pageSize` 在服务端限制范围内。
- 空相册返回 `items: []` 和 `total: 0`，不是 404。

### 4.4 分享 URL

统一为：

```text
https://viewer-host/g/nature-space?t=<rawToken>
```

`#s=` 不再作为新链接格式。若决定兼容旧链接，兼容逻辑只放在 Viewer URL 解析层，不改变后端 token 校验规则。

### 4.5 错误响应

继续使用现有统一结构：

```json
{
  "code": "PUBLIC_SESSION_EXPIRED",
  "message": "Gallery access session expired",
  "requestId": "...",
  "details": {}
}
```

错误码与 HTTP 状态保持兼容：

| 场景 | HTTP | code | Viewer 行为 |
| --- | ---: | --- | --- |
| 未登录/Session 不存在 | 401 | `PUBLIC_SESSION_EXPIRED` 或现有认证错误 | 回到密码输入 |
| 无效/过期分享链接 | 403 | 现有 share-link 错误码 | 显示需要有效分享链接 |
| slug 不存在 | 404 | `GALLERY_NOT_FOUND` | 显示空间不存在 |
| 密码错误 | 401 或现有业务状态 | `PASSWORD_INVALID` | 保留输入框并显示可恢复错误 |
| 请求参数非法 | 400/422 | `INVALID_PAGE` 等 | 不发起下一页请求 |
| 服务或网络故障 | 5xx/网络错误 | 现有错误结构或客户端网络错误 | 显示重试 |

不要在 Viewer 页面展示 stack trace、tenantId、tokenHash、对象存储 key 或数据库异常。

---

## 5. 实施任务分解

### Task 1：修复 PASSWORD gallery-scoped Session

文件：

```text
apps/gallery-api/gallery-api-boot/src/main/java/cn/vie/vibe/gallery/api/PublicGalleryController.java
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PublicAccessFacade.java
```

完成：

- 解锁成功后保存真实 gallery UUID，而不是 slug 或随机 UUID。
- Session 读取时校验值类型、过期时间和当前 gallery。
- 同一个 Session 访问不同 slug 时不能获得 PASSWORD 相册权限。
- Session 失效时返回现有 `PUBLIC_SESSION_EXPIRED` 语义。
- 保持现有 30 分钟有效期，除非测试证明需要更精确的绝对过期时间。

建议接口形态：

```java
UUID unlockGallery(String slug, String shareToken, String password)
```

由 Facade 返回真实 gallery ID，Controller 负责写入 Session，避免 Controller 再次复制密码校验逻辑。

验收：

- 正确密码后立即获取照片成功。
- 错误密码不创建授权 Session。
- 过期 Session 需要重新解锁。
- Gallery A 解锁后请求 Gallery B 返回拒绝。

### Task 2：统一分享 Token URL

文件：

```text
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/ShareLinkFacade.java
apps/gallery-admin/src/views/GalleryWorkspaceView.vue
apps/gallery-viewer/src/api/client.ts
```

完成：

- 新生成的链接统一为 `/g/:slug?t=<rawToken>`。
- Admin 直接消费后端返回的 `shareUrl`；如需替换开发环境 origin，只替换 origin，不重写 query。
- Viewer 读取 `t`，兼容已有 `token` 参数。
- 可选兼容旧 `#s=` 链接，但兼容只发生在 Viewer 解析层；不能继续生成 hash 链接。
- 列表接口和普通公开响应不返回 raw token。

验收：

- Admin 生成链接后直接打开 Viewer 能访问 PRIVATE 相册。
- 复制链接、刷新页面、在新窗口打开都能保留 Token。
- Token 属于其他 gallery 时不能访问当前 gallery。
- 撤销或过期链接被清晰拒绝。

### Task 3：修正 READY 过滤、计数和分页

文件：

```text
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PhotoRepository.java
apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/persistence/mapper/PhotoMapper.java
apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/persistence/MyBatisPhotoRepository.java
apps/gallery-api/gallery-api-infrastructure/src/main/java/cn/vie/vibe/gallery/infrastructure/M2MemoryAdapters.java
apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/PublicAccessFacade.java
apps/gallery-api/gallery-api-boot/src/main/java/cn/vie/vibe/gallery/api/PublicGalleryController.java
```

完成：

- 增加公开照片专用查询：只返回 `READY` 且未软删除的照片。
- 增加匹配条件的 `countPublicReadyByGalleryId`。
- 公开照片列表先在 SQL/Repository 层过滤，再执行 LIMIT/OFFSET。
- `total` 使用全量 count，不再使用当前页 `items.size()`。
- `page >= 0`、`1 <= pageSize <= 100`，非法参数返回明确 400/422。
- In-memory adapter 与 MyBatis 行为一致，避免 dev-memory 验收结果漂移。
- `photoCount`、封面回退和列表使用同一套 READY 规则。

推荐结果对象：

```java
public record PublicPhotoPage(
    List<PublicPhotoView> items,
    int page,
    int pageSize,
    int total
) {}
```

Facade 返回 Page，而不是让 Controller 自行猜测 total。

验收：

- 处理中、失败、删除照片不出现在公开列表。
- pageSize=2 时第 0 页和第 1 页稳定连续。
- total 与所有 READY 照片数量一致。
- 空相册返回 `items=[]`、`total=0`。
- 负页码、0 pageSize、超大 pageSize 被拒绝。

### Task 4：加固 Viewer API client 和状态机

文件：

```text
apps/gallery-viewer/src/api/client.ts
apps/gallery-viewer/src/composables/useViewerState.ts
apps/gallery-viewer/src/types/api.ts
```

完成：

- 抽取安全的 `parseApiError(response)`，兼容 JSON、空响应和 HTML 响应。
- `PublicApiError` 保留 `code`、`message`、`requestId`、HTTP status。
- 区分网络异常、未找到、需要分享链接、密码错误、Session 过期、限流和服务不可用。
- 将用户可见文案集中在 Viewer 状态层，默认使用中文产品文案；底层错误可保留 code 供日志诊断。
- `loadPhotos` 使用 response.total 判断是否还有下一页，不因当前页为空错误地覆盖异常状态。
- 处理 `accessState=EMPTY` 与“READY 但照片 total=0”的一致状态。
- 重试不丢失当前 slug 和可用 share token。

验收：

- API 返回 HTML/空 body 时仍显示可读错误和重试入口。
- 401/403/404/429/5xx 都不会触发未捕获 JSON 异常。
- PASSWORD Session 过期后回到密码输入，不显示空白 Viewer。

### Task 5：统一并补齐共享 contracts

文件：

```text
packages/gallery-contracts/src/index.ts
apps/gallery-viewer/src/types/api.ts
apps/gallery-admin/src/composables/useGalleryWorkspace.ts
```

完成：

- 在不改变 JSON 字段的前提下补充公开 API DTO：`PublicAccessState`、`PublicGalleryResponse`、`PublicPhoto`、`PublicPhotoPage`、`UnlockResponse`。
- 补充 `ApiError` 的可选 `requestId`/`details` 兼容定义（以实际后端响应为准）。
- Viewer 和 Admin 优先复用共享类型，避免继续新增同名漂移接口。
- 不在本阶段引入运行时 schema 依赖；若增加校验，先用小型无依赖守卫函数。

验收：

- Java Controller JSON 与 contracts 字段逐一对应。
- TypeScript strict build 通过。
- 不把内部 domain 字段加入公开 contracts。

### Task 6：补后端回归测试和最小客户端测试

后端至少覆盖：

- 正确密码解锁后能读取照片。
- 错误密码不创建 Session。
- Session 仅绑定真实 gallery ID。
- 跨 gallery、过期、撤销和无效分享链接被拒绝。
- 分享链接 URL 使用 query token。
- READY 过滤、准确 total、分页边界。
- 空相册、负页码和非法 pageSize。
- 未登录、404、业务错误的 HTTP status 和 ApiError code。

测试位置建议：

```text
apps/gallery-api/gallery-api-application/src/test/java/cn/vie/vibe/gallery/application/PublicAccessFacadeTest.java
apps/gallery-api/gallery-api-application/src/test/java/cn/vie/vibe/gallery/application/ShareLinkFacadeTest.java
apps/gallery-api/gallery-api-boot/src/test/java/cn/vie/vibe/gallery/api/PublicGalleryControllerTest.java
```

如果当前没有 Controller 测试基础设施：

1. 先补 Facade 纯单元测试和 Repository fake。
2. 再用 MockMvc 或 Spring Boot test 补 session/status 边界。
3. 不为了本阶段引入完整 E2E 平台。

Viewer 至少补：

- `PublicApiClient` 错误解析测试。
- `useViewerState` 的 PASSWORD、PRIVATE、Session 过期和空相册状态测试。

### Task 7：完成手工验收与构建

执行：

```bash
npm run build
```

后端使用项目现有 Maven 测试命令；具体命令以根目录 pom 和当前环境为准。

手工验收至少覆盖：

1. PUBLIC 相册直接访问。
2. PRIVATE 相册无 token、有效 token、无效 token、过期 token、撤销 token。
3. PASSWORD 相册正确密码、错误密码、Session 过期、跨 slug 访问。
4. 处理中/失败/删除照片不会出现在访客列表。
5. page/pageSize 和 total 连续正确。
6. Admin 生成的链接可直接复制并打开 Viewer。
7. Viewer 遇到 401/403/404/429/5xx/HTML 响应时可恢复。
8. 空相册、封面缺失、长标题和移动端布局。
9. Admin 工作台上一阶段主流程不回归。

---

## 6. API 设计边界

本阶段保留现有 URL：

```text
GET  /api/public/g/{slug}
POST /api/public/g/{slug}/unlock
GET  /api/public/g/{slug}/photos?page=0&pageSize=50
GET  /api/public/g/{slug}/viewer-config
POST /api/galleries/{galleryId}/share-links
```

不新增：

- `/api/workspaces/...` 重命名。
- 公共照片原图接口。
- 复杂发布状态机。
- 成员权限 API。
- 上传任务中心。
- 分享链接管理 UI。
- Viewer 配置编辑协议。

现有 endpoint 若需要返回准确 `total`，允许只调整响应计算，不改变字段名称和路径。

---

## 7. 安全与一致性规则

### 7.1 访问授权

- PUBLIC：无需 token/session。
- PRIVATE：每次照片请求验证当前 gallery 的有效 share token。
- PASSWORD：每次照片请求验证当前 gallery 的 Session。
- 分享 Token 必须校验 hash、所属 gallery、撤销状态和过期时间。
- Session 必须绑定真实 gallery ID 和过期时间。
- 任何 tenant 隔离仍由服务端完成，公开端不接受 tenantId 参数。

### 7.2 数据可见性

公开 API 只允许返回：

- slug、title、visibility、accessState、cover、photoCount
- 照片标题、缩略图 URL、尺寸、排序
- Viewer 必需的公开配置

禁止返回：

- tenantId
- passwordHash
- rawToken/tokenHash
- storage object key
- 上传任务锁、attempts、内部错误堆栈

### 7.3 URL 和凭证

- 新分享 URL 使用 query token。
- 不把 token 写入普通日志或错误消息。
- Viewer 不在页面文案、埋点或 console 输出 raw token。
- 如果兼容旧 hash token，解析后仍只通过 `X-Share-Token` 发给后端。

### 7.4 一致性

- `photoCount`、cover 和 photos 列表的 READY 规则必须一致。
- Controller 不自行计算跨层业务统计。
- In-memory、MyBatis 和公开 API 测试使用相同过滤语义。
- 分页顺序固定为 `sort_order, created_at`，必要时增加稳定的 ID 作为最终排序键。

---

## 8. 回滚边界与实施顺序

### 8.1 推荐提交顺序

```text
Commit 1  fix(public): bind password session to gallery
Commit 2  fix(share): standardize viewer token URL
Commit 3  fix(public): filter ready photos and return accurate pagination
Commit 4  test(public): cover access and pagination regressions
Commit 5  refactor(viewer): harden API error parsing and shared types
```

如果团队偏好单提交，可以合并为一个阶段提交，但每个提交应保持可构建。

### 8.2 允许修改的文件范围

```text
apps/gallery-api/gallery-api-application/**
apps/gallery-api/gallery-api-boot/src/main/java/cn/vie/vibe/gallery/api/PublicGalleryController.java
apps/gallery-api/gallery-api-boot/src/test/**
apps/gallery-api/gallery-api-infrastructure/**（仅公开查询和 adapter 对齐）
apps/gallery-viewer/src/api/**
apps/gallery-viewer/src/composables/useViewerState.ts
apps/gallery-viewer/src/types/**
apps/gallery-admin/src/views/GalleryWorkspaceView.vue（仅分享 URL 消费）
packages/gallery-contracts/src/index.ts
```

### 8.3 本阶段不应顺手修改

```text
apps/gallery-admin/src/views/OverviewView.vue（除非回归修复）
apps/gallery-admin/src/views/GalleryConfigPanel.vue
apps/gallery-viewer/src/core/ViewerEngine.ts
apps/gallery-viewer/src/plugins/**
db migration（除非测试证明 Session/索引必须持久化）
```

### 8.4 回滚策略

- Session 修复可以单独回滚，不影响数据库结构。
- 分享 URL 修复可通过保留 Viewer 旧格式兼容降低风险。
- READY 查询和 total 修复若出现性能问题，可回滚 SQL 实现，但不能回退到向访客暴露非 READY 照片的行为。
- contracts 扩展只增加类型，不删除已有字段。
- 不使用 `git reset --hard` 覆盖其他工作分支或用户未提交内容。

---

## 9. Definition of Done

### 访客访问

- [x] 后端 PUBLIC/PRIVATE/PASSWORD 访问判定已实现。
- [x] PASSWORD 相册 Session 绑定真实 gallery，不能跨 slug 复用。
- [x] 无效、过期、撤销分享链接由后端拒绝。
- [ ] PUBLIC、PRIVATE、PASSWORD 完整运行态链路通过 E2E。
- [ ] Session 过期后 Viewer 回到密码输入状态并完成手工验收。

### 公开数据

- [x] 公开照片只包含 `READY` 且未删除记录。
- [x] `photoCount` 与可见照片总数一致。
- [x] `PhotoListResponse.total` 是全量 total，不是当前页长度。
- [x] 分页不会因非 READY 照片占位而缺项。
- [x] 空相册返回稳定的空列表状态。
- [x] page/pageSize 参数有边界校验。

### 分享与契约

- [x] 新分享 URL 统一使用 `?t=`。
- [x] Admin、后端和 Viewer 使用同一 token 约定。
- [x] raw token 不出现在列表响应和普通错误。
- [x] contracts 覆盖公开 Gallery、Photo、分页、解锁和错误响应。
- [ ] 生产日志和部署环境完成 raw token 泄露审计。

### Viewer 稳定性

- [x] JSON、空 body、HTML 错误均能转为可读状态。
- [x] 401/403/404/429/5xx 有明确状态和恢复入口。
- [x] 重试不会丢失 slug 或有效 token。
- [x] 中文文案不暴露内部异常细节。
- [ ] 图片签名 URL 过期后完成重新加载验收。

### 回归与质量

- [ ] 后端 Facade/Controller 回归测试通过。
- [ ] Viewer API/state 测试通过，或在无前端测试框架时完成等价手工验收。
- [ ] `npm run build` 通过。
- [ ] 上一阶段 Admin 工作台路由、上传、封面、删除、分享和 Viewer 跳转不回归。
- [ ] 不引入 Tenant 重命名、权限矩阵、发布状态机或上传任务中心。

---

## 10. 后续顺序

本阶段稳定后，再按产品路线进入：

1. **M4 发布与公开隔离**：[next-slice-publishing-and-seo.md](next-slice-publishing-and-seo.md)：DRAFT/PUBLISHED/ARCHIVED、未发布数据隔离、分享撤销 UI、SEO 元数据。
2. **M5 Membership 与授权**：[next-slice-membership-and-authorization.md](next-slice-membership-and-authorization.md)：角色、成员 CRUD 和服务层能力 gating。
3. **M6 上传任务生产化**：[next-slice-upload-task-productionization.md](next-slice-upload-task-productionization.md)：任务列表、重试、取消、失败可观测、刷新恢复。
4. **空间摘要规范化**：Gallery Summary、photoCount、updatedAt、status 和真实筛选。
5. **配置协议与 Viewer 性能**：共享 schema、iframe handshake、资源 URL、配置版本/回滚、移动端性能。

M3.5 已完成核心访问稳定化，剩余 PASSWORD 成功解锁、签名 URL 过期恢复和 Token 审计作为补验收保留。M4 发布核心也已实现并进入验收收尾；下一开发切片进入 [M5 Membership 与角色授权](next-slice-membership-and-authorization.md)。产品判断标准仍然是：

> 访客能打开正确的空间，看到正确的照片；拥有正确凭证的人能继续访问，没有凭证的人得到明确且可恢复的反馈。
