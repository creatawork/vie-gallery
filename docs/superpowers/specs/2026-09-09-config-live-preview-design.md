# 展厅配置页：右侧真预览，去掉假展厅

日期：2026-09-09
范围：`apps/gallery-admin/src/views/GalleryConfigPanel.vue`、`apps/gallery-admin/src/lib/preview.ts`；访客端 `VIE_PREVIEW_READY` / `postMessage` 握手（`apps/gallery-viewer/src/App.vue`）
不改：登录页外观；不恢复赛博 3D Studio、设备模拟器

## 目标

配置页右侧不再用 CSS 假展厅和「视角分类」菜单撑场面。能连上访客端时嵌真实 WebGL；连不上时用诚实空态。左栏改配置后，已接通的预览继续热更新。草稿馆必须能预览，不能打开公开访客页后 404。

## 右侧视口

同一块圆角视口，只出现两种状态，互斥、不叠假舞台：

1. **已接通**：访客端 iframe 铺满。左栏改布局 / 氛围 / 粒子 / Bloom 后，向 iframe `postMessage`：`VIE_CONFIG_UPDATE`、`VIE_LAYOUT_CHANGE`、`VIE_PRESET_CHANGE`。
2. **未接通**：诚实空态，主按钮「新窗口打开」。不挂半截 Admin 页面当预览。文案按原因区分，**不出现端口号**：
   - 权限 / 登录失效 / 找不到展厅：接口错误原文
   - 嵌入超时：展厅预览没有响应，请确认预览页已启动
   - Admin 占用访客端口：当前窗口无法嵌入，请用新窗口打开
   - 其余：正在连接内部预览

角上只留两个玻璃按钮：

- **新窗口预览**：签发预览令牌后 `window.open`，不依赖嵌入是否成功
- **全屏**：沿用现有 `is-full`（隐藏顶栏与左栏，放大视口）

## 删除

- CSS 假展厅：封面图、藤蔓、悬浮画框、`PREVIEW_FRAMES`、按布局排画框的 CSS
- 视角菜单：预览视角 / 俯视视角 / 访客视角 / 新窗口打开访客端
- 左右箭头、底部选择/观察/立方工具条、右下角小地图
- 仅服务于上述装饰的状态：`cameraView`、`viewMenuOpen`、`viewportTool`、`cameraShift` 及对应样式

## 创作者预览令牌

- `POST /api/galleries/{id}/preview-token` 签发 15 分钟内存令牌
- 嵌入与新窗口 URL 均为 `/g/{slug}?preview=<token>`；嵌入另加 `embed=preview`
- 公开端 `X-Preview-Token` 或 `?preview=` 有效时可看 DRAFT 馆和当前配置草稿
- 无令牌时未发布相册仍 404，不污染公开分享 URL

## 嵌入判定

- 本地 Admin 端口 **5173**：嵌入访客端同源主机 `:5174/g/{slug}?preview=…&embed=preview`
- Admin 已占用 **5174 或 5175**：不嵌入，走空态；新窗口仍指向访客端带 preview 的 URL
- 非上述开发端口（生产）：嵌入同源 `/g/{slug}?preview=…`
- 仅当 iframe 发来 `VIE_PREVIEW_READY` 后，才标为已接通并推送当前配置（含草稿）
- 嵌入后超时仍无握手：卸掉 iframe，回到空态
- iframe 内 `engine.init(slug)` 失败时允许 `engine.init()` 后仍发出就绪握手，避免草稿馆把嵌入判成失败

保存 / 回滚 / 重置后，若 iframe 已接通，再推一次配置。iframe 不存在时，`refreshLivePreview()` 为空操作。

## 明确不做

- 不把空态做成第二套假展厅
- 不恢复视角分类、设备模拟器、赛博 Studio
- 不在 UI 文案中写死本地端口号

## 验收

- 配置页右侧看不到假展厅、视角下拉、箭头、工具条、小地图
- 草稿馆「新窗口预览」打开后是馆名，不是「相册空间未找到」
- 不含 `preview` 的公开 URL 对未发布相册仍 404
- Admin 在访客端口：空态 + 新窗口 / 全屏；改氛围不再移动 CSS 画框
- Admin 在工作台端口且访客端已启动：右侧为真 WebGL；点预设后 iframe 内氛围跟着变
- 空态和超时文案不出现端口号
- 全屏只放大视口；退出后左栏仍在
