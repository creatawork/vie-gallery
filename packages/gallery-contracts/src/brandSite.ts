/**
 * 品牌站（Brand Site）契约层 —— 对齐 docs/brand-site-templates-design.md §4/§6/§7。
 *
 * 三层结构（§4.1）：
 *   SiteTemplate     模板定义（内置，随版本发布，本文件 SITE_TEMPLATES）
 *   BrandSiteConfig  站点配置（用户数据，草稿/发布双版本，content 与外观分离）
 *   渲染结果 = SiteTemplate.tokens ⊕ content ⊕ overrides
 */

export type BrandSiteStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED'

export type ProjectCardVariant = 'feature' | 'mosaic' | 'index'

export type SiteTemplateSectionId = 'nav' | 'hero' | 'projects' | 'about' | 'contact' | 'footer'

export interface BrandSiteProjectRef {
  /** 引用相册，不搬家（PRD §3.1） */
  galleryId: string
  title: string
  summary?: string
  coverPhotoId?: string
  year?: string
  sortOrder: number
  archived: boolean
}

export interface BrandSiteContent {
  brand: {
    name: string
    /** 上传后的 storage_object id；未上传时渲染端以品牌名首字生成单字 Logo（§6.2） */
    logoStorageObjectId?: string
    primaryColor: string
  }
  hero: {
    headline: string
    subHeadline?: string
    coverPhotoId?: string
    cta: { label: string; action: 'scroll-projects' | 'contact' }
  }
  projects: BrandSiteProjectRef[]
  about?: { body: string; portraitPhotoId?: string }
  contact: {
    wechatId?: string
    formEnabled: boolean
    formIntro?: string
  }
  seo: { title: string; description: string }
}

export interface BrandSiteConfig {
  /** 'plain' | 'white-box' | 'darkroom' | 'field-notes' | 'lumen' */
  templateId: string
  projectCardVariant: ProjectCardVariant
  content: BrandSiteContent
  /** 仅模板 allowedOverrides 白名单内的 token 键（不含 `--bs-` 前缀） */
  overrides?: Record<string, string>
}

/** 公开端点为项目引用解析出的展示资产（相册 slug / 图片 URL），配置原文不改动 */
export interface BrandSiteResolvedProject {
  galleryId: string
  slug?: string
  coverUrl?: string
  photoCount?: number
}

export interface BrandSiteResolvedAssets {
  /** 品牌 Logo 的读取 URL（未上传时缺省，渲染端回退单字 Logo） */
  logoUrl?: string
  /** photoId → 图片 URL（hero 封面 / 形象照 / 项目封面统一解析） */
  photos: Record<string, string>
  projects: BrandSiteResolvedProject[]
}

export interface BrandSiteResponse {
  siteId: string
  subdomain?: string | null
  status: BrandSiteStatus
  enabled: boolean
  /** 读取方视角自动取已发布版本（创建者预览场景为草稿） */
  config: BrandSiteConfig
  lastPublishedAt?: string | null
  publishedVersionId?: string | null
  /** 草稿较已发布版本有变更（对齐 Gallery.hasUnpublishedConfig 语义） */
  hasUnpublishedChanges?: boolean
  resolved?: BrandSiteResolvedAssets
}

export interface BrandSiteVersion {
  id: string
  siteId: string
  configJson: string
  templateId?: string | null
  schemaVersion: number
  createdAt: string
  createdByUserId?: string | null
}

export interface BrandSiteVersionPage {
  items: BrandSiteVersion[]
  page: number
  pageSize: number
  total: number
}

export interface BrandSiteInquiryRequest {
  name: string
  message: string
}

/* ------------------------------------------------------------------ */
/* 模板定义（§7.2，对齐 lightingPresets.ts 模式，渲染端 / admin 共享） */
/* ------------------------------------------------------------------ */

export interface SiteTemplateMotion {
  heroKenBurns?: boolean
  parallax?: boolean
  hoverZoom?: number
  lineReveal?: boolean
  indexThumbFollow?: boolean
}

export interface SiteTemplate {
  id: string
  name: string
  tagline: string
  /** admin 模板画廊静态图（相对前端包 public 的路径） */
  thumbnail: string
  sections: SiteTemplateSectionId[]
  /** 设计变量基线（§6.1），键名不含 `--bs-` 前缀 */
  tokens: Record<string, string>
  /** 主色出场方式：cta 色块 / accent 点缀描边 / edge hover 细线（§6.2） */
  primaryRole: 'cta' | 'accent' | 'edge'
  pairing: { recommended: string; alternatives: string[] }
  allowedOverrides: string[]
  heroMode: 'cover' | 'live3d'
  defaultVariant: ProjectCardVariant
  motion: SiteTemplateMotion
}

