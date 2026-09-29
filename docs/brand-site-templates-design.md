# 品牌站精美模板设计方案

| 项目 | 内容 |
|---|---|
| 文档编号 | DESIGN-TEMPLATE-001 |
| 版本 | v0.1（草案 / 待评审） |
| 状态 | 草案 |
| 关联文档 | `docs/freemium-product-tiering-prd.md`（PRD-FREEMIUM-001 v1.1）、`docs/personal-album-v1-plan.md` |
| 承接 PRD 条目 | §4.1 模板分层、§11 后续工作第 5 项「品牌站主页与项目模板设计稿」 |

> **定位说明**：本文档回答 PRD 明确留白的"品牌站模板具体设计稿"。范围是**品牌站主页模板 + 项目页模板 + 品牌定制系统**的数据结构、设计语言与工程承载方式；不涉及定价（PRD §1.3）、不涉及模板商店/付费模板二次分层（见 §3 原则 T2）。

---

## 1. 背景与问题定义

PRD v1.1 确立了双资产模型：付费理由是"一个可经营的品牌站资产"，核心闭环为 **品牌站 → 精选项目 → 联系转化 → 询盘可量化**。模板是该资产的第一观感，直接决定两件事：

1. **独立摄影师是否愿意把站点印在名片上**——专业感是付费的核心情绪价值（D1/D2）；
2. **访客 3 秒内是否理解"这是位值得联络的摄影师"**——模板必须服务转化而非炫技。

工程现状：ViewerConfig 已有成熟的三层预设机制（`presetName` + builtin presets + `/presets/*.json`）、草稿/发布双版本（`GalleryViewerConfig` + 版本表）、admin 配置面板 + iframe postMessage 实时预览范式。品牌站无任何代码，模板体系可整体复用这套范式，但**现有 ViewerConfig 只覆盖"展厅氛围"，不含品牌信息、项目编组、联系方式等站点字段**，需要新增站点配置层。

### 1.1 与相册氛围预设的关系（分层澄清）

PRD §4.1 已定：**全部氛围预设免费开放**（P1：3D 效果不分档）。因此本文的"模板"特指**站点层**：

```
免费（挂账号）                       付费（挂品牌站订阅）
├── 相册 3D 展厅：ViewerConfig       ├── 站点主页模板（本文 §5：T0–T4）
│   └── 6 套氛围预设，全部免费        ├── 项目页排版（随站点模板）
│       （后续新增预设仍全部免费）    ├── 品牌定制（Logo/主色/名称，§6）
│                                   └── 模板 × 氛围预设联动推荐（§5.6）
```

氛围预设与站点模板是两个正交层：模板决定"站点长什么样"，氛围预设决定"点进 3D 展厅后是什么氛围"。品牌站主页通过"推荐搭配"把两层串起来，但不做强制绑定。

---

## 2. 目标与非目标

### 2.1 目标

- G1：首发 1 套默认模板 + 4 套精品模板，覆盖独立摄影师四类主流题材（商业/建筑、婚礼/人像、旅行/风光/纪实、通用旗舰演示）；
- G2：任何用户在默认模板下 **5 分钟内**完成"填品牌 → 选封面 → 上项目 → 留联系方式 → 发布"全流程；
- G3：模板可整体切换且**内容不丢**（内容与外观分离存储）；
- G4：每套模板在移动端达标性能预算（§5.7），低端设备 3D 自动降级不阻塞（PRD §9.2）；
- G5：品牌定制（名称/Logo/主色）横切所有模板，通过 design tokens 实现，不破坏模板性格。

### 2.2 非目标

- 不做用户自建模板/模板市场；
- 不做多品牌站（PRD：首版每账号 1 站）；
- 不做首页 i18n 多语言排版（中文优先，西文字体作辅助）；
- 不实现自定义域名下的模板差异。

---

## 3. 设计原则

