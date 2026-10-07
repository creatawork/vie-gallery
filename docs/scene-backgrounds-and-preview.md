# 场景背景与照片预览

八张背景于 2026-10-07 按用户提供的 ChatGPT 分享图片替换，保存在 apps/gallery-viewer/public/backgrounds，原图均为 1774×887，转换为 WebP。来源与派生规格见该目录 README.md。管理端卡片使用 /g/backgrounds/thumbs/<preset>.webp 独立缩略图；Viewer 全景按设备画质加载 /g/backgrounds/<preset>.webp 或 -low 半分辨率变体（backgroundTextureUrl）。所有场景背景 URL 由契约 SCENE_BACKGROUND_VERSION 以 ?v= 标注版本，替换同名素材时必须递增该版本。

预设包含极简、森林、星空、海洋、日落、浪漫、冬日、胶片。八个预设的 background.image 显式声明 projection: 'equirectangular'，背景纹理以 EquirectangularReflectionMapping 渲染，随相机旋转；未声明投影的自定义图片保持平面 UVMapping。契约归一化会为旧内置 URL 自动补全投影；legacy background.type 迁移到 mode 且 none 优先于图片回退。历史配置只有 presetName 时按名称载入对应背景。保存草稿时保留 background。快速切换、销毁引擎后返回的旧纹理会释放，失败兜底同样释放旧纹理并允许同配置重试。

照片列表将固定 OSS bucket 的签名 URL 转为 /oss/ 路径，保留原始签名查询参数。Vite 和三个 Nginx 配置包含固定上游代理，剥离会话 Cookie 与 Authorization，禁止代理响应缓存，不记录包含签名的访问日志。没有扩展为任意 URL 代理。

上线必须同时部署管理端和 Viewer 构建产物（包含 backgrounds 与派生的 thumbs/、-low 变体），更新实际使用的 Nginx 配置，通过 nginx -t 后重载。只更新前端而不更新代理会导致 /oss/ 请求失败。

预览照片失败时提示显示 5 秒；请求挂起超过 12 秒后提示一次，5 秒后收起。支持关闭、重试，后续加载成功会及时清除提示。失败照片保留占位。

## 验证

- npm run verify（check:docs + 全工作区 typecheck + build）
- npm run test:viewer:unit（契约枚举/投影推断/legacy 迁移、背景映射与竞态、诊断信息）
- mvn -pl gallery-api-application -am test（后端校验器含 background.image.projection 与 image/none 模式）
- apps/gallery-viewer：npx playwright test（effects.spec 覆盖八场景后处理链；background-rotation.spec 覆盖鼠标/触摸拖拽后相机方向与背景像素变化）
- apps/gallery-admin：npx playwright test（同域双应用静态服务器 e2e/prod-shape-static-server.mjs；viewer 产物须以 VITE_VIEWER_DIAGNOSTICS=true 构建，见 quality.yml admin-smoke；覆盖保存/重载/预设恢复/外观三视口截图/iframe 全景投影）

历史上的 background-preview-verify.mjs、scene-panel-verify.mjs、config-center-verify.mjs 依赖旧 .preset-mini 结构与 /src/ 动态导入，已删除；其覆盖由上述 Playwright 套件承接。

## 实现参考

- [Three.js 场景背景](https://threejs.org/docs/pages/Scene.html)
- [Nginx proxy_pass URI 转发规则](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

2026-10-06 修复轮（分支 fix/scene-background-config-style，自 main c2189e2）：

- 修复线上背景不随视角旋转：BackgroundPlugin 按投影设置 EquirectangularReflectionMapping，契约新增 background.image.projection 枚举校验，后端 ViewerConfigValidator 同步 image/none 模式与投影。
- 修复背景请求竞态与纹理泄漏：每次状态变化递增 request，成功/失败回调检查 context/request/signature，失败清理 signature 允许重试。
- 恢复配置左栏设计稿样式（side-heading、浅灰绿面板 #f7f9f8、白底圆角分组、吸顶分区导航、.preset-card 卡片），样式落在拆分后的子组件中。
- 八张全景 8×4 朝向球面投影评审通过（e2e/panorama-review 可复现）；forest-dream 源图接缝存在可感知的树干错位，待真实全景素材替换（deferred）。
- 两个前端生产构建、类型检查、81 项 viewer 单测、admin/viewer Playwright 套件、后端校验器测试通过。部署、真实访客页旋转复验与发布包回滚预案由 push main 后的 deploy 流程执行。

2026-10-07 素材替换：

- 按八主题顺序替换主背景、low 变体及配置卡片缩略图，保留用户原图内容。
- 缓存版本更新为 2026-10-07；旧配置的内置背景 URL 在所有画质下均加载当前版本，自定义 URL 保持原样。
- 移除管理端预览常驻的应用/画质状态浮层；应用失败改为短暂通知。
- 两端类型检查和构建、87 项单元测试、管理端 4 项配置浏览器测试通过；八主题四个环绕视角已截图检查。
- 新图能正常球面渲染，但部分素材接缝仍可见（海洋、星空等），保留原图供用户在线上评估，未声称无缝全景验收通过。
