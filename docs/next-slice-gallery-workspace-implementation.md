# 下一步详细实现指导：单相册空间工作台

> 上位规范：[open-gallery-product-roadmap.md](./open-gallery-product-roadmap.md)  
> 本阶段目标：让“进入空间”成为真正的 URL 导航，并建立独立的单相册空间工作台。  
> 本阶段原则：先打通主流程，保持现有后端 API 和数据模型，不提前引入完整权限重构、发布状态机或新的状态管理库。

---

## 1. 本阶段完成后的用户流程

```text
登录
  ↓
/app/
  查看自己有权访问的相册空间
  ↓ 点击“进入空间”
/app/galleries/:id
  管理当前空间的照片、封面、分享和 3D 配置
  ↓ 点击“预览空间”
/g/:slug
  以访客视角查看相册
```

新建空间流程：

```text
/app/
  ↓ 新建空间
创建空间 Modal
  ↓ 创建成功
/app/galleries/:id
  显示“上传第一组照片”引导
```

本阶段不再把照片管理区作为总览页下方的展开内容。总览页只承担空间发现和导航职责。

---

## 2. 明确范围

### 2.1 本阶段必须实现

- 新增 `/app/galleries/:id` 前端路由
- 新增 `GalleryWorkspaceView.vue`
- 总览空间卡片的“进入空间”真实跳转
- “继续编辑”真实跳转
- 新建空间成功后跳转到新工作台
- 工作台能够通过 URL 直接加载空间和照片
- 工作台显示返回总览入口
- 保留上传、任务轮询、设置封面、删除照片、分享链接、3D 配置和 Viewer
- 处理空间不存在、无权限、网络失败和空照片状态
- 工作台刷新后仍能恢复当前空间上下文
- 增加路由、加载和核心交互测试

### 2.2 本阶段明确不做

- 不修改数据库中的 Tenant 表名
- 不引入新的状态管理库
- 不增加 `updatedAt`、`status` 等领域字段
- 不实现真实“最近编辑”排序
- 不实现成员邀请和完整 OWNER/EDITOR/VIEWER 权限矩阵
- 不实现空间删除
- 不实现分享链接撤销（除非现有 API 已经支持）
- 不重写 Viewer 或 3D 配置页面
- 不把后端接口一次性重命名为 `/api/workspaces/...`

原因：本阶段优先解决产品主路径和页面边界，避免 URL、后端模型、权限、状态机同时变更导致回归范围不可控。

---

## 3. 当前实现基线

### 3.1 前端路由

文件：`apps/gallery-admin/src/main.ts`

当前：

```ts
/
/galleries/:id/config
```

当前应用使用：

```ts
createWebHistory('/app/')
```

因此新增路由应写为：

```ts
{
  path: '/galleries/:id',
  name: 'gallery-workspace',
  component: () => import('./views/GalleryWorkspaceView.vue')
}
```

浏览器中的最终地址为：

```text
/app/galleries/:id
```

### 3.2 现有后端 API

本阶段直接复用现有接口：

```text
GET    /api/galleries
POST   /api/galleries
GET    /api/galleries/:galleryId/photos
POST   /api/galleries/:galleryId/photos
PATCH  /api/photos/:photoId
DELETE /api/photos/:photoId
GET    /api/photos/tasks/:taskId
POST   /api/galleries/:galleryId/share-links
GET    /api/galleries/:galleryId/share-links
GET    /api/galleries/:galleryId/viewer-config
```

现有 API 通过 `TenantContextResolver` 按当前登录上下文隔离数据。前端不得把 `tenantId` 拼入 URL，也不得绕过 `apiFetch`。

### 3.3 当前逻辑位置

当前 `OverviewView.vue` 同时包含：

- `loadGalleries`
- `selectGallery`
- `loadPhotos`
- `processUploadFiles`
- `handleSetCover`
- `confirmDeletePhoto`
- `openShareModal`
- `openViewer`
- `goToConfig`
- 创建空间 Modal
- 分享链接 Modal
- 照片 Lightbox

迁移时优先“抽取并复用”，不要复制两套相同业务逻辑。

---

## 4. 目标页面职责

### 4.1 `/app/` 总览页

只保留：

- 页面标题和工作区介绍
- 空间数量、筛选/排序入口
- 空间卡片
- 创建空间入口
- 最近空间摘要
- 空状态

空间卡片上的操作：

```text
进入空间 → /app/galleries/:id
预览空间 → /g/:slug
3D 配置   → /app/galleries/:id/config
```

总览页不再渲染：

