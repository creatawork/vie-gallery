# 展厅配置页：右侧真预览，去掉假展厅

日期：2026-09-09
范围：`apps/gallery-admin/src/views/GalleryConfigPanel.vue`；访客端仅保留已有 `VIE_PREVIEW_READY` / `postMessage` 握手（`apps/gallery-viewer/src/App.vue`）
不改：登录页、我的空间、展厅管理、成员管理；不恢复赛博 3D Studio、设备模拟器

## 目标

配置页右侧不再用 CSS 假展厅和「视角分类」菜单撑场面。能连上访客端时嵌真实 WebGL；连不上时用诚实空态。左栏改配置后，已接通的预览继续热更新。

## 右侧视口

同一块圆角视口，只出现两种状态，互斥、不叠假舞台：

1. **已接通**：访客端 iframe 铺满。左栏改布局 / 氛围 / 粒子 / Bloom 后，向 iframe `postMessage`：`VIE_CONFIG_UPDATE`、`VIE_LAYOUT_CHANGE`、`VIE_PRESET_CHANGE`。
2. **未接通**：浅绿底空态，文案说明实时预览需要访客端（本地为 5174），主按钮「新窗口打开」。不挂 iframe。

角上只留两个玻璃按钮：

- **新窗口预览**：始终 `window.open(previewUrl)`，不依赖嵌入是否成功
- **全屏**：沿用现有 `is-full`（隐藏顶栏与左栏，放大视口）

## 删除

- CSS 假展厅：封面图、藤蔓、悬浮画框、`PREVIEW_FRAMES`、按布局排画框的 CSS
- 视角菜单：预览视角 / 俯视视角 / 访客视角 / 新窗口打开访客端
- 左右箭头、底部选择/观察/立方工具条、右下角小地图
- 仅服务于上述装饰的状态：`cameraView`、`viewMenuOpen`、`viewportTool`、`cameraShift` 及对应样式

## 嵌入判定

- 本地 Admin 端口 **5173**、访客端 **5174**：嵌入 `http://<host>:5174/g/{slug}`
- Admin 已占用 **5174 或 5175**：不嵌入，走空态；新窗口仍指向 `:5174/g/{slug}`
- 非上述开发端口（生产）：嵌入同源 `/g/{slug}`
- 仅当 iframe 发来 `VIE_PREVIEW_READY` 后，才标为已接通并推送当前配置
- 嵌入后 8 秒仍无握手：卸掉 iframe，回到空态，不把半截 Admin 页面当成预览

保存 / 回滚 / 重置后，若 iframe 已接通，再推一次配置。iframe 不存在时，`refreshLivePreview()` 为空操作。

## 明确不做

- 不把空态做成第二套假展厅
- 不恢复视角分类、设备模拟器、赛博 Studio
- 不改另外三页与登录页

## 验收

- 配置页右侧看不到假展厅、视角下拉、箭头、工具条、小地图
- Admin 在 5174：空态 + 新窗口 / 全屏；改氛围不再移动 CSS 画框
- Admin 在 5173 且访客端在 5174：右侧为真 WebGL；点「森林之梦」等预设，iframe 内氛围跟着变
- 全屏只放大视口；退出后左栏仍在
