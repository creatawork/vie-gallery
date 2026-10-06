// Frozen definitions from the pre-upgrade Viewer. New scenes must not change old albums.
const LEGACY_PRESETS: Record<string, Record<string, unknown>> = {
  minimal: { layout: { mode: 'sphere' }, particles: { enabled: false, types: [] }, effects: { bloom: { enabled: false }, fog: { enabled: false } }, interaction: { clickRipple: true, cursorTrail: false }, lighting: { timeOfDay: 'noon', autoColorAdapt: false } },
  'forest-dream': { layout: { mode: 'helix' }, particles: { enabled: true, types: ['sakura', 'fireflies'], density: 1 }, effects: { bloom: { enabled: true, strength: .65, radius: .5, threshold: .2 }, fog: { enabled: true, color: '#163124', density: .0006 } }, interaction: { clickRipple: true, cursorTrail: false }, lighting: { timeOfDay: 'sunrise', autoColorAdapt: true } },
  'starry-night': { layout: { mode: 'sphere' }, particles: { enabled: true, types: ['stars', 'meteors'], density: 1.2 }, effects: { bloom: { enabled: true, strength: .8, radius: .6, threshold: .15 }, fog: { enabled: false } }, interaction: { clickRipple: true, cursorTrail: true }, lighting: { timeOfDay: 'night', autoColorAdapt: true } },
  'ocean-breeze': { layout: { mode: 'spiral' }, particles: { enabled: false, types: [] }, effects: { bloom: { enabled: false }, fog: { enabled: true, color: '#0c4a6e', density: .0008 } }, interaction: { clickRipple: true, cursorTrail: false }, lighting: { timeOfDay: 'noon', autoColorAdapt: true } },
  'sunset-glow': { layout: { mode: 'grid' }, particles: { enabled: true, types: ['sakura'], density: .8 }, effects: { bloom: { enabled: true, strength: .85, radius: .6, threshold: .2 }, fog: { enabled: true, color: '#7c2d12', density: .0005 } }, interaction: { clickRipple: true, cursorTrail: true }, lighting: { timeOfDay: 'sunset', autoColorAdapt: true } },
  romantic: { layout: { mode: 'spiral' }, particles: { enabled: true, types: ['hearts', 'fireflies'], density: 1 }, effects: { bloom: { enabled: true, strength: .7, radius: .5, threshold: .25 }, fog: { enabled: false } }, interaction: { clickRipple: true, cursorTrail: true }, lighting: { timeOfDay: 'night', autoColorAdapt: true } }
}

export function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

export function mergeConfigObjects(...objects: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const object of objects) for (const [key, value] of Object.entries(object)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    if (isConfigRecord(value)) result[key] = mergeConfigObjects(isConfigRecord(result[key]) ? result[key] : {}, value)
    else if (value !== undefined) result[key] = Array.isArray(value) ? value.map(item => isConfigRecord(item) ? mergeConfigObjects(item) : item) : value
  }
  return result
}

export function migrateLegacyConfig(input: Record<string, unknown>): Record<string, unknown> {
  const name = typeof input.presetName === 'string' ? input.presetName : ''
  const config = mergeConfigObjects(LEGACY_PRESETS[name] ?? {}, input)
  if (typeof config.layout === 'string') config.layout = { mode: config.layout }
  if (isConfigRecord(config.background)) {
    const background = config.background
    // Pre-upgrade drafts stored background.type; map it onto the current mode field.
    if (typeof background.type === 'string' && background.mode === undefined) background.mode = background.type
    // 'none' must win over any image URL left behind by an earlier image draft.
    if (background.mode === 'none') delete background.image
    delete background.type
  }
  if (isConfigRecord(config.layout) && isConfigRecord(config.layout.params)) {
    const params = config.layout.params
    if (params.columns === undefined && params.cols !== undefined) params.columns = params.cols
  }
  const effects = isConfigRecord(config.effects) ? config.effects : {}
  const bloom = isConfigRecord(effects.bloom) ? effects.bloom : {}
  const enabled = bloom.enabled !== false
  const presets: Record<string, [number, number, number, number]> = {
    fresh: [1.02, 1.12, .5, 1.3], warm: [1.08, 1.15, .7, 1.1],
    deep: [1.12, 1.05, .9, 1], minimal: [1, 1.05, .3, 1.5]
  }
  const [contrast, saturation, strength, offset] = presets[String(bloom.preset)] ?? presets.warm
  // Preserve the old grading curve exactly until the owner explicitly selects a new scene.
  if (effects.postGrade === undefined) effects.postGrade = { enabled, contrast, saturation, brightness: 1 }
  if (effects.vignette === undefined) effects.vignette = { enabled, strength, legacyCurve: true, offset }
  config.effects = effects
  return config
}
