# 开放型现代相册系统：下一阶段开发指导

> 状态：规划文档，不包含代码变更  
> 目标：将当前以 Admin/租户为中心的后台原型，逐步演进为面向创作者、团队和访客的开放型生产级相册产品。

---

## 1. 产品北极星

产品不是“管理员管理照片的后台”，而是：

> 用户创建一个可分享的 3D 相册空间，上传并组织照片，配置展示体验，然后让任何访客通过稳定 URL 访问它。

因此系统必须同时服务三类人：

| 角色 | 主要目标 | 典型页面 |
| --- | --- | --- |
| 访客 | 浏览公开相册 | `/g/:slug` |
| 创作者 | 创建、上传、发布自己的相册 | `/app/`、`/app/galleries/:id` |
| 协作者 | 在授权范围内编辑相册 | `/app/galleries/:id` |

`Admin` 只能是权限模型中的一种角色，不能成为产品概念、页面命名或 API 设计的中心。

---

## 2. 第一阶段先规范 URL 和页面职责

### 2.1 目标 URL 结构

```text
/app/                         创作者工作台首页：空间总览
/app/galleries/:id            单个相册空间工作台
/app/galleries/:id/config     当前空间的 3D 视觉配置
/g/:slug                      访客公开相册
/g/:slug?token=:token         私密/受保护相册的分享访问
```

### 2.2 页面职责

#### `/app/`

只负责：

- 查看用户有权访问的空间
- 创建空间
- 搜索、筛选、排序空间
- 显示空间封面、照片数、状态、更新时间
- 进入空间工作台

不负责：

- 展示完整照片网格
- 上传当前空间的照片
- 编辑空间配置
- 生成当前空间的操作面板

#### `/app/galleries/:id`

只负责当前空间：

- 空间信息和发布状态
- 上传、处理、管理照片
- 设置封面
- 分享链接
- 进入 3D 配置
- 以创作者/协作者身份预览

必须有明确的“返回我的空间”入口。

#### `/g/:slug`

只面向访客：

- 公开相册展示
- 密码或分享 Token 解锁
- 3D Viewer 加载
- 照片浏览

不得出现：

- 上传按钮
- 删除按钮
- 配置按钮
- 管理员信息
- 内部租户信息

### 2.3 路由命名原则

- URL 使用资源名，不使用角色名：`galleries`，不要使用 `admin-galleries`
- 使用稳定 slug 作为访客入口，不使用数据库 UUID 暴露给访客
- 编辑 URL 使用 UUID 或不可变资源 ID，避免 slug 修改后工作区丢失
- 页面名称和 API 名称保持一致：Gallery / Gallery Workspace / Public Gallery
- `Admin` 只在权限字段、管理审计和后台运维上下文中出现

---

## 3. 第二阶段规范身份、工作区和授权模型

当前后端已有 `User`、`Tenant`、`Membership`、`MembershipRole` 和 `TenantContext`，应沿着已有模型继续演进，而不是把所有用户都视为 Admin。

### 3.1 推荐关系

```text
User
  └── Membership ──> Workspace/Tenant
                         └── Gallery
                              ├── Photo
                              └── GalleryViewerConfig
```

建议产品术语统一：

- 面向用户：Workspace / 工作区
- 数据层兼容：Tenant / 租户
- 空间内容：Gallery / 相册空间

如果短期不改数据库表名，也应在前端和 API 文案中逐步从“租户/管理员”转为“工作区/成员”。

### 3.2 角色建议

```text
OWNER   工作区所有者
EDITOR  可编辑相册内容和配置
VIEWER  可查看工作区内部内容
```

平台运维角色另行处理：

```text
PLATFORM_ADMIN
```

不要把 `ADMIN` 作为所有创作者的默认身份。

### 3.3 权限矩阵

