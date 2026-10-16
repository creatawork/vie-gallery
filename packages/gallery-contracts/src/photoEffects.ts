import type { ViewerConfig } from './viewerConfig'

/** These are photograph treatments, independent of the scene background. */
export const PHOTO_EFFECTS = [
  { id: 'none', label: '原片', description: '保留照片原貌' },
  { id: 'silk', label: '流光丝绸', description: '照片像柔软丝绸起伏，光带沿画面流动' },
  { id: 'hologram', label: '全息扫描', description: '虹彩镀膜、扫描光束与细密光栅' },
  { id: 'film', label: '琥珀胶片', description: '35mm 齿孔、暖调颗粒与轻微曝光呼吸' },
  { id: 'prism', label: '棱镜色散', description: '边缘折射、虹彩分光与镜头耀斑' },
  { id: 'ripple', label: '水波折射', description: '画面随同心涟漪折射，指尖唤起水纹' },
  { id: 'silver', label: '月光银盐', description: '银盐黑白、局部追光与细腻银粒' },
  { id: 'duotone', label: '双色网印', description: '紫色与奶油白的双色套印、半调网点' },
  { id: 'frost', label: '雾面玻璃', description: '磨砂边缘、透明视窗与凝结微粒' },
  { id: 'paper', label: '美术纸印', description: '留白纸边、细微纸纤维与原色印相' },
  { id: 'dapple', label: '林间光斑', description: '游移的叶影与斑驳日光落在照片上' },
  { id: 'stardust', label: '星尘显影', description: '像素星点从照片边缘聚合，星芒闪烁' },
  { id: 'caustics', label: '粼粼波光', description: '交织焦散光纹与流动的水下折射' },
  { id: 'light-leak', label: '日落漏光', description: '橙红漏光、变形镜头光带与暖色暗部' },
  { id: 'bokeh', label: '柔焦散景', description: '中心清晰、边缘柔化与漂浮散景光斑' },
  { id: 'crystal', label: '冰晶折面', description: '几何冰晶沿边缘结霜，折射出细碎高光' },
  { id: 'contact', label: '暗房接触印相', description: '黑白接触印相、胶卷画格与边码' }
] as const
export type PhotoEffectStyle = typeof PHOTO_EFFECTS[number]['id']
export interface PhotoEffectConfig { style: PhotoEffectStyle; intensity: number; speed: number }

export const PHOTO_ARRANGEMENTS = [
  { id: 'book', label: '巨幅翻页', mode: 'helix', caption: '像翻阅画册一样，让故事一页页展开' },
  { id: 'tunnel', label: '时空长廊', mode: 'helix', caption: '沿着纵深光廊，走进下一段回忆' },
  { id: 'ribbon', label: '扭转丝带', mode: 'helix', caption: '照片沿流动的曲线，轻盈舒展' },
  { id: 'orbit', label: '星轨环绕', mode: 'helix', caption: '作品如星辰环绕，聚焦此刻的主角' },
  { id: 'filmstrip', label: '横向胶卷', mode: 'carousel', caption: '横向铺开连续画格，保留叙事的节奏' },
  { id: 'fan', label: '折扇展开', mode: 'carousel', caption: '层层展开的扇面，让每一次切换更从容' },
  { id: 'wave', label: '潮汐波列', mode: 'grid', caption: '让照片随波起伏，在光影中相遇' },
  { id: 'arc', label: '月弧回廊', mode: 'carousel', caption: '沿柔和的弧线，欣赏一场私人展览' },
  { id: 'cascade', label: '错落瀑布', mode: 'helix', caption: '高低错落地铺陈，呈现丰富的画面层次' },
  { id: 'stack', label: '层叠画册', mode: 'grid', caption: '一叠珍藏的照片，每张都有自己的位置' }
] as const
export type PhotoArrangement = typeof PHOTO_ARRANGEMENTS[number]['id']

export const PRESET_PHOTO_EFFECTS: Record<string, PhotoEffectConfig> = {
  'jade-flow': { style: 'silk', intensity: .72, speed: .6 },
  aurora: { style: 'hologram', intensity: .72, speed: .65 },
  'amber-hour': { style: 'film', intensity: .78, speed: .45 },
  'rose-dream': { style: 'prism', intensity: .8, speed: .5 },
  'deep-ocean': { style: 'ripple', intensity: .8, speed: .65 },
  moonlight: { style: 'silver', intensity: .9, speed: .3 },
  lavender: { style: 'duotone', intensity: .88, speed: .4 },
  'silver-mist': { style: 'frost', intensity: .8, speed: .35 },
  minimal: { style: 'paper', intensity: .7, speed: 0 },
  'forest-dream': { style: 'dapple', intensity: .78, speed: .5 },
  'starry-night': { style: 'stardust', intensity: .75, speed: .5 },
  'ocean-breeze': { style: 'caustics', intensity: .75, speed: .65 },
  'sunset-glow': { style: 'light-leak', intensity: .72, speed: .4 },
  romantic: { style: 'bokeh', intensity: .75, speed: .4 },
  'winter-snow': { style: 'crystal', intensity: .8, speed: .3 },
  'film-gallery': { style: 'contact', intensity: .88, speed: .3 }
}
export const PRESET_PHOTO_ARRANGEMENTS: Record<string, PhotoArrangement> = {
  'jade-flow': 'ribbon', aurora: 'orbit', 'amber-hour': 'filmstrip', 'rose-dream': 'fan',
  'deep-ocean': 'wave', moonlight: 'arc', lavender: 'cascade', 'silver-mist': 'stack'
}

/** Older untouched presets gain their treatment; custom scenes and explicit "none" keep their intent. */
export function resolvePhotoEffect(config: ViewerConfig): PhotoEffectConfig {
  const authored = config.effects.photo
  const name = config.presetName ?? ''
  const preset = !config.customized && Object.hasOwn(PRESET_PHOTO_EFFECTS, name) ? PRESET_PHOTO_EFFECTS[name] : undefined
  return { style: authored?.style ?? preset?.style ?? 'none', intensity: authored?.intensity ?? preset?.intensity ?? .7,
    speed: authored?.speed ?? preset?.speed ?? .5 }
}
export function resolvePhotoArrangement(config: ViewerConfig): PhotoArrangement {
  const name = config.presetName ?? ''
  return config.layout.params?.arrangement
    ?? (!config.customized && Object.hasOwn(PRESET_PHOTO_ARRANGEMENTS, name) ? PRESET_PHOTO_ARRANGEMENTS[name] : undefined)
    ?? ({ carousel: 'arc', grid: 'wave' } as Record<string, PhotoArrangement>)[config.layout.mode] ?? 'ribbon'
}

/** Capture a historical preset's displayed treatment before an edit marks it as customized. */
export function photoPresentationPatch(config: ViewerConfig): Partial<ViewerConfig> {
  const photo = config.effects.photo
  return {
    ...(!photo || photo.style === undefined || photo.intensity === undefined || photo.speed === undefined
      ? { effects: { photo: resolvePhotoEffect(config) } } : {}),
    ...(config.layout.params?.composition === 'curated' && !config.layout.params.arrangement
      ? { layout: { ...config.layout, params: { ...config.layout.params, arrangement: resolvePhotoArrangement(config) } } } : {})
  }
}
