import { createDefaultViewerConfig, mergeViewerConfig, VIEWER_CONFIG_RULES, type ViewerConfig } from './viewerConfig'

export type PresetName = 'minimal' | 'forest-dream' | 'starry-night' | 'ocean-breeze' | 'sunset-glow' | 'romantic' | 'snowfall' | 'film'
function scene(name: PresetName, patch: unknown): ViewerConfig {
  const base = mergeViewerConfig(createDefaultViewerConfig(), {
    presetName: name, customized: false,
    particles: { enabled: false, types: [], density: 0, speed: 0, size: 1 },
    effects: { bloom: { enabled: false, strength: 0, radius: .5, threshold: .25 }, fog: { enabled: false },
      postGrade: { enabled: false, saturation: 1, contrast: 1, brightness: 1 }, vignette: { enabled: false, strength: .25, legacyCurve: false, offset: 1 },
      photoFloat: false, floatAmplitude: 1, floatSpeed: 1, photoEntrance: 'fade', entranceDuration: .5 },
    camera: { autoRotate: false, introFlight: false, rotateSpeed: .5, introDuration: 2 },
    lighting: { timeOfDay: 'noon', autoColorAdapt: false }, interaction: { clickRipple: true, cursorTrail: false }
  })
  return mergeViewerConfig(base, patch)
}
function background(color: string, secondaryColor = color) {
  return { mode: color === secondaryColor ? 'solid' : 'gradient', color, secondaryColor, angle: 135 }
}
function bloom(strength: number) { return { enabled: true, strength } }
function particles(types: string[], density: number, speed: number) { return { enabled: true, types, density, speed } }
export const VIEWER_PRESETS: Record<PresetName, ViewerConfig> = {
  minimal: scene('minimal', { layout: { mode: 'grid' }, background: background('#0f172a') }),
  'forest-dream': scene('forest-dream', { layout: { mode: 'helix' }, background: background('#061b14', '#234837'), particles: particles(['fireflies', 'sakura'], .6, .6), effects: { bloom: bloom(.35), fog: { enabled: true, color: '#163124', density: .0006 }, photoFloat: true }, lighting: { timeOfDay: 'sunrise' } }),
  'starry-night': scene('starry-night', { layout: { mode: 'sphere' }, background: background('#050817', '#18234b'), particles: particles(['stars', 'meteors'], .8, .7), effects: { bloom: bloom(.5), photoFloat: true }, camera: { autoRotate: true, rotateSpeed: .25 }, lighting: { timeOfDay: 'night' } }),
  'ocean-breeze': scene('ocean-breeze', { layout: { mode: 'spiral' }, background: background('#082b3a', '#277b8c'), effects: { fog: { enabled: true, color: '#0c4a6e', density: .0006 }, postGrade: { enabled: true, saturation: .9 } } }),
  'sunset-glow': scene('sunset-glow', { layout: { mode: 'grid' }, background: background('#24140f', '#915a33'), particles: particles(['sakura'], .4, .6), effects: { bloom: bloom(.4), vignette: { enabled: true, strength: .2 } }, lighting: { timeOfDay: 'sunset' } }),
  romantic: scene('romantic', { layout: { mode: 'carousel' }, background: background('#170d24', '#673d63'), particles: particles(['hearts', 'fireflies'], .6, .5), effects: { bloom: bloom(.45), photoFloat: true }, lighting: { timeOfDay: 'night' } }),
  snowfall: scene('snowfall', { layout: { mode: 'grid' }, background: background('#101c2b', '#4a5d72'), particles: particles(['snow'], .8, .4), effects: { bloom: bloom(.2) } }),
  film: scene('film', { layout: { mode: 'carousel' }, background: background('#1b1612'), effects: { postGrade: { enabled: true, saturation: .8, contrast: 1.12 }, vignette: { enabled: true, strength: .35 } }, lighting: { timeOfDay: 'sunset' } })
}

export function isViewerPreset(name: string): name is PresetName { return Object.hasOwn(VIEWER_PRESETS, name) }
export function applyViewerPreset(name: PresetName, current: ViewerConfig): ViewerConfig {
  const preset = structuredClone(VIEWER_PRESETS[name])
  const clean = structuredClone(current)
  const groups = new Set(['layout', 'particles', 'background', 'effects', 'camera', 'lighting', 'interaction'])
  for (const [path, rule] of Object.entries(VIEWER_CONFIG_RULES)) {
    const keys = path.split('.')
    if (!groups.has(keys[0]) || rule.kind === 'object') continue
    let target: unknown = clean
    for (const key of keys.slice(0, -1)) target = target && typeof target === 'object' ? (target as Record<string, unknown>)[key] : undefined
    if (target && typeof target === 'object') delete (target as Record<string, unknown>)[keys.at(-1)!]
  }
  return mergeViewerConfig(clean, {
    layout: preset.layout, particles: preset.particles, background: preset.background, effects: preset.effects,
    camera: preset.camera, lighting: preset.lighting, interaction: preset.interaction, presetName: name, customized: false
  })
}
export function restoreViewerPreset(current: ViewerConfig): ViewerConfig {
  return current.presetName && isViewerPreset(current.presetName) ? applyViewerPreset(current.presetName, current) : structuredClone(current)
}
