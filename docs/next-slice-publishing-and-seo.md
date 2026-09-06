# 下一阶段实现指导：发布状态、公开隔离与 SEO

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)
> 当前基线：[next-slice-public-access-stabilization.md](./next-slice-public-access-stabilization.md)
> 阶段定位：M3.5 公开访问稳定化完成后，建立“可访问”和“已发布”分离的 M4 发布切片。
> 当前状态：核心代码、后端测试、Flyway V6、Docker/API 发布撤回和 Viewer SEO 已验证；少量运行态与浏览器证据仍待补。
> 建议分支：从当前 M3.5 完成分支继续开发，按垂直切片提交，每个提交保持可构建、可回滚。

---

## 1. 阶段目标

当前系统已经可以通过 Gallery visibility 和分享凭证控制访问，但还没有独立的 Gallery 发布状态。`PUBLIC` 目前容易被误解为“已经发布”，工作区中的半成品可能因此直接暴露给访客。

M4 的目标是建立以下稳定事实：

```text
Gallery.status = DRAFT | PUBLISHED | ARCHIVED
Gallery.visibility = PUBLIC | PRIVATE | PASSWORD
Photo.status = PROCESSING | READY | FAILED
```

公开访问必须同时满足：

```text
Gallery.status == PUBLISHED
AND Gallery 未删除
AND 访问凭证满足 visibility 规则
```

照片列表继续只返回：

```text
Photo.status == READY
AND Photo.deleted_at IS NULL
```

本阶段不重做工作区、不引入完整 Membership、不建设上传任务中心；重点是让创作者能明确发布、撤回发布，并让访客永远看不到未发布内容。

## 2. 当前基线与约束

### 已有能力

- `/app/` Gallery 总览和 `/app/galleries/:id` 工作区。
- Gallery visibility：`PUBLIC`、`PRIVATE`、`PASSWORD`。
- 公开端 `/g/:slug`、`/unlock`、照片分页和 Viewer 配置接口。
- 分享链接创建、查询、撤销和 Admin 管理 UI。
- `DRAFT/PUBLISHED/ARCHIVED` 发布状态、公开隔离和发布/撤回 API。
- READY 照片过滤、准确 `photoCount`/`total`、短期对象 URL。
- Admin/Viewer 深链、共享 TypeScript contracts 和统一错误解析。
- Viewer title、description、canonical、Open Graph、Twitter Card 和 noindex 生命周期。

### 当前验收缺口

- Admin 发布/撤回按钮的完整 IAB 交互证据仍不稳定。
- CLI 尚未覆盖 unpublish → republish 和撤销 Token 后的访问失效。
- 当前 PASSWORD Gallery 创建/密码设置能力不完整，成功解锁和 Session 过期无法完整验收。
- 尚无迁移回填数量、冲突和失败报告工具。
- 尚无 Viewer/Admin 前端自动化测试；SEO 目前以构建和浏览器 DOM 验收为主。
- Docker MinIO 默认使用 `host.docker.internal:9000`；生产必须通过 `STORAGE_PUBLIC_ENDPOINT` 覆盖为外部可达地址。

### 兼容原则

1. 不改变现有 `/g/:slug` 和 `/api/public/g/{slug}` 路径。
2. 不把 `visibility` 改造成发布状态；两者必须保持独立。
3. 不让客户端通过隐藏按钮代替服务端发布权限校验。
4. 不让迁移后的旧 Gallery 因新增字段突然全部不可访问。
5. 不在公开响应中返回 tenant、内部 ID、对象 key、tokenHash 或管理字段。

## 3. 产品规则冻结

### 3.1 状态定义

| 状态 | 工作区含义 | 公开端行为 |
| --- | --- | --- |
| `DRAFT` | 可编辑，尚未对访客发布 | 一律按未找到/不可访问处理，不泄露存在性 |
| `PUBLISHED` | 当前版本已对外发布 | 按 visibility 继续校验访问凭证 |
| `ARCHIVED` | 已下线，不再作为当前分享内容 | 一律不可访问，保留工作区历史数据 |

建议新建 Gallery 默认为 `DRAFT`。现有已可公开访问的 Gallery 在迁移时回填为 `PUBLISHED`，保证向后兼容；迁移必须可重复执行并有报告。

### 3.2 visibility 与 status 组合

- `PUBLISHED + PUBLIC`：匿名访客可访问。
- `PUBLISHED + PRIVATE`：匿名访客必须携带当前 Gallery 的有效分享 Token。
- `PUBLISHED + PASSWORD`：访客必须先携带当前 Gallery 的有效分享 Token，再提交密码并获得 gallery-scoped Session。
- `DRAFT` 或 `ARCHIVED`：无论是否携带 Token、Session 或登录身份，公开端都不可访问。
- 工作区成员访问 DRAFT 的规则暂沿用当前默认租户鉴权；完整成员角色由 M5 统一定义。