| 编号 | 原则 | 说明 |
|---|---|---|
| T1 | **照片是主角，模板是相框** | 模板的装饰密度做减法：大留白、克制动效、中性底色，让摄影作品主导画面。任何模板的 UI 面积占比默认 ≤ 25% |
| T2 | **模板不设二次付费墙** | 5 套模板对 TRIAL/ACTIVE 全量开放。付费差异收敛在 PRD D11 的五项刚性（站点资产本身），避免"订阅内再卖模板"损伤 D8 单档结构 |
| T3 | **内容与外观分离** | 品牌信息、文案、项目、联系方式存 `content`；模板骨架与排版存 `templateId + tokens`。切换模板只换壳 |
| T4 | **转化路径是模板的一部分** | 微信号展示/复制、站内表单、联系点击埋点（WP-13）是每套模板的**必备区块**，缺一不可过模板验收 |
| T5 | **复用既有范式** | 模板定义 = 站点级 preset（对齐 `lightingPresets` 模式）；站点配置版本化对齐 `GalleryViewerConfig` 草稿/发布机制；预览对齐 postMessage 握手 |

---

## 4. 模板体系结构

### 4.1 三层结构

```
SiteTemplate（模板定义，内置代码/静态 JSON，随版本发布）
 ├── sections:   区块编排（§4.2）
 ├── tokens:     设计变量基线（字体/色彩/间距/圆角，§6.1）
 ├── motion:     动效性格（§5 各套定义）
 ├── pairing:    推荐氛围预设（§5.6）
 └── variants:   项目卡密度变体（§4.3）

BrandSiteConfig（站点配置，用户数据，草稿/发布双版本）
 ├── templateId + variant
 ├── content:  brand / hero / projects / about / contact / seo
 └── overrides: 用户级 token 覆写（仅 allowedOverrides 白名单内）

渲染结果 = SiteTemplate.tokens ⊕ content ⊕ overrides
```

### 4.2 区块编排（Section Catalog）

模板不发明新结构，从统一区块目录中选取与排序：

| 区块 | 内容 | 必备 |
|---|---|---|
| `nav` | 品牌 Logo + 名称 + 锚点导航（项目/关于/联系） | ✔ |
| `hero` | 主视觉 + 一句话定位 + 主 CTA（"查看作品"/"联系我"） | ✔ |
| `projects` | 精选项目列表（引用相册，≤10，§4.3 变体） | ✔ |
| `about` | 摄影师介绍 + 形象照 | 可选 |
| `contact` | 微信号展示/复制、站内表单、（后期）社交链接 | ✔ |
| `footer` | 版权 + 备案/平台标识；**免费分享页"由 VIE Gallery 提供"水印不出现在品牌站**（去水印权益） | ✔ |

### 4.3 项目卡变体（variants）

同一模板内可切换项目卡密度，解决"3 个大气项目 vs 10 个丰富项目"的编排矛盾：

| 变体 | 形态 | 适用 |
|---|---|---|
| `feature` | 通栏大图，逐个全宽纵向排列 | 项目数 ≤ 4，商业/婚礼单组大片 |
| `mosaic` | 双列瀑布卡（默认） | 项目数 3–8 |
| `index` | 紧凑列表（缩略图 + 标题 + 年份） | 项目数 6–10，编辑感强 |

**项目页**（点击项目卡后）：项目头（封面 + 标题 + 简介 + 拍摄信息）+ **"进入 3D 展厅"入口**（复用现有 Viewer 页面，相册不搬家）+ 图集缩略网格（可选）。项目页排版随站点模板，不单独设模板。

---

## 5. 首发模板清单

首发共 5 套：T0 默认款 + T1–T4 精品款。每套包含：定位人群、版式骨架、设计 tokens、动效性格、氛围预设搭配、性能预算。

### T0 「素笺」Plain Page（默认款）

所有新站的初始模板，也是 TRIAL 引导流程的落点。目标：**零审美门槛、零决策成本**。

```
┌──────────────────────────┐
│ ◉ 陈小摄影        项目 关于 联系 │  nav：单行品牌条
├──────────────────────────┤
│                          │
│      全屏封面图            │  hero：16:9 封面 + 叠加标题
│   「用镜头收藏山与海」       │
│      [ 查看作品 ]          │
├──────────────────────────┤
│  ┌────────┐ ┌────────┐   │  projects：mosaic 双列
│  │ 项目 1  │ │ 项目 2  │   │
│  └────────┘ └────────┘   │
├──────────────────────────┤
│  关于我 · 两行简介 + 形象照  │  about：紧凑横排
├──────────────────────────┤
│  微信号：xxx [复制]  [ 留言 ] │  contact：单行直达
└──────────────────────────┘
```

