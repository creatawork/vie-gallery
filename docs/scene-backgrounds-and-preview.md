# 场景背景与照片预览

八张背景由内置 image_gen 工具生成，保存在 apps/gallery-viewer/public/backgrounds，转换为 WebP，总计约 2.2 MB。完整提示词见该目录 README.md。管理端卡片和 Viewer 使用 /g/backgrounds/<preset>.webp 共用资源。

预设包含极简、森林、星空、海洋、日落、浪漫、冬日、胶片。历史配置只有 presetName 时按名称载入对应背景。保存草稿时保留 background，选择“纯净空间”可关闭背景。快速切换、销毁引擎后返回的旧纹理会释放。

照片列表将固定 OSS bucket 的签名 URL 转为 /oss/ 路径，保留原始签名查询参数。Vite 和三个 Nginx 配置包含固定上游代理，剥离会话 Cookie 与 Authorization，禁止代理响应缓存，不记录包含签名的访问日志。没有扩展为任意 URL 代理。

上线必须同时部署管理端和 Viewer 构建产物（包含 backgrounds），更新实际使用的 Nginx 配置，通过 nginx -t 后重载。只更新前端而不更新代理会导致 /oss/ 请求失败。本次只修改本地仓库，没有更新生产服务器或 OSS bucket 配置。

预览照片失败时提示显示 5 秒；请求挂起超过 12 秒后提示一次，5 秒后收起。支持关闭、重试，后续加载成功会及时清除提示。失败照片保留占位。

## 验证

- npm run build --workspace apps/gallery-admin
- npm run build --workspace apps/gallery-viewer
- Viewer 在 5274 启动：node apps/gallery-viewer/e2e/background-preview-verify.mjs（在 Viewer 目录运行 e2e/background-preview-verify.mjs）。验证签名保留、提示自动收起、8 个背景资源、快速切换竞态和背景关闭。
- Admin 在 5273、Viewer 在 5274 启动：在 Admin 目录运行 node e2e/scene-panel-verify.mjs。API mock 验证 8 张缩略图、保存背景、关闭背景及手机布局。

## 实现参考

- [Three.js 场景背景](https://threejs.org/docs/pages/Scene.html)
- [Nginx proxy_pass URI 转发规则](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

本轮两个前端生产构建及类型检查通过，既有配置消费、2D/3D 交互、配置中心保存与同步回归通过（API mock）。本地没有 Nginx 可执行文件，生产代理需在部署环境运行 nginx -t 校验；没有验证真实生产 OSS 签名请求。Viewer 构建保留原有动态/静态导入及大 chunk 提示。

补充回归通过：照片请求永久挂起后的提示自动收起、手动关闭、背景异步切换竞态与背景关闭。
