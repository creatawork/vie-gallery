# P1-06 Viewer 保底与设备策略验收记录

- 验收日期：2026-09-12
- 分支：`feat/gallery-workspace-slice`
- 工作包：P1-06 WebGL 保底和设备策略
- 范围：仅 P1-06；P1-07/P1-08 未实施

## 代码证据

- `apps/gallery-viewer/src/core/ConfigManager.ts:4-27,329-348`
  - 新增统一 `DeviceProfile`：移动端、`deviceMemory < 4` 或 `hardwareConcurrency < 4` 视为低端。
  - 低端设备自动设置 `quality: low`、关闭 `particles`、Bloom、Fog，并将初始 DPR profile 固定为 `1`。
- `apps/gallery-viewer/src/core/ViewerEngine.ts:9-14,507-537`
  - Renderer 创建前探测 `webgl2`/`webgl` context。
  - 无可用 context 或 Three.js Renderer 构造失败时抛出 `WebGLUnavailableError`。
  - 低端 profile 在 Renderer 初始化阶段使用 DPR `1`、关闭 antialias 和默认 power preference。
- `apps/gallery-viewer/src/App.vue:193-282,284-355,461-485`
  - 初始化异常和运行时 `webgl:lost` 共用 fallback 路径：销毁 3D、切换 `viewMode = '2d'`、展示非阻塞中文提示。
  - 普通页面与嵌入预览均保留 2D 照片网格；Lightbox、加载更多和分享能力复用原有链路。
  - 自定义 hover raycast 限定为鼠标 pointer；触屏 pointer move 不抢占 OrbitControls 的单指旋转/双指缩放。
  - Canvas pointer/click handler 保存并在销毁时移除，避免 fallback 重入时重复绑定。
- `apps/gallery-viewer/src/core/types.ts:195-209`
  - 补齐 `webgl:lost`、`webgl:restored`、`metrics:update` 事件契约。

## 自动化门禁

| 命令 | 结果 |
| --- | --- |
| `npm --workspace apps/gallery-viewer run typecheck` | PASS |
| `npm --workspace apps/gallery-viewer run build` | PASS |
| `npm run verify` | PASS（文档链接、Admin/Viewer typecheck/build） |
| `git diff --check` | PASS（仅报告 Windows LF/CRLF 提示） |

构建输出仍有既有的动态/静态插件 chunk 警告和大 chunk warning；未新增编译错误。

## 浏览器证据

### 正常 WebGL Demo

- 地址：`http://127.0.0.1:5174/demo`
- 结果：PASS。页面显示真实 WebGL 场景和 Visual Presets 控件。
- 截图：`E:\workspace\vie-gallery\p1-06-normal.png`
- 控制台：仅 `favicon.ico` 404，非 Viewer 运行错误。

### 公开 Gallery 路由环境检查

- 地址：`http://127.0.0.1:5174/g/demo`
- 结果：BLOCKED。当前本地 API 健康检查为 HTTP 200，但没有 `demo` slug；页面按既有逻辑显示“相册空间未找到”。
- 桌面截图：`E:\workspace\vie-gallery\p1-06-not-found.png`
- 390px 截图：`E:\workspace\vie-gallery\p1-06-mobile-blocked.png`
- 390px 观察：错误态卡片在窄屏内完整显示，未出现横向溢出；真实照片交互仍因无 Gallery 数据无法执行。

### WebGL 禁用/初始化异常

- 代码路径已完成并通过 typecheck/build：`WebGLUnavailableError` → App fallback → 2D + banner。
- 浏览器实测：BLOCKED。当前浏览器工具未提供 WebGL-disabled 启动参数，且本地 API 没有可访问的测试 Gallery；未以脚本注入或 DOM 改写伪造通过结果。

### 低端 profile

- 代码检查：已确认低端 profile 在 Renderer 创建前提供 DPR=1，并在插件安装前关闭粒子/Bloom/Fog。
- 浏览器实测：BLOCKED。当前无可访问 Gallery，无法在真实照片页面观察运行态 APM/渲染配置。

## 明确未纳入本次

- P1-07：LOD、medium/texture 按视距加载、并发/内存限制、完整资源生命周期和 100 张照片基准。
- P1-08：持续低 FPS 防抖、粒子/Bloom/Fog/DPR 阶梯降级、逐级恢复、流畅模式入口及运行态指标采集。