- **tokens**：`Noto Sans SC` 全套；底色 `#FFFFFF` / 文字 `#1A1A1A`；主色仅用于 CTA 按钮；圆角 8px；区块间距宽松。
- **动效**：仅滚动淡入（opacity + 12px 位移），无其他。
- **搭配**：任意氛围预设，默认 `minimal`。

### T1 「白盒」White Box（商业 / 建筑 / 静物）

画廊白盒式极简，像素级网格感，服务"作品集 = 能力证明"的商业摄影师。

```
┌──────────────────────────────┐
│ CHEN STUDIO          作品 关于 联络 │
│ ──────────────────────────── │
│ 商业空间与建筑摄影               │  hero：大号紧排标题（无大图）
│ 2019 — 2026 · 上海             │        底部一条细横线
│                               │
│ 01  城市光合 —— 万科中心        │  projects：index 列表导航
│ 02  白盒子 —— 美术馆改造        │        hover 显示缩略图
│ 03  静物练习 —— 器物十二件       │
│                               │
│ ┌───────────────────────────┐ │  选中项目：feature 通栏
│ │        全宽大图             │ │
│ └───────────────────────────┘ │
│ 联络方式 →  微信 ____ [复制]     │  contact：极简文字链
└──────────────────────────────┘
```

- **tokens**：底色纯白 `#FAFAF8`、文字 `#111111`、灰阶层级 3 档；标题 `Noto Sans SC` 700 紧排 + 西文 `Inter`；**主色只出现在 CTA 与 hover 细线**；无圆角（0px）、细边框 1px。
- **动效**：hover 图片 1.02 微缩放、滚动 reveal 细线展开。克制、干脆。
- **适用**：建筑空间、商业产品、静物；**编号式项目列表**强化"作品编年"的专业感。

### T2 「暗房」Darkroom（婚礼 / 人像 / 夜景）

近黑影调 + 胶片质感，情感浓度最高的一套，为"卖氛围"的婚礼人像摄影师设计。

```
┌──────────────────────────────┐
│ ◉ 拾光影像              ⌂ 作品 联络 │   深色毛玻璃 nav
├──────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░   全屏暗调婚礼照（暗角）     ░ │  hero：全出血图 + 衬线标题
│ ░      「把那天留住」         ░ │        叠加渐晕
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├──────────────────────────────┤
│  ┌──────┐  ┌──────┐          │  projects：mosaic
│  │ 胶片框 │  │ 胶片框 │          │  卡片带 8px 胶片边框
│  └──────┘  └──────┘          │
│   「山野手记」· 2026           │
├──────────────────────────────┤
│  关于 · 手写体点缀一句话        │
│  ── 微信拾光 [复制] ── [ 留言 ] │  contact：居中仪式感排布
└──────────────────────────────┘
```

- **tokens**：底色 `#0E0E12`、面板 `#16161C`、文字 `#EDEDF0`；标题 `Noto Serif SC`（思源宋）；主色自动派生为**点缀描边与分隔线**（深底上不做大面积色块）；辅助金 `#C8A96A`（可被品牌主色替换）。
- **动效**：hero 缓慢 Ken Burns 缩放（≤1.05）、卡片 hover 胶片框亮起、滚动淡入。
- **搭配**：强烈推荐 `starry-night` / `romantic` 展厅氛围，形成"暗房 → 星空展厅"的叙事连续。

### T3 「山野手记」Field Notes（旅行 / 风光 / 纪实）

纸质杂志编辑风，不对称网格 + 编号章节，服务"作品会讲故事"的旅行纪实摄影师。

```
┌──────────────────────────────┐
│ 山野手记 FIELD NOTES    目录 联络 │  纸感顶栏，中英文混排
├──────────────────────────────┤
│   第一章                      │
│   滇西行 · 十日      （竖排点缀）│  hero：左文右图不对称
│  ┌────────────┐  │视│        │
│  │  大幅横图    │  │频│        │
│  └────────────┘               │
│  ─ 02 ─                      │
│      ┌──────────┐            │  projects：mosaic 交错错位
│  03  │  项目卡    │  ┌──────┐  │  （左右交错 margin）
│      └──────────┘  │ 卡片  │  │
│ 手写体下划线：关于我 ↓          │
│ ✎ 微信：shanye2026 [复制]      │  contact：便签样式卡片
└──────────────────────────────┘
```

