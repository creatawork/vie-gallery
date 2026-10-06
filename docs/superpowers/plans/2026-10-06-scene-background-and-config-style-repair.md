# 全景背景与展厅配置样式修复方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 八种内置背景随视角旋转，配置左栏恢复设计稿对应样式，并保证预览、保存及发布结果一致。

**Architecture:** 在 main 的 BackgroundPlugin 和拆分后的配置组件上修复；保留统一配置契约、实时预览协议、资源预算和性能优化。背景投影类型显式声明，卡片缩略图和全景素材分开管理。

**Tech Stack:** Vue 3、Three.js、TypeScript、Playwright、Node test、Java 配置校验。

**Spec:** 本文的需求、证据和验收标准；用户于 2026-10-06 要求分析线上两个问题并提供修复方案。本轮仅分析与规划。

## 基线与已确认原因

- 当前目录 HEAD 是功能分支 `4985c74`；合并后的 main/origin/main 是 `c2189e2`，不能直接以当前目录实现代表线上。
- 只读检查了 `https://gallery.vie-vibe.cn/app/` 与 `/g/demo-gallery` 返回的入口及 JS/CSS。线上管理端引用 `GalleryConfigPanel-pm4DGv1A.js` / `GalleryConfigPanel--YzMysS7.css`，Viewer 入口为 `index-CXWPmmfx.js`；特征与合并后的 main 一致。未据此宣称精确证明线上构建 SHA。
- 功能分支 ViewerEngine.ts:296 设置了 EquirectangularReflectionMapping；main 使用 BackgroundPlugin.ts:26–33，只设置 colorSpace / needsUpdate，未设置 mapping。默认 UVMapping 把图片显示为平面背景。
- main GalleryConfigPanel.vue:535 没有新版 side-heading；803 起仍是旧的白底侧栏样式。线上 CSS 同样为旧 padding、背景和阴影。并非仅用户浏览器缓存。
- main 已使用 PresetCards / AtmosphereControls / ConfigField 等子组件；旧 `.preset-mini` 样式不能匹配新的 `.preset-card`。父级 scoped 样式也不能替代子组件内部样式。
- 原素材提示词只要求 2:1 宽幅构图，没有保证 360×180 度等距柱状投影、左右无缝及极点连续；人工查看 minimal.webp，属于透视建筑效果图。不能仅凭图片比例认定八张均合格。
- 现有 background 单测验证纯色、渐变和释放；effects E2E 验证切换和后处理开关，没有背景随相机旋转的断言。
- 浏览器复现：用线上 Viewer JS/CSS，隔离浏览器内 mock API，iframe 空照片场景、minimal 背景、关闭动态效果；鼠标拖动前后 canvas PNG 均为 686994 字节且内容完全相同，pageerror 为空。未写入生产数据。

## Global Constraints

- 从 main `c2189e2` 或其更新版本实施，保留现有配置契约与性能重构；不整体覆盖回旧版大组件。
- 保留背景关闭、纯色、渐变和普通自定义平面图的语义。
- 八种预设逐一验收，不能用“图片 HTTP 200”替代旋转验证。
- 全景环视不等于可走入、具有位移视差的建筑模型；本次按可旋转环视实施。
- 分析阶段不修改业务代码、不提交、不推送、不部署。

## Review Focus

1. 旧草稿使用 background.type，或内置图片缺少 projection：归一化后正确兼容。
2. 图片加载中切到 none/gradient：旧成功或失败回调都不得覆盖新状态。
3. 图片 404 后重试同 URL、卸载重装：可恢复且不泄漏纹理。
4. 移动端触摸、预览 iframe、后处理开关：旋转正常，无手势遮挡或误触照片。
5. 拆分组件、禁用/错误/选中状态和窄屏：样式一致，表单保存与权限行为不退化。

## Task 1：明确背景投影并恢复旋转

**Files:**
- Modify: packages/gallery-contracts/src/viewerConfig.ts、viewerConfigLegacy.ts、viewerPresets.ts
- Modify: apps/gallery-viewer/src/plugins/BackgroundPlugin.ts
- Modify: apps/gallery-api/gallery-api-application/src/main/java/cn/vie/vibe/gallery/application/ViewerConfigValidator.java
- Test: packages/gallery-contracts/test/viewerConfig.test.ts、viewerPresets.test.ts、apps/gallery-viewer/test/background.test.ts；后端对应 validator 测试

**Interfaces:** 保留 background.mode；image 增加可选 projection: 'flat' | 'equirectangular'。内置场景显式为 equirectangular；未声明的自定义图片保持 flat；识别旧内置 URL 时补全投影，避免强制改变所有自定义图。

- [ ] 先增加图片加载 mock 测试，验证内置背景纹理 mapping；现有实现应失败：

```ts
assert.equal((context.scene.background as THREE.Texture).mapping,
  THREE.EquirectangularReflectionMapping)
```

- [ ] 在公共契约加入枚举校验，八个预设显式设置投影；补齐旧 background.type → mode 的兼容，且 none 优先于图片 URL 回退。
- [ ] 在图片加载成功且请求仍有效后设置：

```ts
texture.mapping = config.image?.projection === 'equirectangular'
  ? THREE.EquirectangularReflectionMapping
  : THREE.UVMapping
texture.colorSpace = THREE.SRGBColorSpace
texture.needsUpdate = true
```

- [ ] 前后端校验测试覆盖合法投影、非法值、缺省、自定义 URL、旧内置 URL、旧 none。运行 `npm run test:viewer:unit`，后端测试按项目 Maven 模块执行。
- [ ] 提交独立修复，供映射逻辑单独评审；素材最终验收由 Task 4 完成。

