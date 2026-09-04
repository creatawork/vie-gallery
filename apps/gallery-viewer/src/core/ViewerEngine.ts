import * as THREE from 'three'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import type { ViewerContext, ViewerConfig, PhotoMesh } from './types'
import { EventBus } from './EventBus'
import { PluginManager } from './PluginManager'
import { ConfigManager } from './ConfigManager'

/**
 * Viewer 引擎
 * 核心渲染引擎，管理 Three.js 场景和插件系统
 */
export class ViewerEngine {
  // Three.js 核心
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer | null = null

  // 子系统
  private eventBus: EventBus
  private pluginManager: PluginManager
  private configManager: ConfigManager

  // 照片数据
  private photos: PhotoMesh[] = []

  // 渲染状态
  private clock: THREE.Clock
  private animationId: number | null = null
  private isRunning = false

  // DOM
  private canvas: HTMLCanvasElement

  constructor(
    canvas: HTMLCanvasElement,
    initialConfig?: Partial<ViewerConfig>
  ) {
    this.canvas = canvas

    // 初始化子系统
    this.eventBus = new EventBus()
    this.pluginManager = new PluginManager()
    this.configManager = new ConfigManager(initialConfig)

    // 初始化 Three.js
    this.scene = new THREE.Scene()
    this.camera = this.createCamera()
    this.renderer = this.createRenderer()
    this.clock = new THREE.Clock()

    // 设置插件上下文
    this.pluginManager.setContext(this.createContext())

    // 监听窗口调整
    window.addEventListener('resize', this.handleResize)
  }

  /**
   * 初始化
   * @param slug 相册标识（可选），如果提供则从服务端加载配置
   */
  async init(slug?: string): Promise<void> {
    this.eventBus.emit('init')

    // 1. 设置插件注册表
    const { pluginRegistry } = await import('../plugins')
    this.pluginManager.setRegistry(pluginRegistry)

    // 2. 如果提供了 slug，从服务端加载配置
    if (slug) {
      await this.configManager.loadFromServer(slug)
    }

    // 3. URL 参数覆盖（优先级最高）
    const urlConfig = this.configManager.loadFromURL()
    if (urlConfig) {
      this.configManager.updateConfig(urlConfig)
    }

    // 4. 根据设备性能调整
    if (this.configManager.getConfig().quality === 'auto') {
      this.configManager.autoAdjustForDevice()
    }

    // 5. 根据配置自动安装插件
    await this.installPluginsFromConfig()

    this.eventBus.emit('ready')
  }

  /**
   * 根据配置自动安装插件
   */
  private async installPluginsFromConfig(): Promise<void> {
    const config = this.configManager.getConfig()
    const pluginsToInstall: string[] = []

    // 布局插件（必需）
    pluginsToInstall.push('Layout')

    // 背景插件
    if (config.background.type === 'sky') {
      pluginsToInstall.push('SkyDome')
    } else if (config.background.type === 'gradient') {
      pluginsToInstall.push('GradientBackground')
    }

    // 粒子插件
    if (config.particles?.enabled && config.particles.types?.length > 0) {
      pluginsToInstall.push('Particles')
    }

    // 后处理特效
    if (config.effects?.bloom?.enabled) {
      pluginsToInstall.push('Bloom')
    }

    if (config.effects?.fog?.enabled) {
      pluginsToInstall.push('Fog')
    }

    // 交互插件
    if (config.interaction?.clickRipple) {
      pluginsToInstall.push('ClickRipple')
    }

    // 批量安装
    await this.pluginManager.installAll(pluginsToInstall)

    // 如果安装了 Bloom，设置 composer
    const bloomPlugin = this.pluginManager.get('Bloom') as any
    if (bloomPlugin && bloomPlugin.getComposer) {
      this.setComposer(bloomPlugin.getComposer())
    }
  }

  /**
   * 设置照片数据
   */
  setPhotos(photos: PhotoMesh[]): void {
    // 移除旧照片
    this.photos.forEach(photo => {
      this.scene.remove(photo)
    })

    this.photos = photos

    // 添加新照片
    this.photos.forEach(photo => {
      this.scene.add(photo)
    })

    this.eventBus.emit('photos:loaded', photos)
  }