export const SITE_TEMPLATE_IDS = ['plain', 'white-box', 'darkroom', 'field-notes', 'lumen'] as const

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    id: 'plain',
    name: '素笺',
    tagline: '默认款 · 零审美门槛，白底大图，5 分钟建好第一版',
    thumbnail: 'site-templates/plain/thumbnail.png',
    sections: ['nav', 'hero', 'projects', 'about', 'contact', 'footer'],
    tokens: {
      'color-bg': '#FFFFFF',
      'color-surface': '#FCFCFB',
      'color-text': '#1A1A1A',
      'color-text-muted': '#8A8A86',
      'color-line': '#ECECEA',
      'body-size': '16px',
      'body-line-height': '1.75',
      'body-weight': '400',
      'color-nav-bg': 'rgba(255,255,255,0.92)',
      'space-section-mobile': '72px',
      'font-display': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-body': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'space-section': '112px',
      radius: '8px',
      maxw: '1080px',
    },
    primaryRole: 'cta',
    pairing: { recommended: 'minimal', alternatives: [] },
    allowedOverrides: ['color-primary', 'font-display', 'space-section', 'maxw'],
    heroMode: 'cover',
    defaultVariant: 'mosaic',
    motion: { hoverZoom: 0.025 },
  },
  {
    id: 'white-box',
    name: '白盒',
    tagline: '商业 / 建筑 / 静物 · 画廊白盒式极简，编号作品索引',
    thumbnail: 'site-templates/white-box/thumbnail.png',
    sections: ['nav', 'hero', 'projects', 'about', 'contact', 'footer'],
    tokens: {
      'color-bg': '#FAFAF8',
      'color-surface': '#FFFFFF',
      'color-text': '#111111',
      'color-text-muted': '#8C8C88',
      'color-line': '#E3E1DC',
      'body-size': '15px',
      'body-line-height': '1.8',
      'body-weight': '400',
      'color-nav-bg': 'rgba(250,250,248,0.94)',
      'space-section-mobile': '84px',
      'font-display': "'Archivo','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-body': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-latin': "'Archivo','Noto Sans SC',sans-serif",
      'space-section': '128px',
      radius: '0px',
      maxw: '1160px',
    },
    primaryRole: 'edge',
    pairing: { recommended: 'minimal', alternatives: ['fresh'] },
    allowedOverrides: ['color-primary', 'font-display', 'space-section'],
    heroMode: 'cover',
    defaultVariant: 'index',
    motion: { hoverZoom: 0.02, lineReveal: true, indexThumbFollow: true },
  },
  {
    id: 'darkroom',
    name: '暗房',
    tagline: '婚礼 / 人像 / 夜景 · 近黑影调胶片质感，情感浓度最高',
    thumbnail: 'site-templates/darkroom/thumbnail.png',
    sections: ['nav', 'hero', 'projects', 'about', 'contact', 'footer'],
    tokens: {
      'color-bg': '#0E0E12',
      'color-surface': '#16161C',
      'color-text': '#EDEDF0',
      'color-text-muted': '#9B9BA4',
      'color-line': '#26262E',
      'body-size': '15.5px',
      'body-line-height': '1.85',
      'body-weight': '400',
      'color-nav-bg': 'rgba(14,14,18,0.82)',
      'space-section-mobile': '84px',
      'font-display': "'Noto Serif SC','Songti SC','SimSun',serif",
      'font-body': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-hand': "'Kaiti SC','KaiTi','STKaiti',serif",
      'space-section': '120px',
      radius: '2px',
      maxw: '1120px',
    },
    primaryRole: 'accent',
    pairing: { recommended: 'starry-night', alternatives: ['romantic', 'sunset-glow'] },
    allowedOverrides: ['color-primary', 'font-display', 'space-section'],
    heroMode: 'cover',
    defaultVariant: 'mosaic',
    motion: { heroKenBurns: true, hoverZoom: 0.03 },
  },
  {
    id: 'field-notes',
    name: '山野手记',
    tagline: '旅行 / 风光 / 纪实 · 纸质杂志编辑风，交错章节编排',
    thumbnail: 'site-templates/field-notes/thumbnail.png',
    sections: ['nav', 'hero', 'projects', 'about', 'contact', 'footer'],
    tokens: {
      'color-bg': '#F7F4EE',
      'color-surface': '#FFFFFF',
      'color-text': '#2B2A26',
      'color-text-muted': '#8B877C',
      'color-line': '#DDD8CC',
      'body-size': '15.5px',
      'body-line-height': '1.9',
      'body-weight': '400',
      'color-nav-bg': 'rgba(247,244,238,0.9)',
      'space-section-mobile': '80px',
      'font-display': "'Noto Serif SC','Songti SC','SimSun',serif",
      'font-body': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-mono': "ui-monospace,'Cascadia Mono','Courier New',monospace",
      'space-section': '110px',
      radius: '2px',
      maxw: '1200px',
    },
    primaryRole: 'accent',
    pairing: { recommended: 'forest-dream', alternatives: ['sunset-glow'] },
    allowedOverrides: ['color-primary', 'font-display', 'space-section'],
    heroMode: 'cover',
    defaultVariant: 'mosaic',
    motion: { hoverZoom: 0.025 },
  },
  {
    id: 'lumen',
    name: '流光',
    tagline: '旗舰演示款 · Hero 直嵌实时 3D 展厅，网站即作品',
    thumbnail: 'site-templates/lumen/thumbnail.png',
    sections: ['nav', 'hero', 'projects', 'about', 'contact', 'footer'],
    tokens: {
      'color-bg': '#0A0E14',
      'color-surface': '#111823',
      'color-text': '#E8EEF4',
      'color-text-muted': '#7C8B9C',
      'color-line': '#1D2735',
      'body-size': '16px',
      'body-line-height': '1.8',
      'body-weight': '300',
      'color-nav-bg': 'rgba(10,14,20,0.78)',
      'space-section-mobile': '84px',
      'font-display': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-body': "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
      'font-latin': "'Archivo','Noto Sans SC',sans-serif",
      'space-section': '120px',
      radius: '6px',
      maxw: '1160px',
    },
    primaryRole: 'cta',
    pairing: { recommended: 'ocean-breeze', alternatives: ['starry-night', 'romantic'] },
    allowedOverrides: ['color-primary', 'font-display', 'space-section'],
    heroMode: 'live3d',
    defaultVariant: 'feature',
    motion: { parallax: true, hoverZoom: 0.02 },
  },
]