- 当前空间照片网格
- 上传区域
- 照片删除/封面操作
- 分享链接 Modal
- Lightbox

### 4.2 `/app/galleries/:id` 工作台

工作台只处理路由中的当前空间：

- 空间标题、slug、可见性
- 返回总览
- 3D 视觉配置
- 分享链接
- 预览空间
- 照片上传
- 上传进度和任务状态
- 照片网格
- 设置封面
- 删除照片
- Lightbox

### 4.3 `/app/galleries/:id/config`

保留当前配置页。

本阶段只补充上下文一致性：

- 从工作台进入配置页
- 配置页返回工作台，而不是无条件返回总览
- 页面标题能识别当前相册空间

如当前配置页还无法展示空间名称，可以先保留 ID 路由行为，不阻塞工作台拆分。

---

## 5. 推荐实现方案

## 5.1 第一轮：先复制页面壳，不复制逻辑

新增：

```text
apps/gallery-admin/src/views/GalleryWorkspaceView.vue
```

第一轮允许将 `OverviewView.vue` 中的工作台模板暂时移动到新文件，但不建议把代码直接复制后长期维护两份。

推荐先抽取以下展示组件：

```text
apps/gallery-admin/src/components/gallery-workspace/
├── GalleryWorkspaceHeader.vue
├── GalleryUploadDropzone.vue
├── GalleryPhotoGrid.vue
└── GalleryPhotoCard.vue
```

Modal 和已有组件继续复用：

```text
ConfirmModal.vue
LightboxModal.vue
```

### 5.2 第二轮：抽取工作台状态逻辑

建议创建：

```text
apps/gallery-admin/src/composables/useGalleryWorkspace.ts
```

职责：

- 根据 `galleryId` 加载空间和照片
- 管理 `loading`、`photos`、`selectedGallery`
- 管理上传状态和任务轮询
- 管理封面设置和照片删除
- 暴露 `reload`、`uploadFiles`、`setCover`、`deletePhoto`

不放入 composable 的内容：

- Modal 视觉布局
- 路由跳转页面结构
- 具体按钮文案
- Toast 容器渲染

推荐接口草案：

```ts
const {
  gallery,
  photos,
  loading,
  error,
  uploading,
  uploadProgress,
  uploadStatusText,
  reload,
  uploadFiles,
  setCover,
  deletePhoto
} = useGalleryWorkspace(galleryId)
```

如果第一轮抽取成本过高，可以先把逻辑保留在新 View 中，但必须在任务清单中记录后续抽取，不能让总览页继续拥有工作台状态。

---

## 6. 路由行为详细规范

### 6.1 总览卡片

当前卡片点击可以继续支持选择态，但“进入空间”必须调用路由：

```ts
router.push(`/galleries/${gallery.id}`)
```

更推荐使用命名路由：

```ts
router.push({
  name: 'gallery-workspace',
  params: { id: gallery.id }
})
```

如果整个卡片可点击：

- 卡片主区域导航到工作台
- 配置和预览按钮使用 `@click.stop`
- 不能因为卡片点击触发额外的照片加载
- 卡片要有键盘 Enter 行为

### 6.2 创建成功

`handleCreateGallery()` 的成功分支调整为：

```text
关闭创建 Modal
清空表单
显示成功 Toast
刷新总览列表（可选）
router.push({ name: 'gallery-workspace', params: { id: newGallery.id } })
```

工作台页面负责首次加载新空间。

不要继续：

```ts
loadGalleries()
selectGallery(newGallery.id)
```

因为这会把工作台状态留在总览页，并造成重复请求。

### 6.3 最近编辑

在尚未拥有 `updatedAt` 之前：

- “继续编辑”只能指向 `selectedGallery` 或明确的最近访问项
- 不要声称服务端排序为最近编辑
- 如果无法证明“最近”，文案使用“继续上次工作”或“当前空间”

推荐本阶段先使用：

```text
继续上次工作
当前空间 · N 张照片
```

等后端具备时间字段后再上线“最近编辑”筛选。

### 6.4 直接深链

用户直接访问：

```text
/app/galleries/abc
```

工作台必须独立执行：

1. 读取路由参数 `id`
2. 请求当前空间数据
3. 请求照片列表
4. 根据响应渲染页面
5. 无法访问时显示对应错误状态

不能假设总览页已经加载过 `galleries`，也不能依赖全局 `selectedGalleryId`。

### 6.5 返回总览

工作台显示：

```text
← 我的空间
```

点击使用：

```ts
router.push({ name: 'overview' })
```

如果未来支持从卡片带 query 进入，可保留来源 query，但本阶段不要求。