- **tokens**：底色纸感米白 `#F7F4EE`、文字 `#2B2A26`；标题 `Noto Serif SC` + 西文衬线；编号/标注用等宽体；主色用于**手绘下划线、编号、便签描边**；圆角 2px、轻投影。
- **动效**：卡片错位视差（幅度小）、编号滚动计数、淡入。
- **搭配**：`forest-dream` / `sunset-glow`。

### T4 「流光」Lumen（旗舰演示款）

最能打 3D 差异化的一套，也是**陪跑试点与销售演示的招牌**：Hero 直接嵌入 3D 展厅实时预览，"网站本身就是 3D 作品"。

```
┌──────────────────────────────┐
│ ◉ LUMEN·流光           作品 联络 │
├──────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓  实时 3D 展厅（Viewer 只读挂载）▓ │  hero：iframe 嵌入
│ ▓   标题叠加 · 自动巡游运镜      ▓ │  （复用 viewer + postMessage）
│ ▓      [ 进入展厅 ]            ▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├──────────────────────────────┤
│  全出血项目大图（滚动视差）       │  projects：feature
│  ── 底部悬浮"3D 看这一组"按钮 ──  │
├──────────────────────────────┤
│  联系 · 全屏深色一屏            │  contact：整屏区块
└──────────────────────────────┘
```

- **tokens**：深浅双态自适应（跟随所配氛围预设）；标题 `Noto Sans SC` 细体大号；主色用于 CTA 光晕。
- **动效**：滚动视差 + 项目图间 3D 场景入口过渡。
- **搭配**：`ocean-breeze` / `starry-night` / `romantic`。
- **降级策略（硬性）**：移动端 / 低端设备 Hero 3D 自动降级为封面静帧 + "进入 3D 展厅"按钮；复用 Viewer 既有 `quality: 'auto'` 与 `autoAdjustForDevice` 判定，不重复造检测。

### 5.6 模板 × 氛围预设搭配表（pairing）

| 模板 | 首推搭配 | 备选 | 说明 |
|---|---|---|---|
| T0 素笺 | minimal | 任意 | 中性打底 |
| T1 白盒 | minimal | fresh | 商业感的干净延续 |
| T2 暗房 | starry-night | romantic / sunset-glow | 暗调叙事连续 |
| T3 山野手记 | forest-dream | sunset-glow | 自然光延续 |
| T4 流光 | ocean-breeze | starry-night / romantic | 主打 3D 本身 |

搭配仅为**默认值与推荐位**（建站向导第二步"选氛围"中置顶展示），用户可改任意氛围预设——呼应 P1"3D 效果不分档"。

### 5.7 性能预算（每套模板验收线）

| 指标 | 预算 |
|---|---|
| 首屏 LCP（移动端 4G） | ≤ 2.5s（T4 的 3D Hero 降级静帧后 ≤ 2.8s） |
| 模板自身 CSS+JS（不含图片/3D） | ≤ 120KB gzip |
| 动效 | 全部 transform/opacity 合成层属性；`prefers-reduced-motion` 下全关 |
| 字体 | 仅系统栈 + 思源系（Noto Serif/Sans SC）子集化按需加载，≤ 2 个字体族 |
| 3D 嵌入 | 仅 T4 hero + 项目页入口；其余模板 3D 只存在于"进入展厅"跳转后 |

---

## 6. 品牌定制系统

PRD D11 定界：品牌定制 = **名称、Logo、主色**。实现为 design tokens 横切所有模板。

### 6.1 Token 清单

