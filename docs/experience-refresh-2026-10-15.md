# 全流程体验优化 · 2026-10-15

本轮依照用户对整体项目的重设计授权，以实际使用效果替换旧视觉约束。功能边界仍为摄影作品管理、布展、预览、发布和访客浏览。

## 视觉与操作

- 管理端统一暖纸白、深炭文字、低饱和青绿操作色；照片成为主要视觉内容。移除全局输入呼吸、按钮涟漪、卡片旋转和旧摄影背景叠层。
- 登录采用摄影空间与表单双栏，移动端保留完整表单；注册、找回、重置密码采用一致的标签、加载与错误反馈。
- 空间总览、照片管理、配置、成员与共用弹窗采用统一颜色、字体、圆角和焦点反馈。
- 工作区以“作品 → 风格 → 发布”串联操作；步骤可定位，发布状态、失败恢复与访问设置保持可见；版本说明作为可选操作保留。
- 访客端采用纸白平面展览与深炭空间壳；完善加载、空态、密码、分享、全屏与灯箱，支持触摸、键盘和减少动效。

## 行为修复

- 发布前读取最新就绪状态，阻断失败与未设置访问密码的发布；创建密码保护展厅时保存独立访问密码，并处理部分失败。
- 已发布展厅变为缺密码的保护状态时撤回到草稿，避免生成访客无法打开的展厅。
- 首发创建推荐场景草稿和配置版本，访客消费明确的发布配置。
- 修复空间场景自动旋转配置不同步、暂停仍接受背景导航、空场景错误索引、hover 缩放争用与空闲后巡展帧率下降。
- 点击涟漪使用画布坐标与场景活动时间；触屏、拖拽和减少动效不会发射鼠标拖尾；自适应质量实际切换低分辨率全景纹理。
- 菜单与模态支持 Esc、焦点约束和焦点归还；重置成功将焦点移动到后续登录操作。

## 验证入口

- `npm run test:viewer:unit`
- `npm run build`（包括两个前端的类型检查）
- `apps/gallery-admin`：`npx playwright test --reporter=list`，需管理端与展示端同源且展示端测试构建开启 `VITE_VIEWER_DIAGNOSTICS=true`。
- `apps/gallery-viewer`：`npx playwright test --reporter=list`，独立启动 15174 测试服务。
- 后端 GalleryFacade / GalleryController 的发布、访问保护与首发就绪测试。

截图分别位于 `acceptance-shots/experience-refresh/`、`acceptance-shots/production-refresh/`、`acceptance-shots/production-viewer-20261015/`。浏览器验收使用本地 API 夹具，不代表已部署到线上或完成真实外部存储、邮件服务联调。

## 界面截图

- [登录 · 桌面](../acceptance-shots/experience-refresh/login-1440.png)
- [登录 · 手机](../acceptance-shots/experience-refresh/login-390.png)
- [展厅工作区 · 桌面](../acceptance-shots/production-refresh/admin-workspace-desktop.png)
- [展厅工作区 · 手机](../acceptance-shots/production-refresh/admin-workspace-mobile.png)
- [配置预览失败恢复 · 手机](../acceptance-shots/production-refresh/admin-config-recovery-mobile.png)
- [访客平面展览](../acceptance-shots/production-viewer-20261015/editorial-1440.png)
- [访客空间浏览 · 手机](../acceptance-shots/production-viewer-20261015/spatial-mobile.png)

## 实测边界

浏览器验证覆盖 Chromium 桌面与移动视口、减少动效、500 张照片分页和纹理预算；尚未取得真实低端手机 GPU 的性能数据。正式构建仍保留 Three.js 既有的大分包提示，未通过提高告警阈值隐藏。真实存储、邮件与部署环境需要独立联调。

## 最终验证结果

- `npm run verify`：文档链接、工作区类型检查、两个前端正式构建通过。
- 展厅与共享配置单元测试：120 项通过。
- 管理端同源双应用 Chromium 回归：69 项通过。
- 访客端 Chromium 完整回归：21 项通过。
- 后端 GalleryFacade / GalleryController 定向测试：20 项通过，无失败、错误或跳过。
- 最终差异检查通过；没有新增类型忽略、跳过测试或降低预算阈值。正式构建不安装浏览器测试诊断入口。

完整回归暴露并修复了照片编排入口遗漏、Toast 关闭点击区域不足、旧按钮定位，以及自动质量测试在可选后处理就绪前采样的问题。照片身份、分辨率、粒子、纹理、并发和重试的核心断言保留。
