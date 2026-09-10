---
name: VIE Gallery Admin
description: 薄荷玻璃展亭 — 清新画廊感创作者后台
colors:
  mint-400: "#34d399"
  mint-500: "#10b981"
  mint-600: "#059669"
  mint-700: "#047857"
  mint-soft: "rgba(16, 185, 129, 0.1)"
  brand-primary: "#0e2920"
  brand-accent: "#10b981"
  brand-accent-ui: "#00b88f"
  brand-lime: "#d9f99d"
  brand-deep: "#047857"
  bg-app: "#f3faf7"
  bg-surface: "rgba(255, 255, 255, 0.72)"
  glass-bg: "rgba(255, 255, 255, 0.58)"
  text-primary: "#121815"
  text-secondary: "#47554f"
  text-tertiary: "#788c82"
  text-inverse: "#ffffff"
  status-success: "#10b981"
  status-warning: "#f59e0b"
  status-error: "#ef4444"
  status-info: "#3b82f6"
  auth-card-bg: "linear-gradient(155deg, rgba(14, 28, 24, 0.88), rgba(8, 20, 16, 0.92) 48%, rgba(6, 24, 18, 0.9))"
  auth-cta-gradient: "linear-gradient(135deg, #d9f99d, #6ee7b7 42%, #34d399)"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(26px, 3vw, 32px)"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "22px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "0.06em"
  body:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
  kicker:
    fontFamily: "'Plus Jakarta Sans', sans-serif"
    fontSize: "11px"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  auth-card: "22px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #10b981 0%, #059669 100%)"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #059669 0%, #047857 100%)"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.72)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-auth-cta:
    backgroundColor: "{colors.auth-cta-gradient}"
    textColor: "#042f1e"
    rounded: "{rounded.md}"
    padding: "13px 16px"
  chip-active:
    backgroundColor: "{colors.brand-accent-ui}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
---

# Design System: VIE Gallery Admin

## Overview

**Creative North Star: 「薄荷玻璃展亭」(The Mint Glass Pavilion)**

VIE Gallery Admin 的视觉世界来自已落地的原型页：登录沉浸背景、我的空间总览、相册工作区。整体气质是**清新画廊展陈空间**——大面积浅绿/摄影背景、白色与半透明磨砂面板浮于其上、翠绿作为唯一行动色。界面应让人感觉「在安静的展厅里操作」，而不是通用 SaaS 仪表盘。

Operate 模式：扫描性、任务完成率、一致性优先于张扬表达。品牌个性体现在**材质**（玻璃、轻阴影、圆角胶囊导航）和**色彩节制**（薄荷绿只用在行动与状态），而非装饰性插画堆叠。

**Key Characteristics:**

- 全屏固定背景场景（`login-bg-c.jpg` / `overview-bg.png` / `hall-bg.png`）+ 前景浮动 UI 层
- 胶囊形顶栏导航（`border-radius: 999px`）+ 毛玻璃（`backdrop-filter: blur(18–32px) saturate(160%)`）
- 主行动色为翠绿渐变；登录页 CTA 使用黄绿→薄荷渐变（`#d9f99d → #34d399`）
- 字体单一栈：**Plus Jakarta Sans**（全站 UI）；Playfair Display 已引入但**不作为 UI 正文字体**
- 卡片白底 + 轻阴影抬起；hover 微位移（`translateY(-2px ~ -3px)`）
- 中文界面；kicker/eyebrow 可用大写英文品牌字样作氛围（仅登录背景水印）

## Colors

翠绿薄荷是品牌脉搏；中性色负责阅读；登录页是**深色玻璃**变体，已登录页是**浅色玻璃**变体。

### Primary

- **Gallery Emerald** (`#10b981` / `--brand-accent`): 主行动、成功态、焦点环、渐变按钮起点。用于 `.btn-primary`、badge-public、开关开启态。
- **Deep Forest** (`#0e2920` / `--brand-primary`): 品牌深色锚点；登录卡片内深色底、深色文字场景。
- **UI Teal** (`#00b88f` / `--brand-accent-ui`): 总览/工作区页面级高亮（Tab 下划线、创建按钮、筛选 chip 激活）。**与 `--brand-accent` 并存是已知漂移，新代码应优先使用 `--brand-accent` 或统一 alias。**

### Secondary

- **Mint Lime** (`#d9f99d` / `--brand-lime`): 登录 CTA 渐变起点；少量高亮，不用于正文。
- **Soft Mint Wash** (`#ecfdf5` / `--brand-accent-subtle`): 次要按钮 hover、公开标签背景。

### Neutral