## Task 2：修复背景请求竞态和资源释放

**Files:** apps/gallery-viewer/src/plugins/BackgroundPlugin.ts、apps/gallery-viewer/test/background.test.ts

**Interfaces:** 延续 BackgroundPlugin.install/uninstall 与 config:update 事件，不新增第二套背景管理器。

- [ ] 使用受控 TextureLoader 回调覆盖 A→B、A→none、A→gradient、卸载→重装、同 URL 失败重试。
- [ ] 每次背景状态变化和卸载时递增 request；成功与失败回调均检查 context、request、signature。当前失败回调缺 signature 检查，应修复。
- [ ] 旧图→渐变时释放旧图；替换成功或失败兜底时明确释放旧纹理；失败后清理 signature，使相同配置可重试。
- [ ] 测试预期：旧回调不改变当前 scene.background；被替换纹理 dispose 恰好一次；重新请求相同 URL 可恢复。
- [ ] 运行 `npm run test:viewer:unit` 并提交。

## Task 3：在实际渲染组件中迁移左栏设计

**Files:** apps/gallery-admin/src/views/GalleryConfigPanel.vue；src/components/gallery-config/ 下的 PresetCards.vue、ConfigField.vue、AtmosphereControls.vue、LayoutControls.vue、MotionQualityControls.vue；apps/gallery-admin/e2e/viewer-config.spec.ts

**Interfaces:** 保留 patch/preset/reset 事件、配置编辑 composable、预览 ACK、权限和保存流程。父组件负责面板壳、标题、分区导航；子组件负责卡片和字段内部样式；仅容器共用样式使用限定范围的 :deep。

- [ ] 先增加 main 上失败的外观断言：side-heading 可见；侧栏背景为 rgb(247, 249, 248)；八张卡片可见且选中态正确。
- [ ] 从 4985c74 迁移 side-heading、浅灰绿面板、白底圆角分组、吸顶分区导航到当前结构；不要整体覆盖旧模板。
- [ ] 将卡片样式迁移到 PresetCards 的 `.preset-card`，删除父组件中不再命中的旧 `.preset-mini` 规则。
- [ ] 字段统一字体、间距、边框、焦点、禁用及错误样式；补齐 ConfigField 中 image 的中文标签。背景类型变化时隐藏不适用的渐变颜色/角度控件。
- [ ] 添加以下断言并对 1440、1024、390 像素视口截图评审：

```ts
await expect(page.locator('.side-heading')).toBeVisible()
await expect(page.locator('.config-side')).toHaveCSS('background-color', 'rgb(247, 249, 248)')
await page.getByRole('tab', { name: '氛围', exact: true }).click()
await expect(page.locator('.preset-card')).toHaveCount(8)
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
```

- [ ] 保留并运行配置保存、重新加载、预设恢复、只读权限、iframe 实时更新测试；确认后提交。

## Task 4：全景素材与行为验收

**Files:** apps/gallery-viewer/public/backgrounds/、packages/gallery-contracts/src/galleryMedia.ts、viewerPresets.ts、apps/gallery-admin/src/components/gallery-config/PresetCards.vue、apps/gallery-viewer/e2e/effects.spec.ts

**Interfaces:** 卡片缩略图单独 URL；全景使用带版本的素材 URL，避免同名覆盖后缓存继续返回旧图。

- [ ] 八张图逐一检查 0/90/180/270 度、左右接缝、顶部和底部。普通宽图不可仅拉伸为 2:1 后通过验收。
- [ ] 不合格素材用合规可用的真实全景或从完整 3D 场景烘焙的全景替换；AI 图须经球面投影检查，生成提示词不能代替验收。
- [ ] 全景按设备质量加载适合的分辨率；缩略图使用独立小图，避免配置卡片加载高分辨率全景。记录图片大小和实际纹理内存，沿用现有质量预算。
- [ ] 增加固定时间、禁用粒子/自动旋转/照片浮动的背景专用浏览器测试：鼠标拖动前后背景区域必须变化；相机方向也变化。单独比较背景，避免照片位移造成假阳性。
- [ ] 八种场景分别验证 iframe 与访客页、触摸旋转、重置、后处理开关和 2D 降级；完整 360 度人工验收接缝。

## Task 5：以合并产物验收并发布

**Files:** .github/workflows/quality.yml、.github/workflows/deploy.yml（按现有流程补充验收和构建身份）；docs/scene-backgrounds-and-preview.md

- [ ] 执行 `npm run test:viewer:unit`、`npm run verify`、相关 Playwright 测试及涉及契约变更的后端测试。
- [ ] 对生产构建产物运行浏览器验收；旧脚本依赖 `.preset-mini`、旧背景结构和 `/src/` 动态导入，须改到新组件/契约后才能作为回归证据。
- [ ] Admin、Viewer、全景资源以同一版本交付；契约改变则同步后端校验。记录构建 SHA 与资源清单。
- [ ] 部署后检查真实访客页的旋转、管理员侧栏样式、保存→预览→发布链路；检查入口 HTML 与资源版本一致。
- [ ] 保留上一完整发布包以便回滚，失败时回滚整套匹配产物，避免两端版本混用。

## 资料与边界

- Three.js Scene 文档区分平面 Texture 与用于 skybox 的 cube/equirectangular texture：https://threejs.org/docs/pages/Scene.html
- 源码与线上静态产物已交叉检查；真实管理员账户页面未登录。任何浏览器夹具测试只证明线上前端产物行为，不代表真实生产数据完整链路已验收。
