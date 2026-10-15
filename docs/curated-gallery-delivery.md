# 光影之间 · 本次交付

> 2026-10-14 后续的 3D 重做已替换本文所述的整体环绕取景；当前行为及验收见 [摄影空间交付](spatial-stage-delivery.md)。以下保留为前一轮记录。

2026-10-14。代码位于当前工作区，分支 `codex/curated-spatial-gallery`。本说明依据本次实际构建、浏览器操作和截图，不沿用历史验收结论。未部署到公网。

## 启动

需要 Node.js、Java 17、Maven、Docker Desktop。仓库已有依赖锁文件，本次没有增加运行依赖。

在仓库根目录执行：

```sh
npm ci
mvn package
docker compose --env-file infra/local.env.example -f infra/docker-compose.yml up -d
```

Windows 可用 `mvn.cmd package`。等 `http://localhost:8088/actuator/health` 返回 `UP`，在两个终端分别执行：

```sh
npm run dev:admin
npm run dev:viewer
```

管理端 `http://localhost:5173/app/`，展示端 `http://localhost:5174/g/相册标识`。API 默认代理到 8088；本地照片存储使用 Docker 内的 MinIO，无需 OSS、CDN、付费资源或外部账户。本机这次验收使用 15173 / 15174，以避开其他开发端口。

## 使用

创作者首次在本地注册并新建空间后，主流程只有三步：

1. 点击顶部「上传照片」，或拖入照片。
2. 点击「螺旋 / 环幕 / 波浪」风格卡，自动保存。
3. 点击「发布并分享」，直接复制链接。

默认公开空间的访客打开链接即可看，无需登录或点击开始。底部切换三个空间布局，顶部切换平面展览、暂停漫游；点击照片看大图。私密或密码空间保留原有访问限制。

上传记录、版本管理、访问限制等放在展开项内。风格保存失败可以重试；发布期间锁定风格，避免访客看到与创作者选择不同的版本。复制受浏览器限制时可直接选中链接手动复制。

## 视觉设计

- **螺旋**：连续的照片带，有近大远小、错落高度与缓慢旋转；数量增长时增加圈数和高度。
- **环幕**：带倾斜和纵深的椭圆环，中央留白，照片朝向兼顾整体雕塑感与可读性。
- **波浪**：照片沿曲面展开；手机改成两列，按照片高度安排间距并平滑调整取景。
- **切换**：约 1.6 秒缓动，照片错峰移动，镜头约 1.1 秒平滑归位。减少动态偏好下避免这类持续运动。
- **实体与氛围**：照片有浅金属背板，保留完整比例；原创着色器生成缓慢流动的冷暖光域，不下载大幅背景。拖动、滚动速度驱动同一个衰减信号，影响环境光和粒子速度；星点对指针轻微避让。
- **平面展览**：编辑式错落排版、完整照片比例、大幅与小幅交替，保留图片渐入、大图浏览与手机布局。

研究参考：[Kinetic Images（2025）](https://tympanus.net/Tutorials/KineticImages/)、[Reactive Depth（2026）](https://tympanus.net/codrops/2026/02/17/reactive-depth-building-a-scroll-driven-3d-image-tube-with-react-three-fiber/)、[Reactive Background Gradients（2025）](https://tympanus.net/codrops/2025/11/11/building-a-3d-infinite-carousel-with-reactive-background-gradients/)。借鉴连续空间、惯性与氛围联动的思路；没有复制第三方着色器。

## 自证清单

| 硬性要求 | 本次达到的程度与证据 |
| --- | --- |
| 打开即懂，创作不超过三步 | 顶部上传、三张风格卡、发布后直接拿链接。真实浏览器完成注册、新建、上传 12 张、选风格、发布，再读取弹窗真实链接。首次注册和新建空间是流程前置步骤。 |
| 访客无登录、无操作即可看 | 新的匿名浏览器会话打开弹窗链接，直接进入照片场景并自动漫游。没有开始按钮。 |
| 友好错误，无死路 | 上传/保存/服务连接失败保留重试路径；无法使用 3D 时自动进入平面展览。浏览器禁用 WebGL 的实际验收通过。 |
| 3D 空间、运动、光影与张力 | 三种独立空间构图、实体背板、缓动变形、渐变氛围、速度联动粒子。桌面和 390×844 手机画面实际截图复查；“是否惊艳”仍由你看成品判断。 |
| 2D 作品呈现 | 桌面编辑式排版和手机比例适配，图片可打开大图、按 Escape 关闭；实测通过。 |
| 加载与降级 | 缩略图先于高清图，有限纹理预算、低端画质、无 WebGL 回退。本地生产构建开启测量开关，在 1.6 Mbps / 150 ms 延迟 / CPU 降速 4 倍 / 报告 2 核 2 GB 条件下，最终波浪版本首张约 **7.17 秒**出现（前一轮螺旋为 5.98 秒），自动选择 low，平面展览仍可用，页面异常为 0。弱网并非零等待；没有用模拟结果冒充低端实体手机实测。 |
| 效果优先于功能数量 | 主界面只提供螺旋、环幕、波浪三种空间风格；保留完整平面展览。高级旧设置留在更多设置里。 |
| 前端可构建 | `npm run build` 通过两个应用的类型检查和生产构建。Three.js 主块仍有体积提示，约 684 kB / gzip 176 kB，没有隐藏警告。 |
| 后端可启动，主流程可用 | `mvn.cmd package` 成功；150 个测试中 149 个通过、1 个跳过，失败/错误均 0。重新打包后容器启动，健康接口返回 UP。上传、实际图片处理、发布及匿名读取均连接本地真实后端。 |
| 代码可维护 | 风格合同集中在 `curatedStyles.ts`，空间数学在 `curatedLayouts.ts`，氛围与速度信号分别在 `AmbientField.ts` / `MotionAtmosphere.ts`，界面样式在 `curated.css`；保留旧布局兼容分支。108 个展示器/合同单元测试全部通过，含两张/50 张、手机两列、极端比例、资源回收及相机转场计数等回归。 |

## 重跑验收

```sh
npm run test:viewer:unit
npm run build
mvn test
node scripts/verify-curated.mjs
```

端到端脚本默认管理端 15173、展示端 15174；可用 `ADMIN_URL` / `VIEWER_URL` 覆盖。它只允许本机地址，会新建一个本地测试账户和展厅，上传仓库已有示例照片。

弱网脚本 `scripts/verify-viewer-resilience.mjs` 使用 `verify-curated.mjs` 生成的本地展厅。测量生产版本时先设置 `VITE_VIEWER_DIAGNOSTICS=true` 构建展示端，再启动其 `vite preview`，用 `VIEWER_URL` 指向预览地址后运行脚本；测量开关仅用于本地验证。普通交付构建不打开诊断接口。

截图与机器可读弱网结果位于 `acceptance-shots/curated/`：`helix.png`、`ring.png`、`wave.png`、`mobile.png`、`mobile-wave.png`、`exhibition.png`、`fallback.png`、`share.png`、`resilience.json`。测试使用浏览器自动化，尚未覆盖所有真实手机及公网部署环境。