- **Ink Primary** (`#121815` / `--text-primary`): 正文标题（已登录页）。
- **Sage Secondary** (`#47554f` / `--text-secondary`): 副标题、说明。
- **Mist Tertiary** (`#788c82` / `--text-tertiary`): 辅助 meta。
- **App Mist** (`#f3faf7` / `--bg-app`): 全局 fallback 底色。
- **Auth Mist** (`#e8f5ef`): 登录卡片内浅色文字（scoped，非全局 token）。

### 场景色

- **登录背景** (`#c8e6d8` + `login-bg-c.jpg`): 全屏沉浸；表单区不抢背景叙事。
- **总览背景** (`#dce8e2` + `overview-bg.png`): 明亮展厅感。
- **工作区背景** (`#eef6f1` + `hall-bg.png`): 与工作台面板对比略深。

### Named Rules

**The One Accent Rule.** 每个视口只有一个主行动色实例使用饱和渐变或实心翠绿；次要操作走玻璃白底按钮或 ghost。

**The Dark-Glass / Light-Glass Rule.** 未登录 = 深色玻璃卡片 + 浅色字；已登录 = 浅色玻璃/白卡片 + 深色字。不要混用同一表单内的深色登录输入样式到已登录页。

## Typography

**Display / UI Font:** Plus Jakarta Sans（`--font-sans`），fallback 含 PingFang SC、Microsoft YaHei。

**Character:** 几何人文无衬线，略紧字距（`-0.02em ~ -0.03em`）的标题 + 650–800 字重营造「工作室工具」信心。避免 Inter、系统默认 sans 与 Jakarta 混用（`LightboxModal` 中的 Inter 是漂移，应修正）。

### Hierarchy

- **Display** (750–800, `clamp(26px, 3vw, 32px)` ~ 32px): 页面主标题（「我的空间」、工作区相册名）。
- **Headline** (750, 22px, letter-spacing 0.06em): 登录品牌标题 `VIE GALLERY`。
- **Title** (650–700, 14–16px): 卡片标题、导航 Tab。
- **Body** (400–500, 13–14px): 说明段落、表单、列表 meta；行高 1.5。
- **Label** (600, 13px): `.form-label`、字段标签。
- **Kicker** (750, 11px, uppercase, letter-spacing 0.08em): `.page-eyebrow`、章节标签；**功能文案不低于 12px**（critique 约束）。

### Named Rules

**The 12px Floor Rule.** 可点击或可读的控件文字 ≥ 12px；11px 仅用于非交互 kicker/徽章。

## Layout

- **页面壳**：`min-height: 100dvh`；背景 `position: fixed; inset: 0`；内容 `z-index: 1`。
- **内容宽度**：总览 `min(1240px, calc(100% - 48px))`；工作区 `min(1280px, calc(100% - 40px))`。
- **顶栏**：高度 64px，水平居中胶囊，三列 grid（品牌 | 导航 | 用户）。
- **间距节奏**：段落间距 6–8px；区块 18–28px；卡片内边距 22–38px（登录卡片偏大）。
- **栅格**：空间卡片 `repeat(4, 1fr)` gap 22px；窄屏需折叠为 2/1 列（现有响应式 breakpoints 以页面 scoped 为准，新页应复用相同断点习惯 ~768px / ~1024px）。
- **登录布局**：`flex` 右对齐表单；左侧留白展示背景；`auth-brand-mark` 水印左下；窄屏卡片近全宽居中。

## Elevation & Depth

混合：**摄影背景景深** + **半透明玻璃** + **轻阴影抬起**。不是扁平 Material，也不是重 neumorphism。

### Shadow Vocabulary

- **Glass ambient** (`--shadow-glass`: `0 8px 32px rgba(0,0,0,0.05)`): 玻璃面板默认。
- **Card lift** (`0 8px 24px rgba(15, 40, 28, 0.07)`): 空间卡片、工作区 hero。
- **Card hover** (`0 16px 32px rgba(15, 40, 28, 0.12)` + `translateY(-3px)`): 可点击卡片。
- **Mint glow** (`--shadow-mint`: `0 8px 22px rgba(16, 185, 129, 0.28)`): 主按钮、创建按钮。
- **Auth depth** (`0 28px 64px rgba(4, 20, 14, 0.55)`): 登录卡片，允许更深。

### Named Rules

**The Float-not-Flat Rule.** 可交互面板默认有阴影或玻璃边框；纯 `#fff` 块应搭配 `border-radius` + shadow，避免贴死在背景上。

## Shapes

- **圆角阶梯**：8px 控件内元素 → 12px 按钮/输入 → 16px 卡片 → 20–22px 大面板/登录卡 → 999px 胶囊导航/搜索框/徽章。
- **边框**：玻璃 `1px solid rgba(255,255,255,0.38)`；输入 `rgba(203, 215, 207, 0.85)`；登录输入 `rgba(167, 243, 208, 0.18)`。
- **品牌 mark**：折叠立方体 SVG，28–30px，翠绿三色面。

