# `/app/` 相册空间工作台 UI 落地实施指导

> 文档类型：前端 UI/UX 实施规范  
> 目标页面：`apps/gallery-admin` 的 `/app/`  ���> 设计目标：在不改变现有业务能力和 API 契约的前提下，将页面升级为“沉浸式 3D 相册工作台”  
> 适用对象：产品、设计、Vue 前端、测试

---

## 1. 实施目标与范围

### 1.1 目标

将当前“标题 + 统计胶囊 + 空间卡片 + 重复详情面板”的布局，重组为：

1. 页面标题和唯一主操作
2. 全局筛选/同步状态
3. 最近编辑空间快捷入口
4. 空间卡片网格
5. 选中空间的照片管理工作区

核心体验路径：

```text
进入工作台 → 找到最近空间 → 继续编辑 / 预览 → 管理照片
```

### 1.2 保留的业务能力

以下能力必须保持不变：

- 登录、注册、退出登录
- 加载相册空间列表
- 创建相册空间
- 选择相册空间并加载照片
- 批量上传、拖拽上传、上传进度和任务轮询
- 设置照片封面
- 删除照片及确认弹窗
- 生成和复制分享链接
- 跳转 3D 视觉配置
- 打开 3D Viewer
- Lightbox 查看照片
- Toast 成功、失败、提示反馈

本次只改变页面结构、视觉样式、交互入口和响应式布局，不改变后端接口路径和数据模型。

---

## 2. 当前代码映射

主要实现文件：

| 区域 | 当前文件 | 实施说明 |
| --- | --- | --- |
| 页面逻辑与模板 | `apps/gallery-admin/src/views/OverviewView.vue` | 主要改造文件 |
| 全局布局和设计变量 | `apps/gallery-admin/src/styles.css` | 检查容器宽度、颜色、断点和基础按钮 |
| 图标 | `apps/gallery-admin/src/components/Icon.vue` | 优先复用现有图标，必要时补充 `more`、`clock`、`eye` |
| 删除确认 | `apps/gallery-admin/src/components/ConfirmModal.vue` | 保留，统一视觉层级 |
| 图片灯箱 | `apps/gallery-admin/src/components/LightboxModal.vue` | 保留，优化移动端尺寸即可 |
| Toast | `apps/gallery-admin/src/components/ToastContainer.vue` | 保留 |
| 认证 | `OverviewView.vue` / `useAuth.ts` | 本次不改业务行为 |

建议在改造前先确认 `styles.css` 中以下变量是否已存在，并统一为本规范中的值：

- `--brand-primary`
- `--text-primary`
- `--text-secondary`
- `--text-tertiary`
- `--font-mono`
- `--radius-md`、`--radius-lg`、`--radius-xl`
- `--shadow-*`

---

## 3. 推荐页面信息架构

### 3.1 已登录页面结构

```text
.dashboard-root
├── WorkspaceHeader
│   ├── 品牌 / 当前模块
│   ├── 引擎状态
│   └── 用户菜单
├── PageIntro
│   ├── 页面标题
│   ├── 页面副标题
│   └── 新建空间（唯一 Primary）
├── WorkspaceToolbar
│   ├── 全部空间
│   ├── 最近编辑
│   ├── 公开空间
│   └── 最近同步 / 刷新
├── RecentWorkspace（仅 galleries.length > 0）
│   ├── 最近编辑空间名称
│   ├── 照片数量和更新时间
│   └── 继续编辑 / 预览
├── GallerySection
│   ├── 区块标题与数量
│   └── GalleryGrid
│       ├── GalleryCard × N
│       └── CreateGalleryCard
└── PhotoWorkspace（仅 selectedGallery 存在）
    ├── PhotoWorkspaceHeader
    ├── UploadDropzone
    ├── PhotoGrid
    └── EmptyPhotosState
```

### 3.2 登录页

登录页不属于本次重构重点。只做兼容性处理：