export function getSiteTemplate(id: string): SiteTemplate {
  return SITE_TEMPLATES.find((t) => t.id === id) ?? SITE_TEMPLATES[0]
}

/* ------------------------------------------------------------------ */
/* admin ⇄ 站点渲染端 iframe 实时预览消息（§8，对齐 VIE_* 命名习惯）  */
/* ------------------------------------------------------------------ */

export const BS_PREVIEW_READY = 'BS_PREVIEW_READY'
export const BS_CONFIG_UPDATE = 'BS_CONFIG_UPDATE'
export const BS_TEMPLATE_CHANGE = 'BS_TEMPLATE_CHANGE'
export const BS_CONTENT_CHANGE = 'BS_CONTENT_CHANGE'

export interface BsPreviewReadyMessage {
  type: typeof BS_PREVIEW_READY
}

export interface BsConfigUpdateMessage {
  type: typeof BS_CONFIG_UPDATE
  config: BrandSiteConfig
  status?: BrandSiteStatus
}

export interface BsTemplateChangeMessage {
  type: typeof BS_TEMPLATE_CHANGE
  templateId: string
  projectCardVariant?: ProjectCardVariant
  overrides?: Record<string, string>
}

export interface BsContentChangeMessage {
  type: typeof BS_CONTENT_CHANGE
  content: BrandSiteContent
}

export type BsPreviewMessage =
  | BsConfigUpdateMessage
  | BsTemplateChangeMessage
  | BsContentChangeMessage

/* ------------------------------------------------------------------ */
/* Demo 内容（模板画廊实时预览 / 站点端独立演示模式共用）             */
/* ------------------------------------------------------------------ */

export const DEMO_PHOTO_BASE = '/demo'

export function demoPhoto(id: string): string {
  return `${DEMO_PHOTO_BASE}/${id}.jpg`
}