## Components

### Buttons

- **Shape:** 圆角 12px（`--radius-md`）
- **Primary:** 翠绿渐变 + 白字 + mint 外发光；hover 加深渐变 + `translateY(-2px)`
- **Secondary:** 半透白玻璃底 + 细白边；hover 淡薄荷底
- **Auth CTA（登录专用）:** 黄绿→薄荷渐变 + **深色字** `#042f1e`；全宽；与 Primary 不可互换
- **Ghost:** 透明底；hover `rgba(16, 185, 129, 0.08)`

### Chips / Filter Tabs

- **容器:** 白玻璃底 `rgba(255,255,255,0.88)`，padding 4px，radius 12px
- **默认:** 灰字 `#6b7280`，透明底
- **Active:** 实心 `#00b88f`（待统一为 `--brand-accent`）+ 白字

### Cards / Containers

- **空间卡片:** 白底 16px 圆角；封面 16:10；hover 抬起
- **玻璃面板:** `.glass-panel` 20px；`.glass-card` 16px；`backdrop-filter: blur(18px) saturate(160%)`
- **Hero 面板（工作区）:** 白底 18px 圆角，轻阴影，横向 flex

### Inputs / Fields

- **已登录默认:** `.form-input` — 白底 82% 不透明，12px 圆角，薄荷 focus ring `0 0 0 3px rgba(16,185,129,0.15)`
- **登录变体:** 深色半透明底，浅绿字，左侧图标 16px，无默认 shadow
- **搜索框:** 胶囊形 38px 高，左侧搜索图标

### Navigation

- **胶囊顶栏:** 白 86–90% 不透明 + blur 22px；Tab 激活 = 翠绿字 + 底部 3px 圆角条
- **工作区 Tab:** 12px 字，column 图标+文字，激活色 `#00b88f` + inset 底边

### Modals

- **背景:** `modal-backdrop` 半透明遮罩
- **卡片:** 白底 12–16px 圆角，shadow-lg；复用 `useModalFocus` + Esc（标准要求，部分旧模态待补齐）

### Badges

- `.badge-public` 薄荷浅底 + 深绿字；`.badge-private` 灰白；`.badge-accent` 蓝系信息态

## Do's and Don'ts

### Do:

- **Do** 新页面使用 `src/styles.css` 的 CSS 变量（`--brand-accent`、`--text-primary`、`--radius-md` 等），不要复制硬编码 hex。
- **Do** 保留「全屏背景 + 浮动胶囊导航 + 白/玻璃内容区」三层结构，与 `OverviewView` / `GalleryWorkspaceView` 一致。
- **Do** 主按钮用翠绿渐变；登录页单独使用 `auth-cta` 黄绿渐变样式类。
- **Do** 用 Plus Jakarta Sans 作为唯一 UI 字体；中文文案自然断行，不强制 uppercase。
- **Do** 图标使用项目 `Icon.vue` 组件，16px 为 inline 默认，18–22px 为品牌/空态。
- **Do** 空态与错误态使用浅红底 `#fef2f2` + `#dc2626` 或 auth 卡片内的半透明红框，保持可读。

### Don't:

- **Don't** 引入第二套主色（蓝紫 SaaS 色、纯 Tailwind 默认 indigo）作为行动色。
- **Don't** 在新页面使用 Inter、Roboto 或 unprefixed `system-ui` 作为主字体。
- **Don't** 把登录页的深色玻璃输入样式套用到已登录的白底表单。
- **Don't** 使用纯灰 `#f3f4f6` 大底无背景图的新页面——会破坏「画廊空间」连续性；至少使用 `--bg-app` 或场景背景图。
- **Don't** 添加重边框线框风（1px 全局 divider 网格）或直角按钮；圆角 8px 以下仅用于内嵌元素。
- **Don't** 在 UI 文案中暴露开发端口（如 5174）；错误提示面向用户结果。
- **Don't** 使用 10px 以下字号；功能标签最低 12px。

## Reference Surfaces（视觉基准页）

| 页面 | 文件 | 场景 |
|------|------|------|
| 登录/注册 | `src/views/OverviewView.vue` `.auth-immersive` | 深色玻璃 + 全屏摄影 |
| 我的空间 | `src/views/OverviewView.vue` `.space-page` | 浅色玻璃 + 卡片栅格 |
| 相册工作区 | `src/views/GalleryWorkspaceView.vue` `.hall-page` | 工作台 + 侧栏 |
| 全局令牌 | `src/styles.css` `:root` | 组件与工具类 |

新功能（P1-03 策展、P1-05 分享面板等）应先在 `styles.css` 扩展 token，再在 Vue 中消费变量，避免再次分叉。
