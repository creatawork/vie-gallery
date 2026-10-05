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
  return SCENE_PRESETS.some(p => p.name === name) ? '/g/backgrounds/' + name + '.webp' : undefined
}
