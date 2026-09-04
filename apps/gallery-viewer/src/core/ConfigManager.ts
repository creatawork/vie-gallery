import type { ViewerConfig } from './types'

/**
 * 6 大生产级预设配置定义
 */
export const BUILTIN_PRESETS: Record<string, Partial<ViewerConfig>> = {
  'minimal': {
    presetName: 'minimal',
    layout: { mode: 'sphere' },
    background: {
      type: 'gradient',
      gradient: { colors: ['#f8fafc', '#e2e8f0'], direction: 'vertical' }
    },
    particles: { enabled: false, types: [] },
    effects: { bloom: { enabled: false }, fog: { enabled: false } },
    interaction: { clickRipple: true }
  },
  'forest-dream': {
    presetName: 'forest-dream',
    layout: { mode: 'helix' },
    background: {
      type: 'sky',
      sky: { theme: 'forest', timeOfDay: 'sunset' }
    },
    particles: { enabled: true, types: ['sakura', 'stars'], density: 1.0 },
    effects: {
      bloom: { enabled: true, strength: 0.65, radius: 0.5, threshold: 0.2 },
      fog: { enabled: true, color: '#163124', density: 0.0006 }
    },
    interaction: { clickRipple: true }
  },
  'starry-night': {
    presetName: 'starry-night',
    layout: { mode: 'sphere' },
    background: {
      type: 'sky',
      sky: { theme: 'starry', timeOfDay: 'night' }
    },
    particles: { enabled: true, types: ['stars'], density: 1.2 },
    effects: {
      bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 },
      fog: { enabled: false }
    },
    interaction: { clickRipple: true }
  },
  'ocean-breeze': {
    presetName: 'ocean-breeze',
    layout: { mode: 'spiral' },
    background: {
      type: 'sky',
      sky: { theme: 'ocean', timeOfDay: 'day' }
    },
    particles: { enabled: false, types: [] },
    effects: {
      bloom: { enabled: false },
      fog: { enabled: true, color: '#0c4a6e', density: 0.0008 }
    },
    interaction: { clickRipple: true }
  },
  'sunset-glow': {
    presetName: 'sunset-glow',
    layout: { mode: 'grid' },
    background: {
      type: 'sky',
      sky: { theme: 'sunset', timeOfDay: 'sunset' }
    },
    particles: { enabled: true, types: ['sakura'], density: 0.8 },
    effects: {
      bloom: { enabled: true, strength: 0.85, radius: 0.6, threshold: 0.2 },
      fog: { enabled: true, color: '#7c2d12', density: 0.0005 }
    },
    interaction: { clickRipple: true }
  },
  'romantic': {
    presetName: 'romantic',
    layout: { mode: 'spiral' },
    background: {
      type: 'gradient',
      gradient: { colors: ['#4a0e2e', '#831843'], direction: 'radial' }
    },
    particles: { enabled: true, types: ['hearts'], density: 1.0 },
    effects: {
      bloom: { enabled: true, strength: 0.7, radius: 0.5, threshold: 0.25 },
      fog: { enabled: false }
    },
    interaction: { clickRipple: true }
  }
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ViewerConfig = {
  quality: 'auto',
  layout: {
    mode: 'sphere'
  },
  background: {
    type: 'sky',
    sky: {
      theme: 'starry',
      timeOfDay: 'night'
    }
  },
  particles: {
    enabled: true,
    types: ['stars'],
    density: 1.0
  },
  effects: {
    bloom: {
      enabled: true,
      strength: 0.7,
      radius: 0.5,
      threshold: 0.2
    },
    fog: {
      enabled: false,
      color: '#0f172a',
      density: 0.0008
    }
  },
  interaction: {
    clickRipple: true
  },
  audio: {
    bgm: {
      enabled: false
    },
    sfx: {
      enabled: true
    }
  },
  theme: {
    engine: 'custom',
    customColors: {
      primary: '#1E2227',
      secondary: '#6B7077',
      accent: '#10b981',
      background: '#070a0d',
      fog: '#070a0d'
    }
  }
}

/**
 * 配置管理器
 * 负责配置的加载、保存、合并和验证
 */
export class ConfigManager {
  private config: ViewerConfig
  private serverConfig: Partial<ViewerConfig> | null = null
  private readonly STORAGE_KEY = 'vie-gallery-viewer-config'
  private readonly PREFERENCE_KEY = 'vie-gallery-viewer-preference'

  constructor(initialConfig?: Partial<ViewerConfig>) {
    this.config = this.deepMerge(
      DEFAULT_CONFIG,
      initialConfig || {}
    )
  }

