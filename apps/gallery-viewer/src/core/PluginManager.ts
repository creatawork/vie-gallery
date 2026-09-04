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
    console.log('📦 Setting plugin registry with', Object.keys(registry).length, 'plugins:', Object.keys(registry))
    for (const [name, loader] of Object.entries(registry)) {
      this.registry.set(name, loader)
    }
    console.log('✓ Registry set, total plugins:', this.registry.size)
  }

  /**
   * 注册插件
   */
  register(plugin: ViewerPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered`)
      return
    }

    this.plugins.set(plugin.name, {
      plugin,
      state: PluginState.UNINSTALLED
    })
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
    console.log(`🔌 Installing plugin "${name}"...`)
    console.log(`   Registry has ${this.registry.size} entries:`, Array.from(this.registry.keys()))

    // 如果已注册，直接安装
    let wrapper = this.plugins.get(name)

    // 如果未注册但在注册表中，先懒加载
    if (!wrapper && this.registry.has(name)) {
      console.log(`   ⏳ Lazy loading "${name}" from registry...`)
      const loader = this.registry.get(name)!
      const plugin = await loader()
      console.log(`   ✓ Plugin loaded:`, plugin.name)
      this.register(plugin)
      wrapper = this.plugins.get(name)
    }

    if (!wrapper) {
      console.error(`   ❌ Plugin "${name}" is not registered`)
      console.error(`   Available in registry:`, Array.from(this.registry.keys()))
      throw new Error(`Plugin "${name}" is not registered`)
    }

    if (wrapper.state === PluginState.INSTALLED) {
      console.warn(`Plugin "${name}" is already installed`)
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
      console.log(`Plugin "${name}" installed successfully`)
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
    // 先逐个安装（install 方法会自动懒加载）
    // 不使用拓扑排序，因为插件可能还没加载，无法检查依赖
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
      console.warn(`Plugin "${name}" is not registered`)
      return
    }

    if (wrapper.state !== PluginState.INSTALLED) {
      console.warn(`Plugin "${name}" is not installed`)
      return
    }

    // 检查是否有其他插件依赖它
    for (const [otherName, otherWrapper] of this.plugins) {
      if (
        otherWrapper.state === PluginState.INSTALLED &&
        otherWrapper.plugin.dependencies?.includes(name)
      ) {
        throw new Error(`Cannot uninstall "${name}" because "${otherName}" depends on it`)
      }
    }

    try {
      wrapper.plugin.uninstall()
      wrapper.state = PluginState.UNINSTALLED
      console.log(`Plugin "${name}" uninstalled successfully`)
    } catch (error) {
      console.error(`Failed to uninstall plugin "${name}":`, error)
      throw error
    }
  }

  /**
   * 批量卸载插件
   */
  uninstallAll(names: string[]): void {
    // 逆拓扑排序，按依赖顺序卸载
    const sorted = this.topologicalSort(names).reverse()
    for (const name of sorted) {
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
   * 获取所有已安装的插件
   */
  getInstalled(): ViewerPlugin[] {
    return Array.from(this.plugins.values())
      .filter(w => w.state === PluginState.INSTALLED)
      .map(w => w.plugin)
  }

  /**
   * 更新所有插件
   */
  update(delta: number, elapsed: number): void {
    for (const wrapper of this.plugins.values()) {
      if (wrapper.state === PluginState.INSTALLED && wrapper.plugin.update) {
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
    for (const wrapper of this.plugins.values()) {
      if (wrapper.state === PluginState.INSTALLED && wrapper.plugin.onResize) {
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
    const installed = Array.from(this.plugins.entries())
      .filter(([_, w]) => w.state === PluginState.INSTALLED)
      .map(([name]) => name)

    this.uninstallAll(installed)
    this.plugins.clear()
  }

  /**
   * 拓扑排序（处理依赖关系）
   */
  private topologicalSort(names: string[]): string[] {
    const visited = new Set<string>()
    const sorted: string[] = []

    const visit = (name: string) => {
      if (visited.has(name)) return

      const wrapper = this.plugins.get(name)
      if (!wrapper) {
        throw new Error(`Plugin "${name}" is not registered`)
      }

      // 先访问依赖
      if (wrapper.plugin.dependencies) {
        for (const dep of wrapper.plugin.dependencies) {
          visit(dep)
        }
      }

      visited.add(name)
      sorted.push(name)
    }

    names.forEach(visit)
    return sorted
  }
}
