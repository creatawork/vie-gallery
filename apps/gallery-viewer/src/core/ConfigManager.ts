import { createDefaultViewerConfig, createRecommendedViewerConfig, normalizeViewerConfig, parseViewerConfig, mergeViewerConfig, serializeViewerConfig,
  ViewerConfigValidationError, VIEWER_PRESETS, applyViewerPreset, isViewerPreset, type ViewerConfig, type ConfigIssue } from '@vie/gallery-contracts'
import { PublicApiClient } from '../api/client'

export interface DeviceProfile { isMobile: boolean; memory: number; cores: number; isLowEnd: boolean; pixelRatio: number }
export function getDeviceProfile(): DeviceProfile {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(nav?.userAgent ?? '')
  const memory = (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory ?? 4
  const cores = nav?.hardwareConcurrency ?? 4
  const isLowEnd = isMobile || memory < 4 || cores < 4
  return { isMobile, memory, cores, isLowEnd, pixelRatio: isLowEnd ? 1 : Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2) }
}
export const BUILTIN_PRESETS = VIEWER_PRESETS

export class ConfigManager {
  private config: ViewerConfig
  private serverConfig: ViewerConfig | null = null
  private readonly publicApi = new PublicApiClient()
  private readonly STORAGE_KEY = 'vie-gallery-viewer-config'
  private readonly PREFERENCE_KEY = 'vie-gallery-viewer-preference'
  readonly diagnostics: ConfigIssue[] = []
  constructor(initialConfig?: Partial<ViewerConfig>) { this.config = this.legacy(initialConfig ?? createRecommendedViewerConfig()) }
  private legacy(input: unknown): ViewerConfig {
    const result = normalizeViewerConfig(input, 'legacy')
    this.diagnostics.push(...result.issues)
    return result.config
  }
  async loadFromServer(slug: string, applyLocalPreferences = true): Promise<ViewerConfig> {
    const data = await this.publicApi.getViewerConfig(slug)
    if (data?.configJson) {
      const result = parseViewerConfig(data.configJson, data.schemaVersion ?? 1, 'legacy')
      this.diagnostics.push(...result.issues)
      this.serverConfig = result.config
      this.config = mergeViewerConfig(result.config, applyLocalPreferences ? this.loadPreferenceFromStorage() : {})
    }
    return this.getConfig()
  }
  adoptServerSnapshot(config: ViewerConfig | null, applyLocalPreferences = true): ViewerConfig {
    this.serverConfig = config ? normalizeViewerConfig(config).config : null
    this.config = mergeViewerConfig(this.serverConfig ?? createRecommendedViewerConfig(), applyLocalPreferences ? this.loadPreferenceFromStorage() : {})
    return this.getConfig()
  }
  savePreference(preference: Partial<ViewerConfig>): void {
    const candidate = mergeViewerConfig(this.serverConfig ?? createRecommendedViewerConfig(), preference)
    try { localStorage.setItem(this.PREFERENCE_KEY, JSON.stringify(preference)) } catch { /* Storage is optional. */ }
    this.config = candidate
  }
  private loadPreferenceFromStorage(): Partial<ViewerConfig> {
    try {
      const saved = localStorage.getItem(this.PREFERENCE_KEY)
      if (!saved) return {}
      const raw: unknown = JSON.parse(saved)
      mergeViewerConfig(createDefaultViewerConfig(), raw)
      return raw as Partial<ViewerConfig>
    } catch { return {} }
  }
  clearPreference(): void {
    try { localStorage.removeItem(this.STORAGE_KEY); localStorage.removeItem(this.PREFERENCE_KEY) } catch { /* Storage is optional. */ }
    this.config = structuredClone(this.serverConfig ?? createRecommendedViewerConfig())
  }
  getConfig(): ViewerConfig { return structuredClone(this.config) }
  updateConfig(updates: Partial<ViewerConfig>): ViewerConfig {
    this.config = mergeViewerConfig(this.config, updates)
    return this.getConfig()
  }
  replaceConfig(input: ViewerConfig): ViewerConfig {
    const result = normalizeViewerConfig(input)
    if (result.issues.length) throw new ViewerConfigValidationError(result.issues)
    this.config = result.config
    return this.getConfig()
  }
  reset(): ViewerConfig { this.serverConfig = null; this.clearPreference(); return this.getConfig() }
  async loadPreset(name: string): Promise<ViewerConfig> { return isViewerPreset(name) ? applyViewerPreset(name, this.config) : this.getConfig() }
  exportConfig(): string { return serializeViewerConfig(this.config) }
  importConfig(json: string): ViewerConfig {
    const result = parseViewerConfig(json, 1, 'legacy')
    if (result.issues.length) throw new ViewerConfigValidationError(result.issues)
    this.config = result.config
    return this.getConfig()
  }
  autoAdjustForDevice(): ViewerConfig { return this.getConfig() }
  loadFromURL(): Partial<ViewerConfig> | null {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const preset = params.get('preset')
    let candidate = preset && isViewerPreset(preset) ? applyViewerPreset(preset, this.config) : this.getConfig()
    let changed = !!preset && isViewerPreset(preset)
    const layout = params.get('layout')
    if (layout) {
      try { candidate = mergeViewerConfig(candidate, { layout: { mode: layout } }); changed = true } catch { /* Ignore unsupported URL values. */ }
    }
    const particles = params.get('particles')
    if (particles !== null) {
      try { candidate = mergeViewerConfig(candidate, { particles: { enabled: !!particles, types: particles ? [...new Set(particles.split(','))] : [] } }); changed = true } catch { /* Ignore unsupported URL values. */ }
    }
    return changed ? candidate : null
  }
}