公开端对 DRAFT、ARCHIVED 和不存在的 Gallery 建议统一返回 `404 GALLERY_NOT_FOUND`，避免泄露资源存在性。工作区详情接口可在已授权上下文中返回真实状态。

### 3.3 发布前检查

发布操作必须由服务端执行，并返回明确的业务错误。建议最低检查：

- Gallery 存在且属于当前工作区。
- Gallery 未被软删除且当前状态不是 `ARCHIVED`。
- 至少存在一张 READY 且未删除的照片；若产品决定允许空 Gallery 发布，应改为警告而不是静默放行，并在本阶段测试中固定口径。
- 封面为空时允许发布，但公开端显示稳定的无封面状态；不自动暴露 PROCESSING/FAILED 照片。
- 发布操作幂等：已是 `PUBLISHED` 时重复发布不产生重复事件或错误副作用。

## 4. API 与数据契约

### 4.1 数据库迁移

新增可追踪发布状态和时间字段：

```sql
ALTER TABLE gallery
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN published_at DATETIME NULL;

CREATE INDEX idx_gallery_status_deleted
  ON gallery (status, deleted_at, created_at);
```

实际迁移需根据现有表结构设计版本化 Flyway migration，不能直接修改历史 migration。状态必须有数据库约束或领域层枚举校验。

建议补充：

- `published_at` 只在首次/重新发布时写入当前时间。
- `ARCHIVED` 是否保留 `published_at` 由审计需求决定；公开查询不能使用它绕过状态校验。
- 未来若需要版本回滚，再单独增加发布版本表，本阶段不提前引入。

### 4.2 工作区 API

新增发布命令接口：

```http
POST /api/galleries/{id}/publish
POST /api/galleries/{id}/unpublish
```

响应复用 Gallery Detail 结构，并包含：

```json
{
  "id": "uuid",
  "slug": "nature-space",
  "name": "自然风光",
  "visibility": "PUBLIC",
  "status": "PUBLISHED",
  "publishedAt": "2026-09-06T10:30:00Z",
  "coverThumbnailUrl": "https://...",
  "createdAt": "..."
}
```

`GET /api/galleries` 和 `GET /api/galleries/{id}` 同步返回 `status`、`publishedAt`。Controller 不自行拼装状态，统一由 Gallery facade 负责状态转换和授权。

错误至少包括：

- `GALLERY_NOT_FOUND`：当前租户不可见。
- `GALLERY_ALREADY_ARCHIVED`：归档 Gallery 不可发布。
- `GALLERY_NOT_READY`：没有可发布的 READY 照片（如果采用最低检查）。
- `GALLERY_STATE_CONFLICT`：状态转换不允许。

### 4.3 公开 API

保持现有路径不变：

```http
GET /api/public/g/{slug}
GET /api/public/g/{slug}/photos
GET /api/public/g/{slug}/viewer-config
POST /api/public/g/{slug}/unlock
```

公开 Facade 的第一步必须检查 Gallery status：

```text
find gallery by slug
→ reject deleted / DRAFT / ARCHIVED as GALLERY_NOT_FOUND
→ validate visibility credential
→ expose only READY, non-deleted photos
```

公开响应不新增管理字段；`accessState` 仍表示访客当前访问状态，不把 `PUBLISHED` 误当成 `accessState`。若 Viewer 需要区分“暂未发布”和“不存在”，应只在已授权的管理端提供状态，不在匿名端暴露。

### 4.4 分享链接撤销

新增 Admin 操作入口，复用现有后端接口：

```http
DELETE /api/share-links/{shareLinkId}
```

工作区中展示：

- 当前链接状态：ACTIVE、EXPIRED、REVOKED。
- 创建时间、过期时间、最近访问时间。
- 撤销按钮和二次确认。
- 撤销成功后从列表刷新，不显示 raw token。

创建响应仍可返回一次性 `rawToken` 和完整 `shareUrl`；列表、错误、日志和普通 Viewer 响应绝不返回 raw token。

## 5. Admin 工作区体验

### 状态展示

在 `/app/galleries/:id` 顶部显示：

- `草稿`：提示“访客暂不可访问”，主按钮为“发布”。
- `已发布`：显示公开状态和发布时间，主按钮为“撤回发布”。
- `已归档`：只读展示，不显示发布按钮。

发布和撤回发布必须：