```css
:root {
  /* 内容方注入（用户可改） */
  --bs-brand-name;        /* 站点名 */
  --bs-brand-logo;        /* Logo 图（SVG/PNG，≤256KB） */
  --bs-color-primary;     /* 品牌主色 */

  /* 模板基线（用户不可直接改，随 templateId 切换） */
  --bs-color-bg; --bs-color-surface; --bs-color-text; --bs-color-text-muted;
  --bs-font-display; --bs-font-body;
  --bs-space-section; --bs-radius; --bs-maxw;

  /* 由主色自动派生（§6.2），用户不可改 */
  --bs-color-primary-hover;
  --bs-color-on-primary;   /* 主色上的文字色，保 WCAG AA */
  --bs-color-primary-soft; /* 12% 透明度点缀底 */
}
```

### 6.2 主色派生规则（防"用户选了荧光绿毁掉模板"）

- 每套模板声明 `primaryRole: 'cta' | 'accent' | 'edge'`——T0/T4 主色做 CTA 色块，T1 只做 hover 线条，T2/T3 做点缀描边。同一主色在不同模板中呈现强度不同，保住模板性格；
- 派生：hover = 主色明度 −10%；`on-primary` 按 WCAG 对比度 ≥ 4.5 自动在黑/白间选择；超饱和/超低对比主色在建站向导中给黄色提示但**不阻断**；
- Logo 若未上传：以品牌名首字生成单字 Logo（模板字体渲染 + 主色底/描边），避免空档。

### 6.3 深浅色与水印

- T2/T4 深色模板下，主色统一走"描边/文字"通道，禁止大面积色块（保证任何主色在深底上不刺眼）；
- 品牌站访客页**无平台水印**（付费权益）；`TRIAL` 状态在 footer 追加小字"试用中"（PRD §5.1，模板层只需预留 footer 标识槽位）。

---

## 7. 数据与类型设计

### 7.1 契约类型（`packages/gallery-contracts/src/index.ts` 新增）

```ts
export interface BrandSiteContent {
  brand: { name: string; logoStorageObjectId?: string; primaryColor: string }
  hero: { headline: string; subHeadline?: string; coverPhotoId?: string;
          cta: { label: string; action: 'scroll-projects' | 'contact' } }
  projects: Array<{           // 引用相册，不搬家（PRD §3.1）
    galleryId: string; title: string; summary?: string;
    coverPhotoId?: string; sortOrder: number; archived: boolean
  }>
  about?: { body: string; portraitPhotoId?: string }
  contact: { wechatId?: string; formEnabled: boolean; formIntro?: string }
  seo: { title: string; description: string }   // 品牌站默认允许收录（PRD §4.1）
}

export interface BrandSiteConfig {
  templateId: string                 // 'plain' | 'white-box' | 'darkroom' | 'field-notes' | 'lumen'
  projectCardVariant: 'feature' | 'mosaic' | 'index'
  content: BrandSiteContent
  overrides?: Record<string, string> // 仅模板 allowedOverrides 白名单内的 token
}

export interface BrandSiteResponse {  // 对齐 ViewerConfigResponse 范式
  siteId: string; subdomain: string;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED';
  enabled: boolean;
  config: BrandSiteConfig;            // 读取方视角自动取已发布版本
  lastPublishedAt?: string;
  publishedVersionId?: string;
}
```

### 7.2 模板定义（内置，对齐 `lightingPresets.ts` 模式）

```ts
// gallery-viewer / 站点渲染端共享
export interface SiteTemplate {
  id: string; name: string; tagline: string;
  thumbnail: string;                 // admin 模板画廊静态图
  sections: Array<'nav' | 'hero' | 'projects' | 'about' | 'contact' | 'footer'>;
  tokens: Record<string, string>;    // §6.1 模板基线
  primaryRole: 'cta' | 'accent' | 'edge';
  pairing: { recommended: string; alternatives: string[] };  // 氛围预设 id
  allowedOverrides: string[];        // 白名单，如 ['--bs-font-display']
  heroMode: 'cover' | 'live3d';      // T4 = 'live3d'
}
```

模板缩略图与 demo 数据随前端包发布（`/site-templates/{id}/` 目录：`template.json + thumbnail.webp + demo content`），admin 模板画廊用 demo content 渲染预览。

### 7.3 数据库（Flyway 沿 V 序列新增，命名示意 V17+）

```
brand_site              站点主表：id, tenant_id, subdomain, status,
                        config_draft_json, schema_version, timestamps
brand_site_config_version  版本表：对齐 gallery_viewer_config_version 结构
```