- 保持现有登录、注册字段和默认测试账号行为
- 复用新的品牌色和圆角规范
- 移动端保证表单不产生横向滚动

---

## 4. 模板改造指导

### 4.1 顶部工作区导航

当前页面由 `App.vue` 提供的顶部导航和 `OverviewView.vue` 的主体共同组成。建议将顶部导航调整为以下优先级：

#### 桌面端

左侧：

```text
VIE Gallery  ·  3D Studio  ·  相册空间
```

中间：

```text
● Cloud Engine Active   ·   WebGL 3D
```

右侧：

```text
头像 + Admin Tester + 下拉菜单
```

“退出登录”从常驻按钮改为用户菜单项，避免顶栏操作过多。

#### 移动端

只保留：

```text
[V] VIE Gallery                                  [⋯]
```

以下内容在移动端隐藏或收进菜单：

- `3D STUDIO` 长标签
- `Cloud Engine Active · WebGL 3D`
- 管理员副标题
- 顶部“相册空间”胶囊导航
- 常驻退出登录按钮

必须确保顶栏不会因为中文换行形成竖排文字。

---

### 4.2 页面标题区

将当前标题文案替换为：

```text
相册空间
管理和编辑你的 3D 沉浸式相册
```

右侧仅保留：

```text
+ 新建空间
```

建议模板语义：

```html
<header class="page-intro">
  <div>
    <p class="eyebrow">WORKSPACE</p>
    <h1>相册空间</h1>
    <p>管理和编辑你的 3D 沉浸式相册</p>
  </div>
  <button class="btn btn-primary">新建空间</button>
</header>
```

`WORKSPACE` 为辅助英文标签，可选；如果产品希望更纯中文，可移除。

---

### 4.3 全局工具栏

当前“空间总数 + 当前相册照片”应拆分职责。

推荐模板：

```html
<section class="workspace-toolbar" aria-label="空间筛选与同步状态">
  <div class="workspace-filters" role="tablist">
    <button class="filter-tab is-active">全部空间 <span>1</span></button>
    <button class="filter-tab">最近编辑</button>
    <button class="filter-tab">公开空间</button>
  </div>
  <button class="refresh-action">最近同步 · 刷新</button>
</section>
```

注意：

- 当前照片数量属于选中空间，不放在全局工具栏
- 筛选按钮初期可以只做视觉入口；如果尚未实现筛选逻辑，应在文档和代码中标注为后续能力
- `刷新数据` 保持调用 `loadGalleries`
- 刷新中使用现有 `loading` 状态和旋转图标

---

### 4.4 最近编辑空间模块

当 `galleries.length > 0` 时展示，默认使用 `selectedGallery`；如果未来增加更新时间字段，则改为真正的最近编辑空间。

推荐信息：

```text
继续你的创作
自然风光摄影空间 · 2 张照片

[继续编辑] [预览空间]
```

按钮行为：

- `继续编辑`：调用 `selectGallery(selectedGallery.id)` 并滚动到照片工作区
- `预览空间`：复用 `openViewer(selectedGallery.slug)`

如果当前没有可靠的更新时间字段，不要虚构日期。可以使用：

```text
当前选中空间 · 2 张照片
```

---

### 4.5 空间卡片

#### 结构

空间卡片必须继续支持点击选中空间，但卡片内部操作不要与点击行为冲突。

```html
<article class="gallery-card">
  <button class="gallery-card-main" @click="selectGallery(gallery.id)">
    <div class="gallery-cover">
      <img ... />
      <span class="visibility-badge">PUBLIC</span>
    </div>
    <div class="gallery-card-body">
      <h3>{{ gallery.name }}</h3>
      <code>/g/{{ gallery.slug }}</code>
      <p>{{ photoCount }} 张照片 · 当前空间</p>
    </div>
  </button>
  <div class="gallery-card-footer">
    <button class="btn btn-secondary">进入空间</button>
    <button class="icon-action-btn" aria-label="更多操作">...</button>
  </div>
</article>
```

