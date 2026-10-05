import { isConfigRecord, mergeConfigObjects, migrateLegacyConfig } from './viewerConfigLegacy'

export type ViewerQuality = 'low' | 'mid' | 'high'
export type ParticleType = 'stars' | 'hearts' | 'sakura' | 'snow' | 'fireflies' | 'meteors'
export type LayoutMode = 'sphere' | 'carousel' | 'helix' | 'grid' | 'spiral' | 'random'
export interface LayoutParams {
  scale?: number; spacing?: number; radius?: number; columns?: number; height?: number; turns?: number
  [key: string]: unknown
}
type Extensible<T> = T & Record<string, unknown>
export type ViewerConfig = Extensible<{
  presetName?: string; customized?: boolean; visitorAllowDownload?: boolean
  quality: ViewerQuality | 'auto'
  layout: Extensible<{ mode: LayoutMode; params?: LayoutParams; transition?: { duration?: number; style?: 'smooth' | 'burst' | 'none' } }>
  particles: Extensible<{ enabled: boolean; types: ParticleType[]; density?: number; speed?: number; size?: number; color?: string }>
  background?: Extensible<{ mode: 'solid' | 'gradient'; color: string; secondaryColor?: string; angle?: number }>
  effects: Extensible<{
    bloom?: { enabled: boolean; strength?: number; radius?: number; threshold?: number; preset?: 'fresh' | 'warm' | 'deep' | 'minimal' }
    fog?: { enabled: boolean; color?: string; density?: number; preset?: 'fresh' | 'warm' | 'deep' | 'minimal' }
    postGrade?: { enabled: boolean; saturation?: number; brightness?: number; contrast?: number }
    vignette?: { enabled: boolean; strength?: number; legacyCurve?: boolean; offset?: number }
    godRays?: { enabled: boolean; source?: 'sun' | 'moon' }
    photoFloat?: boolean; floatAmplitude?: number; floatSpeed?: number
    photoEntrance?: 'fade' | 'rise' | 'none'; entranceDuration?: number
  }>
  camera?: Extensible<{ autoRotate?: boolean; introFlight?: boolean; rotateSpeed?: number; introDuration?: number }>
  interaction: Extensible<{ cursorTrail?: boolean; clickRipple?: boolean; magneticField?: boolean; constellation?: boolean }>
  audio: Extensible<{ bgm?: { enabled: boolean; playlist?: string[]; adaptive?: boolean }; sfx?: { enabled: boolean } }>
  lighting?: Extensible<{ timeOfDay?: 'auto' | 'sunrise' | 'noon' | 'sunset' | 'night'; autoColorAdapt?: boolean; transitionDuration?: number }>
}>