  /**
   * 从服务端加载配置（相册所有者设定的风格）
   */
  async loadFromServer(slug: string): Promise<ViewerConfig> {
    try {
      const token = new URLSearchParams(window.location.search).get('t') || new URLSearchParams(window.location.search).get('token')
      const headers: Record<string, string> = {}
      if (token) {
        headers['X-Share-Token'] = token
      }

      const response = await fetch(`/api/public/g/${slug}/viewer-config`, { headers })
      if (response.ok) {
        const serverData = await response.json()
        if (serverData && serverData.configJson) {
          try {
            const parsed = JSON.parse(serverData.configJson)
            this.serverConfig = parsed
            this.config = this.deepMerge(
              DEFAULT_CONFIG,
              parsed,
              this.loadPreferenceFromStorage()
            )
          } catch (e) {
            console.warn('Failed to parse server config JSON', e)
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load server config:', error)
    }
    return this.getConfig()
  }

  /**
   * 保存用户偏好
   */
  savePreference(preference: Partial<ViewerConfig>): void {
    try {
      localStorage.setItem(
        this.PREFERENCE_KEY,
        JSON.stringify(preference)
      )

      this.config = this.deepMerge(
        DEFAULT_CONFIG,
        this.serverConfig || {},
        preference
      )
    } catch (error) {
      console.warn('Failed to save preference:', error)
    }
  }

  /**
   * 获取用户偏好
   */
  private loadPreferenceFromStorage(): Partial<ViewerConfig> {
    try {
      const saved = localStorage.getItem(this.PREFERENCE_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  }

  /**
   * 清除用户偏好
   */
  clearPreference(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
      localStorage.removeItem(this.PREFERENCE_KEY)
      this.config = this.deepMerge(
        DEFAULT_CONFIG,
        this.serverConfig || {}
      )
    } catch (error) {
      console.warn('Failed to clear preference:', error)
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ViewerConfig {
    return this.deepClone(this.config)
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<ViewerConfig>): ViewerConfig {
    this.config = this.deepMerge(this.config, updates)
    return this.getConfig()
  }

  /**
   * 重置为默认配置
   */
  reset(): ViewerConfig {
    this.config = this.deepClone(DEFAULT_CONFIG)
    this.serverConfig = null
    this.clearPreference()
    return this.getConfig()
  }

  /**
   * 加载预设配置
   */
  async loadPreset(name: string): Promise<ViewerConfig> {
    const builtin = BUILTIN_PRESETS[name]
    if (builtin) {
      this.config = this.deepMerge(DEFAULT_CONFIG, builtin)
      return this.getConfig()
    }

    try {
      const response = await fetch(`/presets/${name}.json`)
      if (response.ok) {
        const preset = await response.json()
        this.config = this.deepMerge(DEFAULT_CONFIG, preset)
        return this.getConfig()
      }
    } catch (error) {
      console.error(`Error loading preset "${name}":`, error)
    }
    return this.getConfig()
  }

  /**
   * 导出配置为 JSON
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2)
  }

  /**
   * 从 JSON 导入配置
   */
  importConfig(json: string): ViewerConfig {
    try {
      const imported = JSON.parse(json)
      this.config = this.deepMerge(DEFAULT_CONFIG, imported)
      return this.getConfig()
    } catch (error) {
      console.error('Error importing config:', error)
      throw new Error('Invalid config JSON')
    }
  }

  /**
   * 自动检测设备并调整配置
   */
  autoAdjustForDevice(): ViewerConfig {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    const memory = (navigator as any).deviceMemory || 4
    const cores = navigator.hardwareConcurrency || 4
    const isLowEnd = isMobile || memory < 4 || cores < 4

    if (isLowEnd) {
      this.config = this.deepMerge(this.config, {
        quality: 'low',
        particles: {
          density: 0.5
        },
        effects: {
          bloom: { enabled: false }
        }
      })
    } else {
      this.config.quality = 'high'
    }

    return this.getConfig()
  }

  /**
   * 从 URL 参数加载配置
   */
  loadFromURL(): Partial<ViewerConfig> | null {
    const params = new URLSearchParams(window.location.search)
    let baseConfig: any = {}

    // 1. 优先解析预设 preset
    const preset = params.get('preset')
    if (preset && BUILTIN_PRESETS[preset]) {
      baseConfig = this.deepClone(BUILTIN_PRESETS[preset])
    }

    // 2. 覆盖单个参数
    const layout = params.get('layout')
    if (layout && ['sphere', 'helix', 'grid', 'spiral', 'random'].includes(layout)) {
      baseConfig.layout = { mode: layout }
    }

    const particles = params.get('particles')
    if (particles) {
      const types = particles.split(',').filter(t =>
        ['stars', 'hearts', 'sakura', 'snow'].includes(t)
      )
      if (types.length > 0) {
        baseConfig.particles = { enabled: true, types }
      }
    }

    const bg = params.get('bg')
    if (bg && ['sky', 'gradient', 'image', 'none'].includes(bg)) {
      baseConfig.background = { type: bg }
    }

    return Object.keys(baseConfig).length > 0 ? baseConfig : null
  }

  /**
   * 深度合并对象
   */
  private deepMerge(...objects: any[]): any {
    const result: any = {}

    for (const obj of objects) {
      if (!obj || typeof obj !== 'object') continue

      for (const key in obj) {
        const value = obj[key]

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this.deepMerge(result[key] || {}, value)
        } else {
          result[key] = value
        }
      }
    }

    return result
  }

  /**
   * 深度克隆对象
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
}
