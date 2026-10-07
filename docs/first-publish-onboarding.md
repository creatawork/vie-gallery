# 首发布引导：默认推荐场景与一键发布（2026-10-07）

## 行为总览
- **推荐场景**：`packages/gallery-contracts/src/viewerPresets.ts` 导出 `RECOMMENDED_SCENE_PRESET`（当前 `starry-night` 星空夜曲）与 `createRecommendedViewerConfig()`。三个触点共用这一事实源：
  1. admin 配置面板：`GET /viewer-config` 404 时以推荐场景作为初始草稿（`useViewerConfigEditor.ts`、`GalleryConfigPanel.vue`）。
  2. 访客端：相册没有任何服务端配置时，`ConfigManager` 兜底渲染推荐场景（访客 localStorage 偏好仍叠加其上；已有配置的旧相册不受影响）。
  3. 发布初始化：`usePublishCenter.ensureConfigDraft` 在发布前发现无草稿行时，静默 PUT 推荐场景草稿（修复后端 `CONFIG_NOT_FOUND` 404）。
- **参数分层**：配置页"氛围" tab 只有 8 张场景卡（推荐卡带"推荐"徽标）；背景/粒子/辉光/雾/调色/光照等全部原始参数在"高级" tab；布局与下载开关在"基础" tab。
- **状态展示**：配置页头部两枚徽章——草稿（保存中/未保存的更改/保存失败/已保存 HH:MM/尚未保存到服务器）与发布（尚未发布/线上是 vN·草稿待同步/已发布 vN）。草稿相册在配置页与工作台都能"发布展厅"一键完成（保存草稿 → 配置发布 → 画廊发布）。
- **发布就绪横幅**：工作台在 `status=DRAFT && photoCount>0` 时显示：处理中 / N 张失败（无发布按钮）/ 就绪（发布展厅 + 先预览 + 调整场景）。可关闭（sessionStorage 记忆，按相册隔离）。

## 如何更换推荐场景
改 `RECOMMENDED_SCENE_PRESET` 一个常量并全量回归：`npm run test:viewer:unit`、`cd apps/gallery-admin && npx playwright test`。注意 `first-publish.spec.ts` 与 `viewer-config.spec.ts` 断言了 `starry-night` 与背景 URL。

## 验收口径
新用户从"上传完成"到"发布成功"只需一次点击（横幅上的发布展厅）；e2e `apps/gallery-admin/e2e/first-publish.spec.ts` 钉住该链路。