export interface ConfigIssue { path: string; message: string }
export interface ConfigResult { config: ViewerConfig; issues: ConfigIssue[] }
export class ViewerConfigValidationError extends Error {
  constructor(public readonly issues: ConfigIssue[]) { super(issues[0]?.message ?? '配置无效'); this.name = 'ViewerConfigValidationError' }
}
export interface ConfigRule { kind: 'object' | 'number' | 'integer' | 'boolean' | 'enum' | 'color' | 'particles' | 'string'; min?: number; max?: number; values?: readonly string[] }
const number = (min: number, max: number): ConfigRule => ({ kind: 'number', min, max })
const enumeration = (...values: string[]): ConfigRule => ({ kind: 'enum', values })
export const VIEWER_CONFIG_RULES: Record<string, ConfigRule> = {
  quality: enumeration('auto', 'low', 'mid', 'high'), presetName: { kind: 'string' }, customized: { kind: 'boolean' }, visitorAllowDownload: { kind: 'boolean' },
  layout: { kind: 'object' }, 'layout.mode': enumeration('sphere', 'carousel', 'helix', 'grid', 'spiral', 'random'),
  'layout.params': { kind: 'object' }, 'layout.params.scale': number(.5, 2), 'layout.params.spacing': number(.5, 3),
  'layout.params.radius': number(100, 1500), 'layout.params.columns': { kind: 'integer', min: 1, max: 12 },
  'layout.params.height': number(100, 1500), 'layout.params.turns': number(.5, 6),
  'layout.transition': { kind: 'object' }, 'layout.transition.duration': number(.2, 3), 'layout.transition.style': enumeration('smooth', 'burst', 'none'),
  particles: { kind: 'object' }, 'particles.enabled': { kind: 'boolean' }, 'particles.types': { kind: 'particles' },
  'particles.density': number(0, 2), 'particles.speed': number(0, 2), 'particles.size': number(.5, 2), 'particles.color': { kind: 'color' },
  background: { kind: 'object' }, 'background.mode': enumeration('solid', 'gradient'), 'background.color': { kind: 'color' }, 'background.secondaryColor': { kind: 'color' }, 'background.angle': number(0, 360),
  effects: { kind: 'object' }, 'effects.bloom': { kind: 'object' }, 'effects.bloom.enabled': { kind: 'boolean' }, 'effects.bloom.strength': number(0, 2), 'effects.bloom.radius': number(0, 1), 'effects.bloom.threshold': number(0, 1), 'effects.bloom.preset': enumeration('fresh', 'warm', 'deep', 'minimal'),
  'effects.fog': { kind: 'object' }, 'effects.fog.enabled': { kind: 'boolean' }, 'effects.fog.color': { kind: 'color' }, 'effects.fog.density': number(0, .01), 'effects.fog.preset': enumeration('fresh', 'warm', 'deep', 'minimal'),
  'effects.postGrade': { kind: 'object' }, 'effects.postGrade.enabled': { kind: 'boolean' }, 'effects.postGrade.saturation': number(0, 2), 'effects.postGrade.brightness': number(.5, 1.5), 'effects.postGrade.contrast': number(.5, 1.5),
  'effects.vignette': { kind: 'object' }, 'effects.vignette.enabled': { kind: 'boolean' }, 'effects.vignette.strength': number(0, 1), 'effects.vignette.legacyCurve': { kind: 'boolean' }, 'effects.vignette.offset': number(.5, 2),
  'effects.photoFloat': { kind: 'boolean' }, 'effects.floatAmplitude': number(0, 2), 'effects.floatSpeed': number(0, 2), 'effects.photoEntrance': enumeration('fade', 'rise', 'none'), 'effects.entranceDuration': number(.2, 2),
  camera: { kind: 'object' }, 'camera.autoRotate': { kind: 'boolean' }, 'camera.introFlight': { kind: 'boolean' }, 'camera.rotateSpeed': number(0, 2), 'camera.introDuration': number(.5, 4),
  interaction: { kind: 'object' }, 'interaction.clickRipple': { kind: 'boolean' }, 'interaction.cursorTrail': { kind: 'boolean' },
  audio: { kind: 'object' }, 'audio.bgm': { kind: 'object' }, 'audio.bgm.enabled': { kind: 'boolean' }, 'audio.sfx': { kind: 'object' }, 'audio.sfx.enabled': { kind: 'boolean' },
  lighting: { kind: 'object' }, 'lighting.timeOfDay': enumeration('auto', 'sunrise', 'noon', 'sunset', 'night'), 'lighting.autoColorAdapt': { kind: 'boolean' }, 'lighting.transitionDuration': number(.1, 10)
}

export function createDefaultViewerConfig(): ViewerConfig {
  return {
    quality: 'auto', presetName: 'custom', customized: false, visitorAllowDownload: false,
    layout: { mode: 'sphere', params: { scale: 1, spacing: 1 }, transition: { duration: 1.2, style: 'burst' } },
    particles: { enabled: true, types: ['stars'], density: 1, speed: 1, size: 1 },
    background: { mode: 'solid', color: '#0f172a', secondaryColor: '#163124', angle: 135 },
    effects: { bloom: { enabled: true, strength: .7, radius: .5, threshold: .2 }, fog: { enabled: false, color: '#0f172a', density: .0008 },
      postGrade: { enabled: false, saturation: 1, brightness: 1, contrast: 1 }, vignette: { enabled: false, strength: .25 },
      photoFloat: true, floatAmplitude: 1, floatSpeed: 1, photoEntrance: 'fade', entranceDuration: .5 },
    camera: { autoRotate: false, introFlight: false, rotateSpeed: .5, introDuration: 2 },
    interaction: { clickRipple: true, cursorTrail: false }, lighting: { timeOfDay: 'auto', autoColorAdapt: true, transitionDuration: 2 },
    audio: { bgm: { enabled: false }, sfx: { enabled: true } }
  }
}