#### 操作约定

- 主行为：`进入空间`，调用 `selectGallery`
- 3D 配置：进入更多菜单或保留为次级按钮
- 3D Viewer：保留为卡片底部次级按钮，或进入更多菜单
- 删除空间等破坏性操作不在卡片首屏展示

#### 创建卡片

当 `galleries.length > 0` 时，在网格中追加一张创建卡片：

```text
+ 新建空间
创建另一个 3D 相册空间
```

点击后复用 `showCreateModal = true`。

#### 空状态

仅当 `!loading && galleries.length === 0` 时显示：

```text
还没有照片空间
创建一个属于你的 3D 沉浸式相册，
上传照片并选择你的展示风格。

[创建第一个空间]
```

按钮复用 `showCreateModal = true`。

---

### 4.6 照片工作区

当前 `photo-management-panel` 保留为主要工作区，但需要从“重复详情卡片”改为“选中空间工作区”。

标题区域建议：

```text
自然风光摄影空间                         PUBLIC
/g/nature-2026nature-2026 · 2 张照片

[3D 视觉配置] [分享链接] [3D 空间漫游]
```

按钮优先级：

1. `3D 空间漫游`：Primary
2. `分享链接`：Secondary
3. `3D 视觉配置`：Secondary

移动端按钮改为两行或全宽堆叠，禁止超出容器。

---

### 4.7 上传区域

保留现有拖拽上传、文件选择和上传进度逻辑。

视觉要求：

- 采用虚线边框和低对比度背景
- 正常态突出“拖拽或选择文件”
- 上传态只展示进度条、状态文案和百分比
- `drag-over` 状态增加品牌色边框和浅绿色背景
- 文案避免过长导致移动端溢出

移动端推荐文案：

```text
点击选择照片
也可以将照片拖拽到此处
JPG、PNG、WebP · 自动生成 3D 缩略图
```

桌面端可继续使用当前完整说明。

---

## 5. 设计 Token

建议在 `styles.css` 或页面作用域中统一以下变量：

```css
:root {
  --brand-primary: #08b77b;
  --brand-deep: #087a5c;
  --brand-soft: #e7f8f0;
  --surface-page: #f6faf8;
  --surface-card: #ffffff;
  --text-primary: #17231f;
  --text-secondary: #6b7d75;
  --text-tertiary: #91a29b;
  --border-subtle: #ddeb e5;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --shadow-card: 0 12px 30px rgba(28, 86, 67, 0.08);
  --shadow-float: 0 16px 36px rgba(28, 86, 67, 0.14);
}
```

> 注意：`--border-subtle` 的实际值应写成合法 CSS 色值 `#ddebe5`，上方空格仅用于强调检查项。

### 使用原则

- 主绿色只用于 Primary、选中态、状态标签和关键图标
- 普通按钮使用白底 + 低对比度边框
- 删除发光、过强渐变和多层绿色阴影
- 页面背景接近白色，保持照片内容成为视觉主体
- 统一圆角，不在同一层级混用过多尺寸

---

## 6. 响应式规范

### 6.1 桌面端（≥ 1200px）

```css
.dashboard-root {
  width: min(100% - 80px, 1240px);
  margin-inline: auto;
}

.gallery-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
```

- 页面最大宽度：1200～1280px
- 左右内边距：40～56px
- 空间卡片：3 列
- 最近编辑模块：横向布局
- 照片网格：4～5 列，视容器宽度自适应

### 6.2 平板端（768～1199px）

- 页面左右内边距：28～36px
- 空间卡片：2 列
- 用户信息简化为头像 + 菜单
- 操作按钮允许换行
- 照片网格：3～4 列

### 6.3 移动端（≤ 767px）

