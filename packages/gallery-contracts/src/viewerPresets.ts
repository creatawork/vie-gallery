import { createDefaultViewerConfig, mergeViewerConfig, VIEWER_CONFIG_RULES, type ViewerConfig } from './viewerConfig'
import { SCENE_PRESETS, sceneBackgroundUrl } from './galleryMedia'

export type PresetName = typeof SCENE_PRESETS[number]['name'] | 'jade-flow' | 'aurora' | 'amber-hour' | 'rose-dream' | 'deep-ocean' | 'moonlight' | 'lavender' | 'silver-mist'
function scene(name: PresetName, patch: unknown): ViewerConfig {
  const base = mergeViewerConfig(createDefaultViewerConfig(), {
    presetName: name, customized: false,
    layout: { params: { composition: 'spatial' } },
    background: { motion: false },
    particles: { enabled: false, types: [], density: 0, speed: 0, size: 1 },
    effects: { bloom: { enabled: false, strength: 0, radius: .5, threshold: .25 }, fog: { enabled: false },
      postGrade: { enabled: false, saturation: 1, contrast: 1, brightness: 1 }, vignette: { enabled: false, strength: .25, legacyCurve: false, offset: 1 },
      photoFloat: false, floatAmplitude: 1, floatSpeed: 1, photoEntrance: 'fade', entranceDuration: .5 },
    camera: { autoRotate: false, introFlight: false, rotateSpeed: .5, introDuration: 2 },
    lighting: { timeOfDay: 'noon', autoColorAdapt: false }, interaction: { clickRipple: true, cursorTrail: false }
  })
  return mergeViewerConfig(base, patch)
}
function background(name: PresetName, color: string, secondaryColor = color) {
  return { mode: 'image' as const, color, secondaryColor, angle: 135, image: { url: sceneBackgroundUrl(name)!, projection: 'equirectangular' as const } }
}
function bloom(strength: number) { return { enabled: true, strength } }
function particles(types: string[], density: number, speed: number) { return { enabled: true, types, density, speed } }
function lightScene(name: PresetName, mode: 'helix' | 'carousel' | 'grid', color: string, secondaryColor: string, patch: unknown): ViewerConfig {
  return mergeViewerConfig(scene(name, {
    layout: { mode, params: { composition: 'curated', scale: 1, spacing: 1, radius: 340, height: 430, turns: 1.15 }, transition: { style: 'smooth', duration: 1.2 } },
    background: { mode: 'gradient', motion: true, color, secondaryColor, angle: 135 },
    particles: { enabled: true, types: ['stars', 'fireflies'], density: .4, speed: .3, size: 1.2 },
    effects: { bloom: { threshold: .8 }, photoFloat: true, floatAmplitude: .6, floatSpeed: .45 },
    camera: { autoRotate: true, rotateSpeed: .5 }, interaction: { clickRipple: false }
  }), patch)
}
export const VIEWER_PRESETS: Record<PresetName, ViewerConfig> = {
  'jade-flow': lightScene('jade-flow', 'helix', '#111a17', '#263b32', {}),
  aurora: lightScene('aurora', 'helix', '#080d22', '#305d76', { particles: { types: ['stars', 'meteors'], color: '#a8e5ff' }, effects: { bloom: bloom(.28) } }),
  'amber-hour': lightScene('amber-hour', 'carousel', '#20130c', '#784b2d', { particles: { types: ['fireflies'], color: '#ffce87' }, lighting: { timeOfDay: 'sunset' } }),
  'rose-dream': lightScene('rose-dream', 'carousel', '#1e0c21', '#713d64', { particles: { types: ['hearts', 'sakura'], color: '#ffd0e7', density: .55 }, effects: { bloom: bloom(.22) } }),
  'deep-ocean': lightScene('deep-ocean', 'grid', '#061a24', '#206b73', { particles: { types: ['fireflies'], color: '#8ee4df' }, effects: { floatAmplitude: 1.2 } }),
  moonlight: lightScene('moonlight', 'carousel', '#0b1024', '#394c71', { particles: { types: ['stars'], color: '#d6e0ff', speed: .15 }, effects: { vignette: { enabled: true, strength: .2 } } }),
  lavender: lightScene('lavender', 'helix', '#160f27', '#654a85', { particles: { types: ['sakura'], color: '#dcc4ff', density: .5 } }),
  'silver-mist': lightScene('silver-mist', 'grid', '#141d26', '#4d687b', { particles: { types: ['snow'], color: '#e9f5ff', density: .6, speed: .2 }, effects: { bloom: bloom(.18) } }),
  minimal: scene('minimal', { layout: { mode: 'grid' }, background: background('minimal', '#0f172a') }),
  'forest-dream': scene('forest-dream', { layout: { mode: 'helix' }, background: background('forest-dream', '#061b14', '#234837'), particles: particles(['fireflies', 'sakura'], .6, .6), effects: { bloom: bloom(.35), fog: { enabled: true, color: '#163124', density: .0006 }, photoFloat: true }, lighting: { timeOfDay: 'sunrise' } }),
  'starry-night': scene('starry-night', { layout: { mode: 'sphere' }, background: background('starry-night', '#050817', '#18234b'), particles: particles(['stars', 'meteors'], .8, .7), effects: { bloom: bloom(.5), photoFloat: true }, camera: { autoRotate: true, rotateSpeed: .25 }, lighting: { timeOfDay: 'night' } }),
  'ocean-breeze': scene('ocean-breeze', { layout: { mode: 'spiral' }, background: background('ocean-breeze', '#082b3a', '#277b8c'), effects: { fog: { enabled: true, color: '#0c4a6e', density: .0006 }, postGrade: { enabled: true, saturation: .9 } } }),
  'sunset-glow': scene('sunset-glow', { layout: { mode: 'grid' }, background: background('sunset-glow', '#24140f', '#915a33'), particles: particles(['sakura'], .4, .6), effects: { bloom: bloom(.4), vignette: { enabled: true, strength: .2 } }, lighting: { timeOfDay: 'sunset' } }),
  romantic: scene('romantic', { layout: { mode: 'carousel' }, background: background('romantic', '#170d24', '#673d63'), particles: particles(['hearts', 'fireflies'], .6, .5), effects: { bloom: bloom(.45), photoFloat: true }, lighting: { timeOfDay: 'night' } }),
  'winter-snow': scene('winter-snow', { layout: { mode: 'grid' }, background: background('winter-snow', '#101c2b', '#4a5d72'), particles: particles(['snow'], .8, .4), effects: { bloom: bloom(.2) } }),
  'film-gallery': scene('film-gallery', { layout: { mode: 'carousel' }, background: background('film-gallery', '#1b1612'), effects: { postGrade: { enabled: true, saturation: .8, contrast: 1.12 }, vignette: { enabled: true, strength: .35 } }, lighting: { timeOfDay: 'sunset' } })
}