- `subdomain` 唯一约束 + 泛子域名保留字校验（www/api/admin 等黑名单）；
- 草稿/发布/回滚/`publish-readiness` 逻辑复用 `GalleryViewerConfig` 的领域服务形态，不另起机制。

---

## 8. 工程落地方案

| 工作项 | 方案 |
|---|---|
| 站点渲染端 | 新增 `apps/gallery-site`（SSR 或轻 SSG 的访客站）**或**由 gallery-viewer 扩展站点路由——**倾向前者**：品牌站是 SEO 载体（默认允许收录），无 router 的 viewer 不适合承载；Viewer 以只读 iframe/跳转方式被嵌入 |
| Admin 配置 | 新增「品牌站」工作区（复用 `GalleryConfigPanel` 的 tab 范式）：**模板画廊**（缩略图卡片，demo content 实时预览）→ **内容编辑**（hero/项目/关于/联系表单）→ **品牌定制**（Logo 上传、主色取色器）→ **发布中心**（复用 usePublishCenter） |
| 实时预览 | 复用 iframe postMessage 握手；新增消息 `BS_TEMPLATE_CHANGE` / `BS_CONTENT_CHANGE`（对齐 `VIE_PRESET_CHANGE` 命名习惯） |
| 模板切换 | T3 内容/外观分离：换 `templateId` 只换壳；若新模板 `sections` 缺失某区块或 `allowedOverrides` 收窄，弹窗列明"将暂时隐藏/重置的字段"后确认，**content 原文永远保留**（P4 精神） |
| 转化埋点 | 微信复制按钮、表单提交、项目卡点击 → 联系点击数（PRD 获客看板北极星），挂 WP-13 的 track-event 通道，事件名 `site_contact_click` / `site_form_submit` / `site_project_open` |
| 移动端 | 全部模板 mobile-first 单列断点；T4 hero 3D 按 §5.7 降级 |
| SEO | 品牌站渲染端输出 meta/OG 标签（取 `seo` 字段）；TRIAL/EXPIRED 状态页输出 `noindex` |

---

## 9. 与订阅状态机联动

| 状态 | 模板表现 |
|---|---|
| TRIAL | 全部 5 套模板可用；footer 小字"试用中"（不可去除） |
| ACTIVE | 同 TRIAL，标识去除 |
| EXPIRED | 公开访问整体下线（极简暂停页，PRD §5.2），模板配置原样保留——**无需"模板降级"逻辑**，避免任何"白做了"体验（P4） |

结论：**模板层不感知计费**，只感知站点状态机；不设"免费模板/付费模板"差档（原则 T2）。

---

## 10. 验收标准

- [ ] 5 套模板全链路可用：选择 → 内容填充 → 品牌定制 → 发布至泛子域名 → 移动端/桌面端渲染正确
- [ ] 模板切换后 content 完整保留，被收窄字段有明确提示；草稿/发布/回滚与相册配置同套机制
- [ ] 每套模板包含完整转化区块，微信复制/表单/项目点击埋点上报准确
- [ ] 品牌主色经 §6.2 派生后，所有模板文字对比度 ≥ WCAG AA
- [ ] §5.7 性能预算全数达标（Lighthouse 移动端 ≥ 85 作为回归基线）
- [ ] `prefers-reduced-motion` 与低端设备降级路径可用
- [ ] TRIAL/EXPIRED 状态表现符合 §9 与 PRD §5

## 11. 里程碑建议

| 阶段 | 内容 | 依赖 |
|---|---|---|
| M1 | 本方案评审定稿 + Figma 高保真（5 套 × 桌面/移动） | 高保真 HTML 原型已产出：`design/brand-site-templates/`（入口 `index.html`，含双断点截图 `shots/`） |
| M2 | 站点渲染端骨架 + T0 默认款 + BrandSiteConfig 版本化 + admin 工作区 | 泛子域名基建（PRD §11.7） |
| M3 | T1–T3 精品款 + 品牌定制 tokens 系统 | M2 |
| M4 | T4 流光（3D Hero 嵌入与降级）+ 转化埋点接入 | WP-12/13 埋点 |
| M5 | 陪跑试点（PRD §8.2）反馈驱动的模板迭代 | 试点方案 |