```css
@media (max-width: 767px) {
  .dashboard-root {
    width: auto;
    margin: 0;
    padding-inline: 16px;
    gap: 24px;
    overflow-x: hidden;
  }

  .page-intro {
    display: block;
  }

  .page-intro .btn-primary {
    width: 100%;
    margin-top: 16px;
  }

  .gallery-grid,
  .photo-grid {
    grid-template-columns: 1fr;
  }

  .panel-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
```

必须验证：

- 页面宽度 390px 时无横向滚动条
- 顶部品牌和用户菜单不被裁切
- 中文标题最多自然换行，不出现竖排导航
- 卡片按钮不挤压空间名称
- 照片上传说明不会超出容器
- Modal 在移动端左右至少保留 16px 间距

---

## 7. 交互与状态规范

### 7.1 加载状态

- 初次加载：空间区显示 skeleton 或低干扰 loading
- 刷新：只旋转刷新图标，不让整页闪烁
- 选择空间：卡片显示 selected 状态，照片工作区更新
- 上传：沿用 `uploading`、`uploadProgress`、`uploadStatusText`

### 7.2 错误状态

- 请求错误继续使用 Toast
- 表单错误显示在字段区域上方
- 错误信息不能只使用颜色表达
- 上传失败后保留上传区域，允许用户立即重试

### 7.3 成功反馈

继续复用现有 Toast 文案机制：

- 创建成功：`空间 “{name}” 创建成功！`
- 上传成功：`成功上传并处理 {count} 张照片！`
- 设置封面：`已成功设为相册封面！`
- 复制链接：`分享链接已复制到剪贴板！`

### 7.4 键盘与无障碍

- 卡片主区域应支持键盘聚焦和 Enter 激活
- 所有纯图标按钮必须有 `aria-label`
- PUBLIC / PRIVATE 状态同时显示文字和图标
- 删除确认弹窗必须可通过 Escape 关闭
- 颜色对比度满足正文和按钮文字可读性要求
- 不使用 hover 作为唯一操作入口：移动端必须能通过点击访问操作

---

## 8. 组件拆分建议

第一阶段可以继续维护在 `OverviewView.vue`，但推荐在布局稳定后拆分：

```text
apps/gallery-admin/src/components/overview/
├── WorkspaceHeader.vue
├── WorkspaceToolbar.vue
├── RecentWorkspaceCard.vue
├── GalleryCard.vue
├── CreateGalleryCard.vue
├── EmptyGalleryState.vue
├── PhotoWorkspace.vue
└── UploadDropzone.vue
```

### 拆分原则

- 组件只负责展示和事件派发
- API 调用和状态编排暂时保留在 `OverviewView.vue`
- `GalleryCard` 通过 props 接收 `gallery`、`photoCount`、`selected`
- `GalleryCard` 通过 emits 派发 `select`、`configure`、`preview`、`more`
- `UploadDropzone` 通过 emits 派发 `drop`、`file-change`
- 不在展示组件中重复请求空间或照片数据

推荐事件接口：

```ts
// GalleryCard
select: [galleryId: string]
configure: [galleryId: string]
preview: [slug: string]
more: [galleryId: string]

// UploadDropzone
drop: [files: FileList]
fileChange: [files: FileList]
```

---

## 9. 分阶段实施顺序

### Phase 0：基线与保护

1. 确认当前 `/app/` 登录态和已登录态均可访问
2. 记录现有 API 调用和关键交互
3. 确认现有测试或手工验证路径
4. 不在本阶段改业务逻辑

### Phase 1：页面骨架

1. 调整 `OverviewView.vue` 已登录模板顺序
2. 增加 `RecentWorkspace` 区域
3. 将工具栏改为全局筛选/同步状态
4. 将空间卡片和照片工作区的职责分开
5. 增加创建空间卡片

### Phase 2：卡片与操作层级

1. 重做 `gallery-card` 内容结构
2. 增加图片数量信息
3. 将进入空间设为主操作
4. 将配置、预览和危险操作降级或收进更多菜单
5. 统一按钮、徽章、边框和阴影

### Phase 3：响应式