- 显示 loading 状态，防止重复提交。
- 成功后更新当前 Gallery，不依赖整页刷新。
- 失败时保留原状态并显示可恢复错误。
- 浏览器刷新后由详情接口恢复真实状态。

### 总览页

Gallery 卡片增加：

- 发布状态 badge。
- READY 照片数量。
- 最近发布时间或更新时间（字段存在后再展示）。
- 草稿 Gallery 的“继续编辑”入口。

本阶段不实现复杂筛选；可增加最小状态筛选，但必须由服务端字段驱动，不能由前端猜测。

### 分享入口

- DRAFT Gallery 禁止生成新的访客分享链接，或至少让后端拒绝创建并返回明确错误；建议采用后端拒绝。
- PUBLISHED Gallery 才允许复制访客 URL。
- 撤回发布后，公开访问立即失效；历史 Token 保留记录但不能绕过 status 检查。
- 重新发布后可继续使用未撤销、未过期 Token，是否自动轮换 Token 延后到后续安全策略评估。

## 6. Viewer、SEO 与缓存

### Viewer 行为

- 匿名访问 DRAFT/ARCHIVED 时显示统一的“页面不存在或暂不可用”状态，不展示内部发布状态。
- PUBLISHED + PUBLIC 继续直接进入 Viewer。
- PUBLISHED + PRIVATE/PASSWORD 继续走 Token/密码流程。
- 发布撤回后，刷新或重新请求状态必须回到不可访问状态。
- Viewer 不缓存可绕过发布状态的 Gallery 或图片响应。

### SEO 元信息

为公开 Viewer 页面生成：

- `<title>`：Gallery 标题 + VIE Gallery。
- `meta[name="description"]`：基于公开标题和照片数量的安全描述。
- `link[rel="canonical"]`：不包含 raw token 的 `/g/{slug}` URL。
- Open Graph：`og:title`、`og:description`、`og:url`、`og:image`。
- Twitter Card：至少 `summary_large_image` 或安全降级类型。

安全规则：

- canonical、Open Graph 和结构化数据不得包含 `?t=<rawToken>`。
- PRIVATE/PASSWORD 页面不输出可被搜索引擎索引的完整照片元数据，建议 `noindex, nofollow`。
- DRAFT/ARCHIVED/404 返回 `noindex`，不输出封面和照片数量等存在性线索。
- OG 图片必须使用短期或受控的公开缩略图 URL，不能暴露永久对象地址或内部 key。
- Token 不进入 title、description、埋点、日志和缓存 key。

本阶段优先完成客户端 meta 管理；若生产部署要求真实爬虫预渲染，再单独评估 SSR/边缘渲染，不在本阶段引入完整 SSR 架构。

## 7. 实施顺序

### Task 1：状态模型和迁移

- 新增 `GalleryStatus`。
- 新增 Flyway migration、`published_at` 和索引。
- 为旧 Gallery 执行幂等回填。
- 更新 Domain、Repository、in-memory adapter 和 MyBatis adapter。
- 增加状态转换单测。

### Task 2：发布/撤回发布用例

- 在 `GalleryFacade` 增加 publish/unpublish。
- 增加服务端授权、幂等和发布前检查。
- 增加 `POST /publish`、`POST /unpublish`。
- 详情和列表响应增加 status 字段。

### Task 3：公开端隔离

- PublicAccessFacade 首先拒绝 DRAFT/ARCHIVED。
- Token、PASSWORD Session 不能绕过 status 检查。
- 保持 READY 过滤、分页 total、cover 和签名 URL 规则不变。
- 补充撤回发布后的立即失效测试。

### Task 4：Admin 发布和分享管理 UI

- 工作区显示状态、发布时间和发布/撤回按钮。
- DRAFT 禁止创建分享链接。
- 增加分享列表、撤销、确认、刷新和错误恢复。
- 总览卡片显示发布状态。

### Task 5：Viewer SEO 和缓存策略

- 根据已加载的公开 Gallery 数据设置 title/meta/canonical/OG。
- PRIVATE/PASSWORD 和未发布页面设置 noindex。
- 检查缓存 header、浏览器缓存和 CDN key 不包含或复用 raw token。
- 验证撤回发布后旧 URL、旧 Token 和刷新请求均不可访问。

### Task 6：回归、迁移演练和浏览器验收

- 先在副本数据库执行 migration dry-run。
- 记录旧 Gallery 数量、回填数量、冲突和失败项。
- 执行后端测试、Admin/Viewer build、Docker 健康检查。
- 用浏览器 MCP 验证创建草稿、发布、访问、撤回、重新发布和分享撤销。