## 附录：设计决策记录

| 编号 | 决策 | 理由 |
|---|---|---|
| TD1 | 模板不设二次付费差档，随订阅全量开放 | 维持 D8 单档结构；付费价值锚定站点资产本身 |
| TD2 | 内容与外观分离存储 | 模板切换不丢内容，落实 P4 |
| TD3 | 首发默认款 T0 + 4 精品款，而非"10+ 付费模板" | 对齐 PRD §4.1 对 v1.0 的修正；精品少而精 |
| TD4 | 品牌站渲染端倾向独立 app 而非扩展 viewer | SEO 是品牌站获客前提；viewer 无路由且职责单一 |
| TD5 | 主色派生 + `primaryRole` 分级 | 防止用户主色破坏模板性格，保住专业感底线 |
| TD6 | 3D 仅在 T4 hero 与项目页入口出现 | 性能预算优先；3D 差异化集中在招牌场景 |

## 附录 B：工程落地记录（2026-09-29）

本文档 §5 全部 5 套模板已按 M2–M4 范围完成工程化并通过线上验收（v1 模板层）：

| 工作项 | 落地 |
|---|---|
| 契约 | `packages/gallery-contracts`：`BrandSiteContent/Config/Response`、`SiteTemplate` 接口、5 套模板定义与 demo 内容（渲染端/admin 单一数据源）、主色派生（`brandTokens.ts`，WCAG AA）、`BS_*` 预览消息常量 |
| 站点渲染端 | `apps/gallery-site`（新应用，部署于 `/site/`）：6 个共享区块组件 × 5 套模板皮肤（`.tpl-{id}` 作用域）；feature/mosaic/index 三种项目卡变体；T4 hero 实时 iframe 嵌入 Viewer + 移动端/省流/低内存/reduced-motion 自动降级静帧；转化区块（微信复制/站内表单/`site_*` 埋点 sendBeacon 接缝）；TRIAL footer 标识与 EXPIRED 暂停页；meta/OG 输出（TRIAL/EXPIRED 输出 noindex）；CSS+JS gzip ≈ 46KB（预算 120KB） |
| 后端 | Flyway `V16__brand_site.sql`（brand_site / brand_site_config_version / brand_site_inquiry）；`BrandSiteFacade` 草稿-发布-回滚对齐 `GalleryViewerConfigFacade` 范式；管理端点 `/api/brand-site*`；公开端点 `/api/public/sites/**`（公开读 + 询盘 + 埋点接缝）；Logo 上传（≤256KB）；子域名保留字黑名单校验 |
| Admin 工作区 | `/app/site`：模板画廊（缩略图 + pairing + 切换影响提示弹窗）→ 内容编辑（hero/项目引用相册/关于/联系/SEO，图片从相册选取）→ 品牌定制（名称/Logo 上传/主色取色器 + 派生色板 + 低对比黄色提示）→ 发布中心（子域名/状态/发布/版本回滚）；右侧 iframe 实时预览（`BS_PREVIEW_READY`/`BS_CONFIG_UPDATE`/`BS_TEMPLATE_CHANGE`/`BS_CONTENT_CHANGE`） |
| 部署 | 工作流新增 Site UI 构建与 rsync；Nginx 新增 `/site/` 静态路径 |

**与本文档的差异/待办**：

- 泛子域名 serving（PRD §11.7）未上线：过渡期以 `?site={subdomain}` 查询参数定位站点，Nginx 路径为 `/site/`；基建就绪后切泛子域名 host 解析（渲染端 `resolveHostSubdomain` 已预留）。
- `POST /api/public/sites/{sub}/events` 目前只回 204，事件聚合随 WP-13 track-event 通道接入；询盘已落库（`brand_site_inquiry`），后台查看列表待后续工作区。
- 性能预算验收：模板自身 CSS+JS ≈ 46KB gzip 达标；LCP ≥85 的 Lighthouse 回归与思源字体子集化按需加载列入后续回归清单。
- 高保真原型已入库 `design/brand-site-templates/`（入口 `index.html`；`shots/` 双断点截图体积原因未入库，缩略图已随 `apps/gallery-admin/public/site-templates/` 发布）。