/** 新相册/未配置相册的默认推荐场景。改这一个常量即可全端（admin 草稿、访客端兜底、发布初始化）生效。 */
export const RECOMMENDED_SCENE_PRESET: PresetName = 'jade-flow'
export function createRecommendedViewerConfig(): ViewerConfig {
  return structuredClone(VIEWER_PRESETS[RECOMMENDED_SCENE_PRESET])
}

export const VIEWER_PRESET_CARDS = [
  { name: 'jade-flow', label: '翡翠流光', hint: '螺旋 · 萤光 · 翡翠', category: 'light' },
  { name: 'aurora', label: '极光星河', hint: '螺旋 · 流星 · 冷光', category: 'light' },
  { name: 'amber-hour', label: '琥珀时刻', hint: '环幕 · 金尘 · 暖光', category: 'light' },
  { name: 'rose-dream', label: '玫瑰梦境', hint: '环幕 · 花瓣 · 柔光', category: 'light' },
  { name: 'deep-ocean', label: '深海潮汐', hint: '波浪 · 浮游 · 青蓝', category: 'light' },
  { name: 'moonlight', label: '月下回廊', hint: '环幕 · 星尘 · 月光', category: 'light' },
  { name: 'lavender', label: '紫雾花语', hint: '螺旋 · 花雨 · 紫光', category: 'light' },
  { name: 'silver-mist', label: '银雾诗篇', hint: '波浪 · 飘雪 · 银蓝', category: 'light' },
  ...SCENE_PRESETS.map(item => ({ ...item, category: 'panorama' as const }))
] satisfies { name: PresetName; label: string; hint: string; category: string }[]

export function isViewerPreset(name: string): name is PresetName { return Object.hasOwn(VIEWER_PRESETS, name) }
export function applyViewerPreset(name: PresetName, current: ViewerConfig): ViewerConfig {
  const preset = structuredClone(VIEWER_PRESETS[name])
  const clean = structuredClone(current)
  // Legacy geometry aliases also affect rendering; they must not survive a new look.
  for (const key of ['cellW', 'cellH', 'cols', 'rx', 'ry', 'rz', 'baseRadius', 'maxRadius']) {
    if (clean.layout.params) delete clean.layout.params[key]
  }
  const groups = new Set(['layout', 'particles', 'background', 'effects', 'camera', 'lighting', 'interaction'])
  for (const [path, rule] of Object.entries(VIEWER_CONFIG_RULES)) {
    const keys = path.split('.')
    if (!groups.has(keys[0]) || rule.kind === 'object') continue
    let target: unknown = clean
    for (const key of keys.slice(0, -1)) target = target && typeof target === 'object' ? (target as Record<string, unknown>)[key] : undefined
    if (target && typeof target === 'object') delete (target as Record<string, unknown>)[keys.at(-1)!]
  }
  const next = mergeViewerConfig(clean, {
    layout: preset.layout, particles: preset.particles, background: preset.background, effects: preset.effects,
    camera: preset.camera, lighting: preset.lighting, interaction: preset.interaction, presetName: name, customized: false
  })
  if (next.background?.mode !== 'image') delete next.background?.image
  return next
}
export function restoreViewerPreset(current: ViewerConfig): ViewerConfig {
  return current.presetName && isViewerPreset(current.presetName) ? applyViewerPreset(current.presetName, current) : structuredClone(current)
}