浏览器后退应自然返回上一页，不要使用全局状态模拟返回。

---

## 7. 工作台页面实现规范

### 7.1 页面骨架

```text
.gallery-workspace-page
├── breadcrumb
│   └── ← 我的空间
├── workspace-header
│   ├── 空间名称
│   ├── PUBLIC / PRIVATE
│   ├── /g/:slug
│   └── 操作按钮
│       ├── 3D 视觉配置
│       ├── 分享链接
│       └── 预览空间
├── photo-toolbar
│   ├── 照片
│   ├── 数量
│   └── 上传照片
├── upload-dropzone
├── processing-summary（有任务时显示）
├── photo-grid
└── empty-photos-state
```

### 7.2 顶部信息

推荐文案：

```text
← 我的空间

自然风光摄影空间                         PUBLIC
/g/nature-space · 2 张照片
```

操作按钮命名统一：

```text
3D 视觉配置
分享链接
预览空间
```

不要在同一页面混用：

- 3D 空间漫游
- 预览空间
- 3D Viewer

如果按钮打开新窗口，应在辅助说明或可访问标签中表达：

```text
预览空间（新窗口）
```

### 7.3 上传区域

桌面端：

```text
拖拽照片至此处上传，或点击选择文件
支持 JPG、PNG、WebP · 自动生成 3D 缩略图
```

移动端：

```text
点击选择照片
也可以将照片拖拽到此处
```

上传状态必须显示：

- 当前状态文案
- 进度百分比
- 失败后的下一步

### 7.4 照片卡片

照片卡片至少显示：

- 缩略图
- 封面标识
- 处理状态
- 文件名或标题
- 设置封面
- 删除

处理状态文字不能只用颜色：

```text
READY      已完成
PROCESSING 处理中
FAILED     处理失败
```

如果当前后端 Photo 状态枚举不同，前端增加映射函数，不直接把内部枚举原样暴露给用户。

### 7.5 空照片状态

新建空间进入工作台时显示：

```text
还没有照片
上传第一组照片，开始构建你的 3D 相册空间。

[上传照片]
```

按钮必须触发文件选择，而不是只显示装饰。

### 7.6 错误状态

至少区分：

```text
空间不存在
你没有权限访问此空间
空间加载失败
照片加载失败
```

推荐显示结构：

```text
无法打开这个相册空间
空间可能已被删除，或你没有访问权限。

[返回我的空间] [重试]
```

不要把后端原始异常、tenant ID 或堆栈信息展示给用户。

---

## 8. API 和数据处理要求

### 8.1 单空间加载

当前后端没有专门的：

```text
GET /api/galleries/:id
```

本阶段有两个可选方案。

#### 方案 A：MVP 复用列表接口

工作台加载时：

1. 请求 `GET /api/galleries`
2. 在前端查找路由中的 `id`
3. 请求 `GET /api/galleries/:id/photos`

优点：不改后端，最快完成。  
缺点：深链会加载整个列表，空间数量大时不理想。

#### 方案 B：新增单空间详情接口

新增：

```text
GET /api/galleries/:galleryId
```

返回：

```json
{
  "id": "...",
  "slug": "nature-space",
  "name": "自然风光摄影空间",
  "visibility": "PUBLIC",
  "coverPhotoId": "...",
  "coverThumbnailUrl": "...",
  "createdAt": "..."
}
```

优点：资源边界清晰、适合深链和后续权限校验。  
缺点：需要补 Controller、Facade 和测试。

**推荐顺序：先用方案 A 打通前端主流程，再用方案 B 作为本阶段的后续后端小任务。**

### 8.2 不新增前端猜测字段

在后端还没有返回之前，不要在 UI 中伪造：

- 最近编辑时间
- 发布状态
- 照片总数（可暂时使用当前照片列表长度）
- 处理失败总数
- 空间所有者

### 8.3 API 错误映射

前端至少按 HTTP 状态或 `ApiError.code` 映射：

```text
401 → 登录已失效，请重新登录
403 → 你没有权限访问此空间
404 → 相册空间不存在
409 → 空间标识已被使用
413 → 文件过大
422 → 文件格式或表单参数不合法
5xx → 服务暂时不可用，请稍后重试
```

所有请求继续使用：

```ts
apiFetch(...)
```

---

## 9. 组件边界

### 9.1 `GalleryWorkspaceView.vue`

负责：

- 读取 route params
- 组织页面布局
- 调用 workspace composable
- 控制 Share Modal、Confirm Modal、Lightbox
- 执行 router 跳转
- 处理 Toast

不负责：

