import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import type { ViewerContext, ViewerConfig, PhotoMesh } from './types'
import { EventBus } from './EventBus'
import { PluginManager } from './PluginManager'
import { ConfigManager } from './ConfigManager'

export interface EngineMetrics {
  fps: number
  frameTimeMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  pixelRatio: number
  isThrottled: boolean
}

/**
 * 生产级 3D 空间 Viewer 引擎
 * 管理 Three.js 场景渲染、OrbitControls、插件生态、智能能耗降频与 WebGL 容灾
 */
export class ViewerEngine {
  // Three.js 核心
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private controls: OrbitControls | null = null
  private composer: EffectComposer | null = null

  // 子系统
  private eventBus: EventBus
  private pluginManager: PluginManager
  private configManager: ConfigManager

  // 照片数据
  private photos: PhotoMesh[] = []

  // 渲染与调度状态
  private clock: THREE.Clock
  private animationId: number | null = null
  private isRunning = false
  private isContextLost = false

  // 智能能耗与帧率控制 (Adaptive FPS / Power Throttler)
  private lastRenderTime = 0
  private targetFps = 60
  private idleTimer: number | null = null
  private isIdle = false
  private activeTransitionsCount = 0

  // 性能 APM 探针
  private frameCount = 0
  private lastFpsUpdateTime = 0
  private currentFps = 60
  private currentFrameTime = 16.6
  private basePixelRatio = 1.5

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

    // 初始化交互控制器 (OrbitControls)
    this.controls = this.createControls()