  /**
   * 获取照片列表
   */
  getPhotos(): PhotoMesh[] {
    return this.photos
  }

  /**
   * 启动渲染循环
   */
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.clock.start()
    this.animate()
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /**
   * 获取配置管理器
   */
  getConfigManager(): ConfigManager {
    return this.configManager
  }

  /**
   * 获取插件管理器
   */
  getPluginManager(): PluginManager {
    return this.pluginManager
  }

  /**
   * 获取事件总线
   */
  getEventBus(): EventBus {
    return this.eventBus
  }

  /**
   * 获取场景
   */
  getScene(): THREE.Scene {
    return this.scene
  }

  /**
   * 获取相机
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  /**
   * 获取渲染器
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  /**
   * 设置后处理组合器
   */
  setComposer(composer: EffectComposer): void {
    this.composer = composer
  }

  /**
   * 获取后处理组合器
   */
  getComposer(): EffectComposer | null {
    return this.composer
  }

  /**
   * 销毁引擎
   */
  dispose(): void {
    this.stop()

    // 卸载所有插件
    this.pluginManager.dispose()

    // 清理 Three.js 资源
    this.photos.forEach(photo => {
      if (photo.geometry) photo.geometry.dispose()
      if (photo.material) {
        if (Array.isArray(photo.material)) {
          photo.material.forEach(m => m.dispose())
        } else {
          photo.material.dispose()
        }
      }
    })

    this.renderer.dispose()

    // 清理事件
    window.removeEventListener('resize', this.handleResize)
    this.eventBus.clear()

    this.eventBus.emit('destroy')
  }

  /**
   * 创建相机
   */
  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      1,
      5000
    )
    camera.position.set(0, 0, 1200)
    return camera
  }

  /**
   * 创建渲染器
   */
  private createRenderer(): THREE.WebGLRenderer {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    const pixelRatio = isMobile ? 1 : Math.min(window.devicePixelRatio, 2)

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !isMobile,
      powerPreference: 'high-performance'
    })

    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(pixelRatio)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2

    return renderer
  }

  /**
   * 创建插件上下文
   */
  private createContext(): ViewerContext {
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      composer: this.composer,
      photos: this.photos,
      config: this.configManager.getConfig(),

      on: (event, handler) => this.eventBus.on(event, handler),
      off: (event, handler) => this.eventBus.off(event, handler),
      emit: (event, data?) => this.eventBus.emit(event, data),

      addToScene: (object) => this.scene.add(object),
      removeFromScene: (object) => this.scene.remove(object),

      loadTexture: (url) => {
        return new Promise((resolve, reject) => {
          new THREE.TextureLoader().load(
            url,
            texture => resolve(texture),
            undefined,
            error => reject(error)
          )
        })
      },

      isMobile: () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
      getQuality: () => {
        const config = this.configManager.getConfig()
        if (config.quality === 'auto') {
          return this.configManager.autoAdjustForDevice().quality as 'low' | 'mid' | 'high'
        }
        return config.quality
      }
    }
  }

  /**
   * 动画循环
   */
  private animate = (): void => {
    if (!this.isRunning) return

    this.animationId = requestAnimationFrame(this.animate)

    const delta = this.clock.getDelta()
    const elapsed = this.clock.getElapsedTime()

    // 更新所有插件
    this.pluginManager.update(delta, elapsed)

    // 渲染
    if (this.composer) {
      this.composer.render()
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  /**
   * 窗口调整处理
   */
  private handleResize = (): void => {
    const width = window.innerWidth
    const height = window.innerHeight

    // 更新相机
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    // 更新渲染器
    this.renderer.setSize(width, height)

    // 更新后处理
    if (this.composer) {
      this.composer.setSize(width, height)
    }

    // 通知插件
    this.pluginManager.onResize(width, height)

    this.eventBus.emit('resize', { width, height })
  }
}