| 能力 | OWNER | EDITOR | VIEWER | 访客 |
| --- | --- | --- | --- | --- |
| 查看工作区空间 | 是 | 是 | 是 | 否 |
| 创建空间 | 是 | 按工作区策略 | 否 | 否 |
| 上传照片 | 是 | 是 | 否 | 否 |
| 删除照片 | 是 | 按策略 | 否 | 否 |
| 修改 3D 配置 | 是 | 是 | 否 | 否 |
| 发布/取消发布 | 是 | 可选 | 否 | 否 |
| 管理成员 | 是 | 否 | 否 | 否 |
| 浏览公开相册 | 是 | 是 | 是 | 是 |

所有后端写操作都必须在服务层做授权判断，不能只依赖前端隐藏按钮。

---

## 4. 第三阶段规范领域模型和 API

### 4.1 Gallery 领域字段

当前 `Gallery` 已有：

- `id`
- `tenantId`
- `slug`
- `name`
- `visibility`
- `coverPhotoId`
- `createdAt`

建议新增或规划：

```text
status              DRAFT | PROCESSING | READY | PUBLISHED | ERROR
updatedAt           最近一次内容或配置变更时间
publishedAt         最近一次发布的时间
createdBy           创建者用户 ID
updatedBy           最近修改者用户 ID
photoCount          服务端聚合数量
failedPhotoCount    处理失败数量
```

访问权限和生命周期必须分开：

```text
visibility = PUBLIC | PRIVATE | PASSWORD
status     = DRAFT | PROCESSING | READY | PUBLISHED | ERROR
```

`PUBLIC` 表示谁可以访问；`PUBLISHED` 表示空间是否已经准备好对外展示。

### 4.2 推荐创作者 API

```text
GET    /api/me
GET    /api/workspaces
GET    /api/workspaces/:workspaceId/galleries
POST   /api/workspaces/:workspaceId/galleries
GET    /api/galleries/:galleryId
PATCH  /api/galleries/:galleryId
DELETE /api/galleries/:galleryId
```

照片资源：

```text
GET    /api/galleries/:galleryId/photos
POST   /api/galleries/:galleryId/photos
PATCH  /api/photos/:photoId
DELETE /api/photos/:photoId
GET    /api/photos/tasks/:taskId
```

分享资源：

```text
GET    /api/galleries/:galleryId/share-links
POST   /api/galleries/:galleryId/share-links
DELETE /api/galleries/:galleryId/share-links/:linkId
```

Viewer 配置：

```text
GET    /api/galleries/:galleryId/viewer-config
PUT    /api/galleries/:galleryId/viewer-config
```

### 4.3 推荐访客 API

现有 `/api/public/g/:slug` 方向是正确的，建议保持公开 API 与创作者 API 分离：

```text
GET  /api/public/g/:slug
GET  /api/public/g/:slug/photos
GET  /api/public/g/:slug/viewer-config
POST /api/public/g/:slug/unlock
```

公开 API 只返回访客所需字段，不返回：

- `tenantId`
- 内部角色
- 存储对象 key
- 管理审计字段
- 未发布照片
- 内部错误详情

### 4.4 API 返回模型

列表接口不应让前端为每张卡片再请求一次照片数量。建议 `GallerySummary` 直接包含：

```json
{
  "id": "...",
  "slug": "nature-space",
  "name": "自然风光摄影空间",
  "visibility": "PUBLIC",
  "status": "PUBLISHED",
  "coverThumbnailUrl": "...",
  "photoCount": 24,
  "failedPhotoCount": 0,
  "updatedAt": "2026-09-05T10:00:00Z"
}
```

单空间接口返回完整工作台所需信息，避免页面进入后重复拼装上下文。

---

## 5. 第四阶段解决“进入空间”主流程

### 5.1 总览页行为

空间卡片的“进入空间”必须导航到：

```text
/app/galleries/:id
```

不能只调用 `selectGallery()` 或在同一页面滚动到照片区域。

### 5.2 创建空间行为

创建成功后：

1. 显示成功反馈
2. 更新空间列表缓存
3. 直接导航到 `/app/galleries/:id`
4. 新空间进入 `DRAFT` 状态
5. 工作台显示“上传第一组照片”引导

