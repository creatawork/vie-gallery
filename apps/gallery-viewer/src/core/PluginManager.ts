import type { ViewerPlugin, ViewerContext } from './types'

/**
 * 插件状态
 */
enum PluginState {
  UNINSTALLED = 'uninstalled',
  INSTALLING = 'installing',
  INSTALLED = 'installed',
  FAILED = 'failed'
}

/**
 * 插件包装器
 */
interface PluginWrapper {
  plugin: ViewerPlugin
  state: PluginState
  error?: Error
}

/**
 * 插件管理器
 * 负责插件的注册、安装、卸载和生命周期管理
 */
export class PluginManager {
  private plugins: Map<string, PluginWrapper> = new Map()
  private context: ViewerContext | null = null
  private registry: Map<string, () => Promise<ViewerPlugin>> = new Map()

  constructor() {}

  /**
   * 设置插件上下文
   */
  setContext(context: ViewerContext): void {
    this.context = context
  }

  /**
   * 设置插件注册表（支持懒加载）
   */
  setRegistry(registry: Record<string, () => Promise<ViewerPlugin>>): void {
    for (const [name, loader] of Object.entries(registry)) {
      this.registry.set(name, loader)
    }
  }

  /**
   * 注册插件
   */
  register(plugin: ViewerPlugin, alias?: string): void {
    const wrapper: PluginWrapper = {
      plugin,
      state: PluginState.UNINSTALLED
    }
    this.plugins.set(plugin.name, wrapper)
    if (alias && alias !== plugin.name) {
      this.plugins.set(alias, wrapper)
    }
  }

  /**
   * 批量注册插件
   */
  registerAll(plugins: ViewerPlugin[]): void {
    plugins.forEach(plugin => this.register(plugin))
  }

  /**
   * 安装插件
   */
  async install(name: string): Promise<void> {
    let wrapper = this.plugins.get(name)

    // 如果未注册但在注册表中，先懒加载
    if (!wrapper && this.registry.has(name)) {
      const loader = this.registry.get(name)!
      const plugin = await loader()
      this.register(plugin, name)
      wrapper = this.plugins.get(name) || this.plugins.get(plugin.name)
    }

    if (!wrapper) {
      console.warn(`Plugin "${name}" is not registered`)
      return
    }

    if (wrapper.state === PluginState.INSTALLED) {
      return
    }

    if (!this.context) {
      throw new Error('Plugin context is not set')
    }

    // 检查依赖
    if (wrapper.plugin.dependencies) {
      for (const dep of wrapper.plugin.dependencies) {
        const depWrapper = this.plugins.get(dep)
        if (!depWrapper || depWrapper.state !== PluginState.INSTALLED) {
          throw new Error(`Plugin "${name}" depends on "${dep}" which is not installed`)
        }
      }
    }

    wrapper.state = PluginState.INSTALLING

    try {
      await wrapper.plugin.install(this.context)
      wrapper.state = PluginState.INSTALLED
    } catch (error) {
      wrapper.state = PluginState.FAILED
      wrapper.error = error as Error
      console.error(`Failed to install plugin "${name}":`, error)
      throw error
    }
  }

  /**
   * 批量安装插件
   */
  async installAll(names: string[]): Promise<void> {
    for (const name of names) {
      await this.install(name)
    }
  }

  /**
   * 卸载插件
   */
  uninstall(name: string): void {
    const wrapper = this.plugins.get(name)
    if (!wrapper) {
      return
    }

    if (wrapper.state !== PluginState.INSTALLED) {
      return
    }

    try {
      wrapper.plugin.uninstall()
      wrapper.state = PluginState.UNINSTALLED
    } catch (error) {
      console.error(`Failed to uninstall plugin "${name}":`, error)
    }
  }

  /**
   * 批量卸载插件
   */
  uninstallAll(names: string[]): void {
    for (const name of names) {
      this.uninstall(name)
    }
  }

  /**
   * 获取插件
   */
  get(name: string): ViewerPlugin | undefined {
    return this.plugins.get(name)?.plugin
  }

  /**
   * 获取插件状态
   */
  getState(name: string): PluginState | undefined {
    return this.plugins.get(name)?.state
  }

  /**
   * 插件是否已装配
   */
  isInstalled(name: string): boolean {
    return this.plugins.get(name)?.state === PluginState.INSTALLED
  }

  /**
   * 获取所有已安装的插件
   */
  getInstalled(): ViewerPlugin[] {
    const unique = new Set<ViewerPlugin>()
    for (const w of this.plugins.values()) {
      if (w.state === PluginState.INSTALLED) {
        unique.add(w.plugin)
      }
    }
    return Array.from(unique)
  }

  /**
   * 更新所有插件
   */
  update(delta: number, elapsed: number): void {
    const visited = new Set<ViewerPlugin>()
    for (const wrapper of this.plugins.values()) {
      if (wrapper.state === PluginState.INSTALLED && wrapper.plugin.update && !visited.has(wrapper.plugin)) {
        visited.add(wrapper.plugin)
        try {
          wrapper.plugin.update(delta, elapsed)
        } catch (error) {
          console.error(`Error updating plugin "${wrapper.plugin.name}":`, error)
        }
      }
    }
  }

  /**
   * 窗口调整通知
   */
  onResize(width: number, height: number): void {
    const visited = new Set<ViewerPlugin>()
    for (const wrapper of this.plugins.values()) {
      if (wrapper.state === PluginState.INSTALLED && wrapper.plugin.onResize && !visited.has(wrapper.plugin)) {
        visited.add(wrapper.plugin)
        try {
          wrapper.plugin.onResize(width, height)
        } catch (error) {
          console.error(`Error resizing plugin "${wrapper.plugin.name}":`, error)
        }
      }
    }
  }

  /**
   * 清理所有插件
   */
  dispose(): void {
    const installedNames = Array.from(this.plugins.keys())
    this.uninstallAll(installedNames)
    this.plugins.clear()
  }
}
