/** Only the configured OSS bucket is proxied; preserve the signed query verbatim. */
export function galleryMediaUrl(url: string): string {
  const prefix = 'https://vie-gallery.oss-cn-hangzhou.aliyuncs.com/'
  return url.startsWith(prefix) ? '/oss/' + url.slice(prefix.length) : url
}

export const SCENE_PRESETS = [
  { name: 'minimal', label: '极简空间', hint: '光与留白' },
  { name: 'forest-dream', label: '森林之梦', hint: '晨雾与花影' },
  { name: 'starry-night', label: '星空夜曲', hint: '银河与星尘' },
  { name: 'ocean-breeze', label: '海洋微风', hint: '蔚蓝与潮汐' },
  { name: 'sunset-glow', label: '日落余晖', hint: '晚霞与暖光' },
  { name: 'romantic', label: '心动浪漫', hint: '玫瑰与粉雾' },
  { name: 'winter-snow', label: '冬日雪境', hint: '雪松与静谧' },
  { name: 'film-gallery', label: '胶片展厅', hint: '暗调与琥珀' }
] as const

export function sceneBackgroundUrl(name?: string | null): string | undefined {
  return SCENE_PRESETS.some(p => p.name === name) ? `/g/backgrounds/${name}.webp?v=${SCENE_BACKGROUND_VERSION}` : undefined
}

/** Bump when any builtin panorama asset is replaced so caches never serve the stale image. */
export const SCENE_BACKGROUND_VERSION = '2026-10-06'

/** Configuration cards load these small thumbs instead of the high resolution panoramas. */
export function sceneBackgroundThumbUrl(name?: string | null): string | undefined {
  return SCENE_PRESETS.some(p => p.name === name) ? `/g/backgrounds/thumbs/${name}.webp?v=${SCENE_BACKGROUND_VERSION}` : undefined
}

/**
 * Builtin panoramas ship a half-resolution variant for low quality devices;
 * custom uploads and unknown names always load as-is.
 */
export function backgroundTextureUrl(url: string, quality: 'low' | 'mid' | 'high'): string {
  if (quality !== 'low') return url
  const match = /^\/g\/backgrounds\/([a-z0-9-]+)\.webp(?:\?.*)?$/.exec(url)
  if (!match || !SCENE_PRESETS.some(p => p.name === match[1])) return url
  return `/g/backgrounds/${match[1]}-low.webp?v=${SCENE_BACKGROUND_VERSION}`
}
