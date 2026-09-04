import type { ViewerConfig } from './types'

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ViewerConfig = {
  quality: 'auto',

  layout: {
    mode: 'sphere'
  },

  background: {
    type: 'gradient',
    gradient: {
      colors: ['#F7F5F1', '#E7E3DA'],
      direction: 'vertical'
    }
  },

  particles: {
    enabled: false,
    types: []
  },

  effects: {
    bloom: {
      enabled: false
    },
    fog: {
      enabled: false
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
      accent: '#3C5A78',
      background: '#F7F5F1',
      fog: '#E7E3DA'
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
    // 加载顺序：默认 -> 初始配置（URL参数等）
    // 服务端配置需要异步加载，通过 loadFromServer() 方法
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
      const response = await fetch(`/api/public/g/${slug}/viewer-config`)
      if (response.ok) {
        const serverConfig = await response.json()
        if (serverConfig && Object.keys(serverConfig).length > 0) {
          this.serverConfig = serverConfig
          // 合并顺序：默认 -> 服务端 -> 用户偏好
          this.config = this.deepMerge(
            DEFAULT_CONFIG,
            serverConfig,
            this.loadPreferenceFromStorage()
          )
        }
      }
    } catch (error) {
      console.warn('Failed to load server config:', error)
    }
    return this.getConfig()
  }

  /**
   * 保存用户偏好（仅本地，不影响服务端配置）
   * 这些偏好会覆盖服务端配置
   */
  savePreference(preference: Partial<ViewerConfig>): void {
    try {
      localStorage.setItem(
        this.PREFERENCE_KEY,
        JSON.stringify(preference)
      )

      // 重新合并：默认 -> 服务端 -> 用户偏好
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
   * 清除用户偏好（恢复相册所有者的配置）
   */
  clearPreference(): void {
    try {
      localStorage.removeItem(this.PREFERENCE_KEY)
      // 重新合并：默认 -> 服务端
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
    // 注意：这里不再自动保存到 storage
    // 如果需要持久化用户偏好，应该调用 savePreference()
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
    try {
      const response = await fetch(`/presets/${name}.json`)
      if (!response.ok) {
        throw new Error(`Failed to load preset "${name}"`)
      }
      const preset = await response.json()
      this.config = this.deepMerge(DEFAULT_CONFIG, preset)
      // 预设加载后不自动保存，由用户决定是否持久化
      return this.getConfig()
    } catch (error) {
      console.error(`Error loading preset "${name}":`, error)
      throw error
    }
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
      // 导入后不自动保存，由用户决定是否持久化
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
      // 低端设备：关闭所有高级特效
      this.config = this.deepMerge(this.config, {
        quality: 'low',
        particles: {
          enabled: false,
          types: []
        },
        effects: {
          bloom: { enabled: false },
          fog: { enabled: false },
          godRays: { enabled: false }
        },
        interaction: {
          cursorTrail: false,
          magneticField: false,
          constellation: false
        }
      })
    } else if (memory < 8 || cores < 8) {
      // 中端设备：适度降级
      this.config = this.deepMerge(this.config, {
        quality: 'mid',
        particles: {
          density: 0.5
        },
        effects: {
          godRays: { enabled: false }
        }
      })
    } else {
      // 高端设备
      this.config.quality = 'high'
    }

    return this.getConfig()
  }

  /**
   * 从 URL 参数加载配置
   */
  loadFromURL(): Partial<ViewerConfig> | null {
    const params = new URLSearchParams(window.location.search)
    const updates: any = {}

    // 预设
    const preset = params.get('preset')
    if (preset) {
      // 异步加载预设，这里只返回 null
      return null
    }

    // 布局
    const layout = params.get('layout')
    if (layout && ['sphere', 'helix', 'grid', 'spiral', 'random'].includes(layout)) {
      updates.layout = { mode: layout }
    }

    // 粒子
    const particles = params.get('particles')
    if (particles) {
      const types = particles.split(',').filter(t =>
        ['stars', 'hearts', 'sakura', 'snow'].includes(t)
      )
      if (types.length > 0) {
        updates.particles = { enabled: true, types }
      }
    }

    // 背景
    const bg = params.get('bg')
    if (bg && ['sky', 'gradient', 'image', 'none'].includes(bg)) {
      updates.background = { type: bg }
    }

    return Object.keys(updates).length > 0 ? updates : null
  }

  /**
   * @deprecated 使用 loadPreferenceFromStorage() 替代
   * 从本地存储加载（保留用于向后兼容）
   */
  private loadFromStorage(): Partial<ViewerConfig> {
    return this.loadPreferenceFromStorage()
  }

  /**
   * @deprecated 使用 savePreference() 替代
   * 保存到本地存储（保留用于向后兼容）
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config))
    } catch (error) {
      console.warn('Failed to save config to storage:', error)
    }
  }

  /**
   * @deprecated 使用 clearPreference() 替代
   * 清空本地存储（保留用于向后兼容）
   */
  private clearStorage(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
      localStorage.removeItem(this.PREFERENCE_KEY)
    } catch (error) {
      console.warn('Failed to clear config from storage:', error)
    }
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