1. 重构移动端顶部导航
2. 修复 390px 宽度下的横向溢出
3. 调整标题区、工具栏和操作按钮布局
4. 调整照片工作区和上传区
5. 检查 Modal、Lightbox 和 Toast 的移动端表现

### Phase 4：细节与动效

1. 增加卡片 hover / focus 状态
2. 增加刷新、上传、创建的反馈动效
3. 补齐 aria-label 和键盘焦点
4. 处理长标题、长 slug 和无封面图片
5. 清理重复 CSS 和过强的玻璃拟态效果

### Phase 5：验证与回归

1. 桌面端 1440px 验证
2. 平板端 1024px 验证
3. 移动端 390px 验证
4. 空空间状态验证
5. 单空间状态验证
6. 多空间状态验证
7. 上传、删除、分享、配置跳转回归

---

## 10. 验收标准

### 10.1 视觉验收

- 页面首屏能在 3 秒内识别“新建空间”和“继续编辑”两个主要路径
- 单空间状态不再出现明显的大面积无意义空白
- 同一空间不以重复卡片和重复详情形式表达
- 主绿色仅用于关键操作和状态
- 卡片、按钮、徽章的圆角和阴影统一
- 图片封面成为卡片的主要视觉内容

### 10.2 响应式验收

- 390 × 844 viewport 无横向滚动条
- 顶部品牌、用户菜单均可见
- 页面标题和卡片标题不发生异常竖排
- 所有主要按钮可点击且不被裁切
- 照片工作区操作按钮在移动端不溢出
- Modal 和 Lightbox 不超出视口

### 10.3 功能验收

- 点击“新建空间”仍打开创建 Modal
- 创建成功后仍自动加载并选中新空间
- 点击空间卡片仍加载对应照片
- 点击“继续编辑”能定位到照片工作区
- 点击“预览空间”仍打开 Viewer
- 上传、轮询、进度和 Toast 行为不变
- 设置封面、删除照片、分享链接和配置跳转行为不变

### 10.4 无障碍验收

- 所有图标按钮具备可读标签
- 键盘可以访问页面主要操作
- 选中状态不仅依赖颜色
- 错误信息具备清晰文字说明
- 焦点状态不会被 `outline: none` 完全移除

---

## 11. 不建议的实现方式

以下做法会破坏本方案目标，应避免：

1. 继续在全局工具栏显示“当前相册照片”作为全局指标
2. 同时保留空间卡片和一张重复的空间摘要卡片
3. 给所有按钮使用实心绿色
4. 通过缩小字体强行解决移动端溢出
5. 依靠 hover 才显示移动端关键操作
6. 在模板中为了展示日期而伪造更新时间
7. 为了视觉重构修改 API 路径或后端数据模型
8. 将上传、分享、删除逻辑复制到多个子组件
9. 使用横向滚动来掩盖顶部导航布局问题
10. 使用过强的绿色阴影、玻璃模糊和渐变叠加照片内容

---

## 12. 开发交付清单

提交 UI 改造前，前端应提供：

- [ ] `/app/` 已登录桌面截图
- [ ] `/app/` 390px 移动截图
- [ ] 空空间截图
- [ ] 单空间截图
- [ ] 多空间截图
- [ ] 上传中的截图
- [ ] 创建 Modal 截图
- [ ] `npm` 构建通过
- [ ] 现有功能回归通过
- [ ] 无横向滚动条
- [ ] 无控制台错误
- [ ] 所有新增图标按钮具备 aria-label
- [ ] 说明是否拆分了 overview 子组件

---

## 13. 推荐提交拆分

为了降低回归风险，建议按以下提交拆分：

```text
feat(admin): reorganize gallery workspace layout
feat(admin): refine gallery cards and workspace actions
feat(admin): add responsive mobile workspace layout
feat(admin): polish gallery workspace states and accessibility
```

每个提交尽量只覆盖一个层面，不要在同一提交中同时修改 API、数据结构和大范围 UI 样式。