- 直接拼接所有照片卡片细节
- 在多个位置重复实现上传逻辑
- 直接操作全局 DOM 来模拟路由

### 9.2 `GalleryCard.vue`

建议后续从总览页抽取，负责：

- 封面
- 名称
- slug
- 可见性
- 照片数量
- 进入/预览/配置操作

事件：

```ts
select: [galleryId: string]
enter: [galleryId: string]
preview: [slug: string]
configure: [galleryId: string]
```

### 9.3 `GalleryPhotoGrid.vue`

负责：

- 渲染照片列表
- 空状态
- 处理状态显示
- 派发照片操作

事件：

```ts
open: [index: number]
setCover: [photo: Photo]
delete: [photo: Photo]
```

### 9.4 `GalleryUploadDropzone.vue`

负责：

- 拖拽事件
- 文件选择
- 拖拽态视觉
- 上传进度展示

不负责：

- 调用 API
- 任务轮询
- 修改空间数据

---

## 10. 实施任务分解

### Task 1：路由和空页面

文件：

```text
apps/gallery-admin/src/main.ts
apps/gallery-admin/src/views/GalleryWorkspaceView.vue
```

完成：

- 新增命名路由 `gallery-workspace`
- 读取 `route.params.id`
- 显示返回总览和加载状态
- 直接访问 URL 不报错

验收：

```text
/app/galleries/<existing-id>
```

能打开一个独立页面。

### Task 2：总览导航

文件：

```text
apps/gallery-admin/src/views/OverviewView.vue
```

完成：

- “进入空间”调用命名路由
- “继续编辑”调用命名路由
- 创建成功后跳转新工作台
- 移除总览页照片管理区
- 保留总览页的空间卡片和创建入口

验收：

- 点击卡片后 URL 变化
- 浏览器刷新后仍停留在工作台
- 返回总览后列表可重新加载

### Task 3：工作台加载空间和照片

第一轮可以复用：

```text
GET /api/galleries
GET /api/galleries/:id/photos
```

完成：

- 加载状态
- 找不到空间状态
- 照片空状态
- 照片列表
- 当前空间标题和 slug

验收：

- 使用已有空间 ID 能显示真实空间
- 使用不存在 ID 能显示错误状态
- 空照片空间能显示上传引导

### Task 4：迁移上传和照片操作

将现有逻辑迁移或抽取：

- `processUploadFiles`
- `handleDrop`
- `handleFileInput`
- `handleSetCover`
- `promptDeletePhoto`
- `confirmDeletePhoto`
- `openLightbox`

验收：

- 单次上传和批量上传可用
- 任务轮询可用
- 设置封面后卡片和空间封面更新
- 删除照片后列表和数量更新
- Lightbox 可打开、关闭和操作

### Task 5：迁移分享、配置和 Viewer

完成：

- 分享链接 Modal 移到工作台
- `goToConfig()` 指向当前空间配置页
- `openViewer()` 指向 `/g/:slug`
- 总览卡片仍可直接预览

验收：

- 分享链接可生成和复制
- 配置页可从工作台进入
- Viewer 在新窗口打开
- 未选空间时不会调用分享或 Viewer API

### Task 6：删除总览页重复状态

完成：

- 总览不再维护 `photos`
- 总览不再维护上传状态
- 总览不再维护 Lightbox 状态
- 总览不再维护照片删除状态
- 总览不再维护分享 Modal 状态

保留：

- 空间列表
- 创建 Modal
- 当前用户状态
- 总览加载状态

这是本阶段最重要的架构验收点。

### Task 7：配置页返回上下文

文件：

```text
apps/gallery-admin/src/views/GalleryConfigPanel.vue
```

完成：

- 增加“返回空间”按钮
- 优先返回 `/app/galleries/:id`
- 不改变当前配置保存逻辑

### Task 8：移动端与可访问性

完成：

- 390px 无横向滚动
- 返回按钮可见
- 工作台操作按钮纵向堆叠
- 上传区域适配移动端
- 所有纯图标按钮具备 `aria-label`
- 卡片和按钮有键盘 focus 状态

---

## 11. 测试方案

### 11.1 前端路由测试

如果项目当前没有前端测试框架，至少执行手工验收；后续可引入 Vitest，但不应为了本阶段强行引入大型测试依赖。

手工路径：

1. 登录
2. 进入 `/app/`
3. 点击已有空间的“进入空间”
4. 确认 URL 为 `/app/galleries/:id`
5. 刷新页面
6. 确认空间和照片仍显示
7. 点击“返回我的空间”
8. 确认回到 `/app/`
9. 点击“新建空间”
10. 创建一个空间
11. 确认自动进入新空间工作台