### 5.3 刷新和深链

用户直接打开 `/app/galleries/:id` 时，页面必须：

- 根据 URL 加载空间
- 校验当前用户是否有权限
- 加载照片和 Viewer 配置
- 无权限显示 403 页面
- 不存在显示 404 页面
- 不依赖总览页先选中空间

### 5.4 返回行为

工作台顶部提供：

```text
← 我的空间
```

浏览器后退也必须正常工作，不能依赖全局 selectedGallery 状态才能恢复页面。

---

## 6. 第五阶段完善当前占位按钮

### 6.1 必须立即做成真实行为的按钮

| 按钮 | 真实行为 |
| --- | --- |
| 进入空间 | 导航到 `/app/galleries/:id` |
| 继续编辑 | 导航到当前空间工作台 |
| 预览空间 | 打开 `/g/:slug` 或完整 Viewer URL |
| 3D 视觉配置 | 导航到 `/app/galleries/:id/config` |
| 分享链接 | 创建、展示、复制和管理分享链接 |
| 刷新 | 重新请求当前列表并显示结果 |
| 创建第一个空间 | 打开创建流程并在成功后进入空间 |

### 6.2 暂时不要展示的按钮

如果后端还没有真实能力，应暂时移除或改成明确的禁用状态：

- 最近编辑：没有 `updatedAt` 时不要伪造
- 更多操作：没有菜单项和对应 API 时不要展示
- 撤销分享：没有删除分享链接 API 时不要展示
- 发布：没有状态机和发布 API 时不要展示
- 收藏、置顶、复制空间：没有数据模型时不要展示

生产级原则：

> 宁可少一个按钮，也不要让用户点击后没有可验证的结果。

---

## 7. 第六阶段建立空间工作台

### 7.1 工作台布局

```text
WorkspaceShell
├── Breadcrumb / 返回我的空间
├── GalleryHeader
│   ├── 名称、slug、状态、访问权限
│   ├── 保存/发布状态
│   └── 预览、分享、配置
├── PhotoToolbar
│   ├── 照片数量
│   ├── 筛选状态
│   └── 上传照片
├── UploadDropzone
├── PhotoGrid
└── ProcessingSummary
```

### 7.2 空间状态

至少支持以下用户可理解的状态：

```text
草稿：尚未公开
处理中：照片正在生成缩略图
已准备：可以预览
已发布：访客可访问
异常：存在处理失败项目
```

### 7.3 上传体验

当前前端轮询可以作为 MVP，但应逐步升级为：

- 上传队列
- 每个文件独立状态
- 失败重试
- 页面刷新后恢复状态
- 取消任务
- 错误原因
- 处理完成后自动更新空间摘要

第一步只需保证：上传失败时能看到失败文件，并且有明确的“重试处理”入口。

---

## 8. 第七阶段规范访客体验

### 8.1 公开相册访问规则

```text
PUBLIC   直接访问
PRIVATE  仅登录用户或分享 Token
PASSWORD 访问时输入密码
```

必须由后端判定访问权限，前端不能通过隐藏元素实现安全控制。

### 8.2 访客页面状态

- Loading：Viewer 初始化中
- Empty：空间已发布但暂无照片
- Locked：需要密码或分享凭证
- Error：WebGL 不支持或资源加载失败
- Not Found：slug 不存在或已被删除

### 8.3 SEO 和分享元数据

公开相册后续应提供：

- 页面 title
- description
- Open Graph 图片
- canonical URL
- 可复制的公开链接

slug 修改时需要明确策略：

- 是否保留旧 slug 重定向
- 是否允许 slug 修改
- 是否有 slug 占用回收规则

---

## 9. 第八阶段迁移策略

不建议一次性重写整个系统，建议按垂直切片推进。

### Slice 1：真正进入空间

目标：先修复主流程。

- 新增前端 `/galleries/:id` 路由
- 将当前照片管理区迁移/复用到独立工作台
- 总览卡片和创建成功后导航到该路由
- 增加返回总览
- 暂不改变后端 API 路径

