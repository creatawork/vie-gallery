# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vue 3 + TypeScript + Vite；共享契约 `@vie/gallery-contracts`；样式以全局 CSS 变量（`src/styles.css`）与页面级 scoped 样式并存。

## Users

个人摄影师、独立创作者、需要交付照片的个人工作室。主要场景：注册/登录 → 创建相册空间 → 上传整理 → 配置 3D/2D 展厅 → 预览 → 发布 → 分享链接给访客。

## Product Purpose

VIE Gallery Admin 是创作者管理后台：可靠保存照片、管理相册与成员权限、配置访客端展示体验、发布与分享。成功标准是用户无需阅读内部文档即可完成「创建 → 上传 → 整理 → 预览 → 发布 → 分享」闭环。

## Positioning

以「沉浸式 3D 展厅」为差异化展示能力，但 2D 永远可用；创作者在 Admin 侧完成任务，访客在 Viewer 侧浏览。状态与数量由服务端提供，前端不猜测。

## Operating Context

- 本地开发：`infra/docker-compose.yml` 启动 API + 依赖；`start-frontend.sh` 启动 Admin（5173）与 Viewer（5174）。
- 质量门禁：`npm run verify`、`npm run verify:full`；CI workflow 为手动触发（`workflow_dispatch`）。
- 产品与工程规划入口：`docs/personal-album-v1-plan.md`、`docs/personal-album-v1-next-tasks.md`。

## Capabilities and Constraints

- 登录/注册、我的空间总览、相册工作区、配置面板、成员管理、发布中心、上传任务中心、分享链接管理。
- 创作者草稿预览令牌（15 分钟内存）；未发布相册对无令牌访客仍 404。
- 权限：OWNER / EDITOR / VIEWER；本期不扩展团队邀请、多工作区、AI、视频。
- 中文用户可见文案；错误需可恢复并含 requestId（API 层）。

## Brand Commitments

- 产品名：**VIE Gallery**；Admin 副标语境为「3D 沉浸式画廊 / 创作者工作区」。
- 品牌图形：折叠立方体 mark（翠绿渐变 `#12B981` → `#047857`），见于总览与工作区导航。
- 视觉气质（已落地，见 `DESIGN.md`）：清新薄荷绿 + 磨砂玻璃 + 画廊空间摄影背景；登录页为深色玻璃卡片浮于全屏背景之上。
- 登录页原型规格：`docs/superpowers/specs/2026-09-08-admin-login-immersive-design.md`。

## Evidence on Hand

- 已实现并作为视觉基准的页面：`OverviewView.vue`（登录沉浸态 + 我的空间）、`GalleryWorkspaceView.vue`（工作区）、`MembersView.vue`、`GalleryConfigPanel.vue`。
- 全局设计令牌：`apps/gallery-admin/src/styles.css`。
- 背景资产：`public/login-bg-c.jpg`、`public/overview-bg.png`、`public/hall-bg.png`。
- 封面占位：`public/covers/*.png`。
- Impeccable 评审记录：`.impeccable/critique/*__apps-gallery-admin.md`（已知漂移与 UX 缺口，不替代 DESIGN.md）。

## Product Principles

1. **照片优先**：3D 是增强，不能阻塞访问。
2. **事实优先**：列表摘要、任务状态、发布就绪由 API 聚合。
3. **可恢复**：上传、任务、发布失败有明确文案与重试路径。
4. **安全默认**：私密内容不通过 URL/Meta 泄露。
5. **先完成主循环再扩张**：本期不做团队/计费/SSR。

## Accessibility & Inclusion

- 目标：WCAG 2.1 AA 为方向；已知缺口包括部分低对比度（白字 on 翠绿按钮）、10px 功能标签、模态 Esc/焦点陷阱不完整（见 critique 记录，需在后续 harden 任务修复）。
- 表单控件需有可见 label；图标按钮需 `aria-label` 或可见文字。