## 8. 测试矩阵

### 后端

- 新建 Gallery 默认为 DRAFT。
- 旧 Gallery 回填为 PUBLISHED 且迁移可重复执行。
- 只有当前租户可以发布自己的 Gallery。
- 发布前 READY 照片检查符合产品口径。
- publish/unpublish 幂等。
- DRAFT/ARCHIVED 不可通过 PUBLIC、PRIVATE Token 或 PASSWORD Session 访问。
- 撤回发布后旧 Token 立即失效。
- 重新发布后的访问行为符合 visibility。
- 公开 API 不返回 status 以外的管理字段，且不泄露 raw token。
- 分享链接列表包含状态但不包含 raw token。
- 状态、时间字段在 MyBatis 和 in-memory adapter 中一致。

### Admin

- 状态 badge 与详情接口一致。
- 发布成功后按钮和状态即时更新。
- 发布失败可重试，不丢失当前 Gallery。
- DRAFT 创建分享被后端拒绝，UI 显示明确原因。
- 撤销链接后列表刷新且不可再次使用。
- 刷新 `/app/galleries/:id` 后状态仍正确。

### Viewer/SEO

- PUBLISHED PUBLIC 页面可访问并生成 canonical/OG。
- PUBLISHED PRIVATE/PASSWORD 页面不被索引且仍按凭证访问。
- DRAFT、ARCHIVED 和不存在 slug 统一显示不可用状态并设置 noindex。
- canonical 不包含 token。
- raw token 不出现在 DOM 文案、meta、日志或缓存键。
- 公开照片仍只包含 READY、未删除记录。

## 9. Definition of Done

### 发布模型

- [x] Gallery 有 `DRAFT/PUBLISHED/ARCHIVED` 状态和 `publishedAt`。
- [x] 新 Gallery 默认为 DRAFT，旧数据完成幂等回填。
- [x] 发布/撤回发布接口具备租户校验、状态校验和幂等行为。
- [x] Gallery 列表和详情返回真实发布状态。

### 公开隔离

- [x] DRAFT/ARCHIVED 无法通过匿名、Token 或 PASSWORD Session 访问。
- [x] 撤回发布后公开 URL 和已有凭证立即失效。
- [x] PUBLISHED 的 PUBLIC/PRIVATE/PASSWORD 规则不回归。
- [x] READY、软删除、封面和分页口径不回归。

### 工作区与分享

- [x] Admin 工作区可以发布和撤回发布。
- [x] DRAFT Gallery 无法创建新的访客分享链接。
- [x] Admin 可以查看和撤销分享链接。
- [x] raw token 只在创建响应/复制动作中短暂出现。

### SEO 与质量

- [x] PUBLIC 已发布页面有安全的 title、description、canonical 和 OG 信息。
- [x] PRIVATE/PASSWORD/DRAFT/ARCHIVED 页面设置 noindex。
- [x] canonical、meta、日志和缓存不包含 raw token。
- [x] Flyway migration、后端测试、Admin/Viewer build 和 Docker 健康检查通过。
- [ ] 浏览器 MCP 完成创建 → 发布 → 访问 → 撤回 → 再发布主流程；Docker/API 已完成发布、Viewer 访问、撤回后 404 与 noindex 验收，Admin 表单提交在当前 IAB 环境超时，仍需补充 Admin 发布按钮、重新发布和撤销 Token 的完整交互证据。

## 10. 本阶段不做

- 完整 Membership、OWNER/EDITOR/VIEWER 和成员邀请。
- 发布版本历史、草稿快照、差异比较和回滚。
- 上传任务中心、批量重试和取消。
- 原图公开接口、CDN 产品化和永久资源 URL。
- SSR/全量预渲染架构。
- AI 标签、计费、自定义域名和大型视觉改版。
- 以发布状态为名义重命名现有 workspace API。

## 11. 完成后进入的阶段

M4 核心实现和主要运行态验收完成后进入：

1. **M5 Workspace/Membership**：[next-slice-membership-and-authorization.md](next-slice-membership-and-authorization.md)：成员加入、角色权限和服务层能力 gating。
2. **M6 上传任务生产化**：[next-slice-upload-task-productionization.md](next-slice-upload-task-productionization.md)：任务列表、重试、取消、刷新恢复和可观测性。
3. **M7 Viewer 性能与配置协议**：配置 schema、版本/回滚、CDN、懒加载和移动端性能。

产品判断标准：

> 创作者清楚知道空间是否已发布；未发布内容不会从公开端泄露；已发布内容按照 visibility 和凭证规则访问；搜索引擎只收录明确允许公开的页面。