完成标准：用户可以创建空间、进入空间、上传截图、设置封面、预览。

### Slice 2：空间摘要规范化

- Gallery 列表返回 `photoCount`
- 增加 `updatedAt`
- 增加 `status`
- 移除前端用当前选中空间猜测全局统计
- 真实实现公开/私密筛选

### Slice 3：授权规范化

- 将写操作统一接入 Membership 权限校验
- OWNER / EDITOR / VIEWER 生效
- 前端根据权限显示操作
- 后端始终做最终判断

### Slice 4：访客与发布

- 完善发布状态机
- 公开 API 只返回已发布数据
- 访客页面支持锁定、错误、空状态
- 分享链接可撤销

### Slice 5：上传任务生产化

- 任务列表接口
- 重试接口
- 取消接口
- 处理失败可观测
- 前端刷新后恢复任务

---

## 10. 测试与验收策略

### 10.1 路由测试

- 未登录访问 `/app/`：进入登录状态
- 登录后访问 `/app/`：显示自己的空间
- 直接访问 `/app/galleries/:id`：可恢复工作台
- 访问无权限空间：403
- 访问不存在空间：404
- 访问 `/g/:slug`：只显示访客内容
- 公开、私密、密码相册分别验证

### 10.2 授权测试

至少覆盖：

- 不同工作区之间不能互相读取空间
- VIEWER 不能上传、删除、改配置
- EDITOR 不能管理成员
- 非成员不能调用工作台 API
- 访客不能通过修改 URL 访问私密空间

### 10.3 UI 测试

- 卡片“进入空间”产生 URL 变化
- 新建成功后进入新空间
- 返回总览保留列表状态
- 移动端 390px 无横向溢出
- 长名称、长 slug、无封面、空照片、处理失败均可读
- 所有可见按钮都有真实结果或明确禁用说明

### 10.4 API 契约测试

前后端共享 contracts，重点验证：

- Gallery Summary 字段
- Gallery Detail 字段
- Photo Processing 状态
- 权限错误结构
- 404/403/409/422 错误码
- requestId 可追踪

---

## 11. 当前最推荐的下一步

下一步只做一个垂直切片，不要同时做权限、状态机和视觉大改：

### 任务：建立单相册空间工作台

具体范围：

1. 前端新增 `/app/galleries/:id` 路由
2. 新建 `GalleryWorkspaceView.vue`
3. 将当前 `OverviewView.vue` 中的照片上传、照片网格、分享、配置、Viewer 操作迁移或抽取到工作台
4. `OverviewView.vue` 只保留空间总览
5. 卡片“进入空间”使用真实路由跳转
6. 创建成功后跳转到新空间工作台
7. 增加工作台的返回总览入口
8. 保持当前后端 API 不变
9. 增加路由和核心交互测试

### 暂不做

- 暂不重命名数据库中的 Tenant
- 暂不大规模改 Membership 表
- 暂不实现完整发布状态机
- 暂不实现最近编辑筛选
- 暂不增加没有后端支持的按钮
- 暂不引入新的状态管理库

这是风险最低、用户价值最高的下一步：先让产品形成完整主路径，再继续规范后端和权限。

---

## 12. 产品级判断标准

以后每增加一个页面、按钮或 API，都用以下问题检查：

1. 这个能力属于访客、创作者、协作者还是平台运维？
2. 它对应哪个稳定 URL？
3. 刷新页面后能否恢复上下文？
4. 后端是否真正校验了权限？
5. 按钮点击后是否有确定结果？
6. 错误后用户是否知道下一步怎么做？
7. 是否把访问权限和内容发布状态混在了一起？
8. 这个字段是产品事实，还是前端猜测？
9. 这个接口返回的是资源，还是某个页面的临时拼装数据？
10. 移动端、深链、空状态和失败状态是否同样成立？

只要这些问题持续得到回答，系统就会从“能运行的后台”逐步变成真正现代、开放、可维护的产品。