export function validConfigValue(value: unknown, rule: ConfigRule): boolean {
  if (rule.kind === 'object') return isConfigRecord(value)
  if (rule.kind === 'boolean' || rule.kind === 'string') return typeof value === rule.kind
  if (rule.kind === 'color') return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  if (rule.kind === 'enum') return typeof value === 'string' && !!rule.values?.includes(value)
  if (rule.kind === 'particles') return Array.isArray(value) && new Set(value).size === value.length && value.every(item => ['stars', 'hearts', 'sakura', 'snow', 'fireflies', 'meteors'].includes(item))
  return typeof value === 'number' && Number.isFinite(value) && value >= rule.min! && value <= rule.max! && (rule.kind !== 'integer' || Number.isInteger(value))
}

function clean(value: unknown, path: string, depth: number, issues: ConfigIssue[]): unknown {
  if (depth > 8) throw new Error('depth')
  const rule = VIEWER_CONFIG_RULES[path]
  if (rule && !validConfigValue(value, rule)) {
    issues.push({ path, message: `${path} 的类型或范围无效` }); return undefined
  }
  if (isConfigRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
      const next = clean(child, path ? `${path}.${key}` : key, depth + 1, issues)
      if (next !== undefined) result[key] = next
    }
    return result
  }
  if (Array.isArray(value)) return value.map(item => clean(item, '', depth + 1, issues) ?? null)
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value
  issues.push({ path, message: `${path} 必须是 JSON 值` }); return undefined
}

export function normalizeViewerConfig(input: unknown, mode: 'strict' | 'legacy' = 'strict'): ConfigResult {
  const defaults = createDefaultViewerConfig()
  if (!isConfigRecord(input)) return { config: defaults, issues: [{ path: 'config', message: '配置必须是对象' }] }
  const issues: ConfigIssue[] = []
  try {
    // Sanitize before migration/deep merge so adversarial depth never reaches recursive merging.
    const raw = mode === 'legacy' && typeof input.layout === 'string' ? { ...input, layout: { mode: input.layout } } : input
    const safe = clean(raw, '', 0, issues) as Record<string, unknown>
    const migrated = mode === 'legacy' ? migrateLegacyConfig(safe) : safe
    return { config: mergeConfigObjects(defaults, migrated) as ViewerConfig, issues }
  } catch {
    return { config: defaults, issues: [{ path: 'config', message: '配置嵌套深度不能超过 8 层' }] }
  }
}

export function parseViewerConfig(json: string, schemaVersion = 1, mode: 'strict' | 'legacy' = 'strict'): ConfigResult {
  const defaults = createDefaultViewerConfig()
  if (schemaVersion !== 1) return { config: defaults, issues: [{ path: 'schemaVersion', message: '不支持的配置版本' }] }
  if (new TextEncoder().encode(json).byteLength > 65536) return { config: defaults, issues: [{ path: 'config', message: '配置不能超过 64 KiB' }] }
  try { return normalizeViewerConfig(JSON.parse(json), mode) }
  catch { return { config: defaults, issues: [{ path: 'config', message: '配置 JSON 无效' }] } }
}

function sorted(value: unknown): unknown {
  if (isConfigRecord(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  if (Array.isArray(value)) return value.map(sorted)
  return value
}
export function serializeViewerConfig(config: ViewerConfig): string {
  const result = normalizeViewerConfig(config, 'strict')
  if (result.issues.length) throw new ViewerConfigValidationError(result.issues)
  const json = JSON.stringify(sorted(result.config))
  if (new TextEncoder().encode(json).byteLength > 65536) throw new ViewerConfigValidationError([{ path: 'config', message: '配置不能超过 64 KiB' }])
  return json
}
export function mergeViewerConfig(base: ViewerConfig, patch: unknown): ViewerConfig {
  const candidate = normalizeViewerConfig(patch, 'strict')
  if (candidate.issues.length) throw new ViewerConfigValidationError(candidate.issues)
  const safe = clean(patch, '', 0, []) as Record<string, unknown>
  const result = normalizeViewerConfig(mergeConfigObjects(base, safe), 'strict')
  if (result.issues.length) throw new ViewerConfigValidationError(result.issues)
  return result.config
}