    // 绑定系统事件与 WebGL 上下文监听
    window.addEventListener('resize', this.handleResize)
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false)

    // 监听动画转场过渡事件
    this.eventBus.on('transition:start', () => this.notifyTransitionStart())
    this.eventBus.on('transition:end', () => this.notifyTransitionEnd())

    // 用户交互事件监听（重置空闲休眠定时器）
    this.attachUserActivityListeners()
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

    // 5. 设置插件上下文（保证 context.config 是最新解析好的 config）
    this.pluginManager.setContext(this.createContext())

    // 6. 根据配置自动安装插件
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
    if (config.particles?.enabled && config.particles.types && config.particles.types.length > 0) {
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
    } else {
      this.setComposer(null)
    }
  }

  /**
   * 动态应用新配置（支持运行时热更新与特效增删）
   */
  async applyConfig(newConfig: Partial<ViewerConfig>): Promise<void> {
    const prevConfig = this.configManager.getConfig()
    const merged = this.configManager.updateConfig(newConfig)

    // 更新插件上下文配置对象
    this.pluginManager.setContext(this.createContext())

    // 1. 处理背景类型切换 (sky vs gradient vs none)
    if (newConfig.background?.type && newConfig.background.type !== prevConfig.background.type) {
      if (prevConfig.background.type === 'sky') this.pluginManager.uninstall('SkyDome')
      if (prevConfig.background.type === 'gradient') this.pluginManager.uninstall('GradientBackground')

      if (newConfig.background.type === 'sky') await this.pluginManager.install('SkyDome')
      if (newConfig.background.type === 'gradient') await this.pluginManager.install('GradientBackground')
    }

    // 2. 处理粒子系统开启/关闭
    if (newConfig.particles !== undefined) {
      const prevEnabled = prevConfig.particles?.enabled
      const nextEnabled = newConfig.particles?.enabled

      if (!prevEnabled && nextEnabled) {
        await this.pluginManager.install('Particles')
      } else if (prevEnabled && !nextEnabled) {
        this.pluginManager.uninstall('Particles')
      }
    }

    // 3. 处理 Bloom 后处理开启/关闭
    if (newConfig.effects?.bloom !== undefined) {
      const prevBloom = prevConfig.effects?.bloom?.enabled
      const nextBloom = newConfig.effects?.bloom?.enabled

      if (!prevBloom && nextBloom) {
        await this.pluginManager.install('Bloom')
        const bloom = this.pluginManager.get('Bloom') as any
        if (bloom && bloom.getComposer) this.setComposer(bloom.getComposer())
      } else if (prevBloom && !nextBloom) {
        this.pluginManager.uninstall('Bloom')
        this.setComposer(null)
      }
    }

    // 4. 处理 Fog 雾效开启/关闭
    if (newConfig.effects?.fog !== undefined) {
      const prevFog = prevConfig.effects?.fog?.enabled
      const nextFog = newConfig.effects?.fog?.enabled

      if (!prevFog && nextFog) {
        await this.pluginManager.install('Fog')
      } else if (prevFog && !nextFog) {
        this.pluginManager.uninstall('Fog')
      }
    }

    // 5. 广播配置更新事件给所有已装配的插件
    this.eventBus.emit('config:change', merged)
    this.eventBus.emit('config:update', merged)
  }

  /**
   * 动态加载预设
   */
  async loadPreset(presetName: string): Promise<void> {
    const config = await this.configManager.loadPreset(presetName)
    await this.applyConfig(config)
  }

  /**
   * 注册用户交互监听（触发即时唤醒至满帧）
   */
  private attachUserActivityListeners(): void {
    const wake = () => this.wakeUp()
    this.canvas.addEventListener('pointerdown', wake, { passive: true })
    this.canvas.addEventListener('pointermove', wake, { passive: true })
    this.canvas.addEventListener('wheel', wake, { passive: true })
    this.canvas.addEventListener('touchstart', wake, { passive: true })
    this.canvas.addEventListener('touchmove', wake, { passive: true })
  }

  /**
   * 唤醒引擎至满帧高响应状态，并重新计时空闲休眠
   */
  public wakeUp(durationMs = 4000): void {
    this.isIdle = false
    this.targetFps = 60

    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer)
    }

    this.idleTimer = window.setTimeout(() => {
      // 仅在无活跃转场/过渡动画时进入休眠降频
      if (this.activeTransitionsCount <= 0) {
        this.isIdle = true
        this.targetFps = 20
      }
    }, durationMs)
  }

  /**
   * 标记正在进行高强度动画转场（如布局插值、相机平滑飞跃等）
   */
  public notifyTransitionStart(): void {
    this.activeTransitionsCount++
    this.wakeUp(8000)
  }

  public notifyTransitionEnd(): void {
    this.activeTransitionsCount = Math.max(0, this.activeTransitionsCount - 1)
    if (this.activeTransitionsCount === 0) {
      this.wakeUp(2000)
    }
  }

  /**
   * WebGL 上下文丢失处理
   */
  private handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.isContextLost = true
    this.stop()
    this.eventBus.emit('webgl:lost')
  }

  /**
   * WebGL 上下文自愈与重建
   */
  private handleContextRestored = (): void => {
    this.isContextLost = false
    this.clock.start()

    // 重新校准尺寸与渲染器状态
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.eventBus.emit('webgl:restored')
    this.start()
  }

  /**
   * 设置照片数据（自动应用视锥体剔除优化）
   */
  setPhotos(photos: PhotoMesh[]): void {
    // 移除旧照片
    this.photos.forEach(photo => {
      this.scene.remove(photo)
    })

    this.photos = photos

    // 启用视锥体剔除并计算边界球
    this.photos.forEach(photo => {
      photo.frustumCulled = true
      if (photo.geometry && !photo.geometry.boundingSphere) {
        photo.geometry.computeBoundingSphere()
      }
      this.scene.add(photo)
    })

    this.eventBus.emit('photos:loaded', photos)
    this.wakeUp(3000)
  }

  /**
   * 获取照片列表
   */
  getPhotos(): PhotoMesh[] {
    return this.photos
  }

  /**
   * 获取当前引擎性能指标 APM
   */
  getMetrics(): EngineMetrics {
    const memory = (this.renderer.info as any).memory || {}
    const render = this.renderer.info.render

    return {
      fps: Math.round(this.currentFps),
      frameTimeMs: parseFloat(this.currentFrameTime.toFixed(1)),
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries || 0,
      textures: memory.textures || 0,
      pixelRatio: parseFloat(this.renderer.getPixelRatio().toFixed(2)),
      isThrottled: this.isIdle
    }
  }

  /**
   * 启动渲染循环
   */
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    this.clock.start()
    this.lastRenderTime = performance.now()
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

  getConfigManager(): ConfigManager {
    return this.configManager
  }

  getPluginManager(): PluginManager {
    return this.pluginManager
  }

  getEventBus(): EventBus {
    return this.eventBus
  }

  getScene(): THREE.Scene {
    return this.scene
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer
  }

  getControls(): OrbitControls | null {
    return this.controls
  }

  setComposer(composer: EffectComposer | null): void {
    this.composer = composer
  }

  getComposer(): EffectComposer | null {
    return this.composer
  }

  /**
   * 销毁引擎与内存资源
   */
  dispose(): void {
    this.stop()

    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer)
      this.idleTimer = null
    }

    // 移除监听
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)

    // 销毁 OrbitControls
    if (this.controls) {
      this.controls.dispose()
      this.controls = null
    }

    // 卸载所有插件
    this.pluginManager.dispose()

    // 清理照片 Mesh
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

    window.removeEventListener('resize', this.handleResize)
    this.eventBus.clear()
    this.eventBus.emit('destroy')
  }

  /**
   * 兼容别名
   */
  destroy(): void {
    this.dispose()
  }

  private createCamera(): THREE.PerspectiveCamera {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 6000)
    camera.position.set(0, 80, 1100)
    return camera
  }

  private createRenderer(): THREE.WebGLRenderer {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    this.basePixelRatio = isMobile ? 1 : Math.min(window.devicePixelRatio, 2)

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !isMobile,
      powerPreference: 'high-performance'
    })

    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    renderer.setSize(width, height)
    renderer.setPixelRatio(this.basePixelRatio)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25

    return renderer
  }

  private createControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.rotateSpeed = 0.8
    controls.zoomSpeed = 1.0
    controls.panSpeed = 0.8
    controls.minDistance = 250
    controls.maxDistance = 3800
    controls.maxPolarAngle = Math.PI * 0.95
    controls.minPolarAngle = 0.05
    controls.target.set(0, 0, 0)
    return controls
  }

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

  private animate = (): void => {
    if (!this.isRunning || this.isContextLost) return

    this.animationId = requestAnimationFrame(this.animate)

    const now = performance.now()
    const frameInterval = 1000 / this.targetFps

    // 节流控制：若当前休眠降频中，跳过不达时间间隔的帧
    if (now - this.lastRenderTime < frameInterval - 1) {
      return
    }

    const delta = this.clock.getDelta()
    const elapsed = this.clock.getElapsedTime()
    const frameDuration = now - this.lastRenderTime
    this.lastRenderTime = now

    // 性能 APM 统计计算 (滑动平均)
    this.frameCount++
    this.currentFrameTime = frameDuration
    if (now - this.lastFpsUpdateTime > 1000) {
      this.currentFps = (this.frameCount * 1000) / (now - this.lastFpsUpdateTime)
      this.frameCount = 0
      this.lastFpsUpdateTime = now

      // 动态分辨率自适应微调 (DRS)
      if (this.currentFps < 30 && this.basePixelRatio > 1.0) {
        this.renderer.setPixelRatio(1.0)
      } else if (this.currentFps >= 55 && this.renderer.getPixelRatio() < this.basePixelRatio) {
        this.renderer.setPixelRatio(this.basePixelRatio)
      }

      this.eventBus.emit('metrics:update', this.getMetrics())
    }

    // 更新 OrbitControls 阻尼
    if (this.controls) {
      this.controls.update()
    }

    // 更新所有插件 (粒子动画、天空盒跟随、布局缓动)
    this.pluginManager.update(delta, elapsed)

    // 渲染画面
    if (this.composer) {
      this.composer.render()
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  private handleResize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(width, height)

    if (this.composer) {
      this.composer.setSize(width, height)
    }

    this.pluginManager.onResize(width, height)
    this.eventBus.emit('resize', { width, height })
    this.wakeUp(2000)
  }
}