### 11.2 工作台功能测试

- 空照片空间显示上传空状态
- 拖拽上传有效图片
- 选择多张图片上传
- 处理进度更新
- 处理完成后照片出现
- 设置封面
- 删除照片
- 打开 Lightbox
- 生成和复制分享链接
- 进入 3D 配置
- 打开预览空间

### 11.3 异常测试

- 直接访问不存在的 UUID
- 访问其他工作区的空间 ID
- API 返回 401
- API 返回 403
- API 返回 404
- 上传格式错误
- 上传请求中断
- 缩略图任务失败
- Viewer 服务不可用

### 11.4 响应式测试

至少验证：

```text
1440 × 900  桌面
1024 × 768  平板
390 × 844   移动
```

重点：

- URL 和空间名称不撑破布局
- 操作按钮不会溢出
- 上传区域不产生横向滚动
- Modal 不超过视口
- 返回总览入口始终可用

---

## 12. 回滚与风险控制

### 12.1 回滚边界

本阶段前端改动建议限制在：

```text
apps/gallery-admin/src/main.ts
apps/gallery-admin/src/views/OverviewView.vue
apps/gallery-admin/src/views/GalleryWorkspaceView.vue
apps/gallery-admin/src/views/GalleryConfigPanel.vue
apps/gallery-admin/src/components/gallery-workspace/*
apps/gallery-admin/src/composables/useGalleryWorkspace.ts
apps/gallery-admin/src/styles.css
```

第一轮不修改：

```text
apps/gallery-api/**
packages/gallery-contracts/**
```

除非方案 B 的单空间详情 API 被单独批准并作为后续子任务实施。

### 12.2 已知风险

#### 风险：总览和工作台状态重复

控制方法：完成 Task 6 后，Overview 不再持有照片和上传状态。

#### 风险：创建后出现重复请求

控制方法：创建成功后直接导航，不在总览继续 `selectGallery`。

#### 风险：卡片按钮触发两次行为

控制方法：主卡片导航和内部按钮使用明确事件边界，保留 `@click.stop`。

#### 风险：深链找不到空间

控制方法：工作台加载不能依赖总览已加载；MVP 用列表接口查找，后续增加详情接口。

#### 风险：移动端工作台过长

控制方法：照片工作区操作区使用全宽按钮，上传说明使用移动端短文案。

#### 风险：复制逻辑导致修复不一致

控制方法：先抽取 composable 或组件，再删除 Overview 中旧逻辑，不保留两套行为实现。

---

## 13. 完成定义 Definition of Done

### 产品行为

- [ ] “进入空间”会改变 URL
- [ ] 工作台可通过深链独立打开
- [ ] 创建空间后自动进入工作台
- [ ] 工作台可返回总览
- [ ] 总览不再渲染照片管理内容
- [ ] 预览、配置、分享均位于正确页面上下文

### 数据和安全

- [ ] 所有请求继续通过 `apiFetch`
- [ ] 前端不拼接 tenant ID
- [ ] 后端现有租户隔离行为未被绕过
- [ ] 401、403、404 有明确 UI
- [ ] 不向访客页面输出内部字段

### 功能

- [ ] 上传和轮询正常
- [ ] 设置封面正常
- [ ] 删除照片正常
- [ ] Lightbox 正常
- [ ] 分享链接正常
- [ ] 配置跳转正常
- [ ] Viewer 跳转正常

### 质量

- [ ] `npm --prefix apps/gallery-admin run build` 通过
- [ ] 1440px、1024px、390px 验证通过
- [ ] 390px 无横向滚动条
- [ ] 新增图标按钮有 `aria-label`
- [ ] 键盘焦点可见
- [ ] 无新增控制台错误
- [ ] 未覆盖用户已有未提交改动

---

## 14. 后续顺序

完成本阶段后再进入：

```text
1. GET /api/galleries/:id 单空间详情接口
2. GallerySummary.photoCount 服务端聚合
3. Gallery.updatedAt 和真实最近编辑
4. Gallery.status 发布状态机
5. OWNER / EDITOR / VIEWER 权限
6. 分享链接撤销和有效期管理
7. 上传任务中心和失败重试
8. 访客页面的 SEO、锁定和错误状态
```

不要在单空间工作台尚未稳定前提前实现完整权限、发布和上传任务中心。当前最重要的产品里程碑是：

> 一个普通创作者可以创建空间、进入空间、上传截图、设置封面、配置 3D 效果，并把空间通过稳定 URL 分享给访客。