export const DEMO_SITE_CONTENT: Record<string, BrandSiteContent> = {
  plain: {
    brand: { name: '陈屿摄影', primaryColor: '#1F6E68' },
    hero: {
      headline: '用镜头收藏山与海',
      subHeadline: '人像与旅行摄影，现居厦门。拍了九年海，也在拍去海边的人。',
      coverPhotoId: 'p_1011',
      cta: { label: '查看作品', action: 'scroll-projects' },
    },
    projects: [
      { galleryId: 'demo-plain-1', title: '海岸线的一天', summary: '2025 · 东山岛', coverPhotoId: 'p_1057', sortOrder: 1, archived: false },
      { galleryId: 'demo-plain-2', title: '岛屿清晨', summary: '2024 · 涠洲岛', coverPhotoId: 'p_1049', sortOrder: 2, archived: false },
      { galleryId: 'demo-plain-3', title: '祖母的厨房', summary: '2025 · 家中', coverPhotoId: 'p_431', sortOrder: 3, archived: false },
      { galleryId: 'demo-plain-4', title: '雾进山里的时候', summary: '2023 · 武夷山', coverPhotoId: 'p_1021', sortOrder: 4, archived: false },
    ],
    about: {
      body: '你好，我是陈屿。白天拍海和山，晚上整理底片。\n比起布光，我更相信等待——等一场雾、一次涨潮、一个没看镜头的人。',
      portraitPhotoId: 'p_1000',
    },
    contact: {
      wechatId: 'chenyu-photo',
      formEnabled: true,
      formIntro: '想拍点什么？',
    },
    seo: { title: '陈屿摄影 · 用镜头收藏山与海', description: '人像与旅行摄影，现居厦门，全国可约。' },
  },
  'white-box': {
    brand: { name: '言之建筑摄影', primaryColor: '#1F3A5F' },
    hero: {
      headline: '建筑与空间摄影',
      subHeadline: 'ARCHITECTURE & INTERIOR',
      cta: { label: '联络', action: 'contact' },
    },
    projects: [
      { galleryId: 'demo-wb-1', title: '城市光合', summary: '万科中心 · 立面与中庭', year: '2026', coverPhotoId: 'p_764', sortOrder: 1, archived: false },
      { galleryId: 'demo-wb-2', title: '白盒子', summary: '某美术馆改造 · 展陈空间', year: '2025', coverPhotoId: 'p_942', sortOrder: 2, archived: false },
      { galleryId: 'demo-wb-3', title: '静物练习', summary: '器物十二件 · 工作台', year: '2024', coverPhotoId: 'p_533', sortOrder: 3, archived: false },
      { galleryId: 'demo-wb-4', title: '光的折返', summary: '西岸传媒港 · 拉索幕墙', year: '2023', coverPhotoId: 'p_860', sortOrder: 4, archived: false },
    ],
    about: {
      body: '只拍建成之后的建筑。图纸负责想象，我负责确认：光最终落在了哪里。\n按事务所出图习惯修片，常规项目七日内交付全部成片与精选 20 张。',
    },
    contact: {
      wechatId: 'yanzhi_studio',
      formEnabled: true,
      formIntro: '项目拍摄询价',
    },
    seo: { title: '言之建筑摄影 YANZHI STUDIO', description: '建筑与空间摄影，上海，七日交付。' },
  },
  darkroom: {
    brand: { name: '拾光影像', primaryColor: '#C8A96A' },
    hero: {
      headline: '把那天留住',
      subHeadline: '婚礼与人物写真 · 不摆拍，只记录',
      coverPhotoId: 'p_689',
      cta: { label: '看作品', action: 'scroll-projects' },
    },
    projects: [
      { galleryId: 'demo-dr-1', title: '极光下的告白', summary: '2025 · 特罗姆瑟 · 求婚跟拍', coverPhotoId: 'p_1022', sortOrder: 1, archived: false },
      { galleryId: 'demo-dr-2', title: '舞池的最后一支舞', summary: '2024 · 杭州 · 婚礼跟拍', coverPhotoId: 'p_452', sortOrder: 2, archived: false },
      { galleryId: 'demo-dr-3', title: '山野之约', summary: '2025 · 川西 · 情侣写真', coverPhotoId: 'p_883', sortOrder: 3, archived: false },
      { galleryId: 'demo-dr-4', title: '午夜城市', summary: '2023 · 上海 · 情绪写真', coverPhotoId: 'p_1067', sortOrder: 4, archived: false },
    ],
    about: {
      body: '拍婚礼第八年，最常听到的一句话是"你什么时候拍的这张？"——我的工作，就是让你不知道我什么时候在拍。\n全程不打断流程，不用喊拍合影的方式消耗你的宾客。婚礼 45 天内交付，写真 10 天内。',
    },
    contact: {
      wechatId: 'shiguang2026',
      formEnabled: true,
      formIntro: '讲讲你们的那天',
    },
    seo: { title: '拾光影像 · 把那天留住', description: '婚礼与人物写真，不摆拍，只记录。' },
  },
  'field-notes': {
    brand: { name: '山野手记', primaryColor: '#3E5C4B' },
    hero: {
      headline: '滇西行 · 十日',
      subHeadline: '从六库到丙中洛，跟着运橘子的货车走了十天。峡谷把江水夹在中间，也把日子夹在中间。',
      coverPhotoId: 'p_1015',
      cta: { label: '进入篇目', action: 'scroll-projects' },
    },
    projects: [
      { galleryId: 'demo-fn-1', title: '怒江峡谷记', summary: '峡谷两岸的溜索、教堂与橘子林。单向 240 公里，开了两天。', year: '2024 · 秋', coverPhotoId: 'p_1016', sortOrder: 1, archived: false },
      { galleryId: 'demo-fn-2', title: '雨季的勐仑', summary: '热带植物园的雨下了整周。蘑菇一夜之间长满腐木，司机说这叫菌子的月份。', year: '2023 · 夏', coverPhotoId: 'p_844', sortOrder: 2, archived: false },
      { galleryId: 'demo-fn-3', title: '高黎贡的鸟', summary: '在护鸟塘蹲守七天，拍了 31 种鸟。最远的一张，快门 1/2500 秒。', year: '2024 · 冬', coverPhotoId: 'p_1024', sortOrder: 3, archived: false },
      { galleryId: 'demo-fn-4', title: '雾起丙中洛', summary: '清晨六点半，雾从江面爬上山腰再退回江里，前后只有十一分钟。', year: '2024 · 秋', coverPhotoId: 'p_1036', sortOrder: 4, archived: false },
    ],
    about: {
      body: '山里的故事不着急，我也不着急。长期给地理与人文类刊物供图，也带小队摄影徒步——四到六人，只去我住过的村子。',
    },
    contact: {
      wechatId: 'shanzhu2026',
      formEnabled: true,
      formIntro: '写信给我',
    },
    seo: { title: '山野手记 FIELD NOTES', description: '旅行纪实与风光摄影，长期项目进行中。' },
  },
  lumen: {
    brand: { name: 'LUMEN 流光', primaryColor: '#6FD3E0' },
    hero: {
      headline: '作品会呼吸',
      subHeadline: '每一组照片，都是一间可以走进去的展厅',
      coverPhotoId: 'p_1019',
      cta: { label: '进入展厅', action: 'scroll-projects' },
    },
    projects: [
      { galleryId: 'demo-lm-1', title: '深海之眠', summary: '连岛 · 冬季海岸，六天拍了同一片海', year: '2025', coverPhotoId: 'p_1019', sortOrder: 1, archived: false },
      { galleryId: 'demo-lm-2', title: '光的纪念碑', summary: '混凝土与光的三种夹角 · 建筑系列', year: '2024', coverPhotoId: 'p_1076', sortOrder: 2, archived: false },
      { galleryId: 'demo-lm-3', title: '极光剧场', summary: '特罗姆瑟 · 追光九夜，成了三张', year: '2023', coverPhotoId: 'p_901', sortOrder: 3, archived: false },
    ],
    about: {
      body: '我把每一组作品做成一间 3D 展厅：可以环视、可以走近、可以站在一幅照片前久一点。展厅由 VIE Gallery 驱动，手机上也能流畅逛完。',
    },
    contact: {
      wechatId: 'lumen_sz',
      formEnabled: true,
      formIntro: '合作洽谈',
    },
    seo: { title: 'LUMEN 流光 · 作品会呼吸', description: '3D 光影展厅，委托拍摄与展览映像。' },
  },
}

/** 新站初始配置（T0 素笺为落点，§5 T0） */
export function defaultBrandSiteConfig(brandName = '我的品牌站'): BrandSiteConfig {
  return {
    templateId: 'plain',
    projectCardVariant: 'mosaic',
    content: {
      brand: { name: brandName, primaryColor: '#1F6E68' },
      hero: {
        headline: `${brandName}的作品集`,
        subHeadline: '在这里写一句话介绍你自己',
        cta: { label: '查看作品', action: 'scroll-projects' },
      },
      projects: [],
      contact: { formEnabled: true },
      seo: { title: brandName, description: `${brandName}的品牌站` },
    },
  }
}
