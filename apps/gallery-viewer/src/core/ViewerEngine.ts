import * as THREE from 'three'
import { mergeViewerConfig, normalizeViewerConfig, ViewerConfigValidationError, type PublicPhoto } from '@vie/gallery-contracts'
import { PhotoScene } from './PhotoScene'
import { TexturePool, loadPhotoTexture } from './TexturePool'
import { FrameClock } from './FrameClock'
import { QualityController, QUALITY_BUDGETS, initialQuality, type Quality, type QualitySample, type QualityDecision } from './QualityController'
import type { ParticlesPlugin } from '../plugins/ParticlesPlugin'
import type { PostProcessing } from './PostProcessing'
import type { ViewerDiagnosticApi } from './types'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import type { ViewerContext, ViewerConfig, PhotoMesh } from './types'
import { EventBus } from './EventBus'
import { PluginManager } from './PluginManager'
import { ConfigManager, getDeviceProfile } from './ConfigManager'

export class WebGLUnavailableError extends Error {
  constructor(message = 'WebGL is unavailable') {
    super(message)
    this.name = 'WebGLUnavailableError'
  }
}

export interface EngineMetrics {
  fps: number
  frameTimeMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  pixelRatio: number
  isThrottled: boolean
  failedTextures?: number
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
  private clock: FrameClock
  private animationId: number | null = null
  private isRunning = false
  private isContextLost = false
  private firstPhotoRendered = false
  private effectsStarted = false
  private effectsReadyEmitted = false
  private effectsDeadlineTimer: number | null = null
  // dispose 后必须拦截仍在途的异步初始化/插件安装，否则会在销毁后的画布上继续装配
  private disposed = false

  // 智能能耗与帧率控制 (Adaptive FPS / Power Throttler)
  private lastRenderTime = 0
  private targetFps = 60
  private idleTimer: number | null = null
  private isIdle = false
  private activeTransitionsCount = 0
  private introFlightPlayed = false
  private introFlight: { start: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; targetFrom?: THREE.Vector3; targetTo?: THREE.Vector3; complete?: () => void; arc?: boolean } | null = null
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private pendingConfig: ViewerConfig | null = null
  private inFlightConfig: ViewerConfig | null = null
  private configDrain: Promise<void> | null = null
  private texturePool: TexturePool
  private photoScene: PhotoScene
  private postProcessing: PostProcessing | null = null
  private frozenTime: number | null = null
  private diagnostics: ViewerDiagnosticApi | undefined
  private effectiveQuality: Quality = 'mid'
  private qualityRequest: ViewerConfig['quality'] = 'auto'
  private qualityController: QualityController
  private qualityReason: string | null = null
  private cpuRenderMs = 0
  private frames: Array<{ frameIntervalMs: number; cpuRenderMs: number; drawCalls: number }> = []
  private frameCursor = 0

  // 性能 APM 探针
  private frameCount = 0
  private lastFpsUpdateTime = 0
  private currentFps = 60
  private currentFrameTime = 16.6
  private basePixelRatio = 1.5

  // DOM
  private canvas: HTMLCanvasElement

  // 插件共享上下文（对象身份保持稳定，插件长期持有也不会读到过期照片/配置）
  private pluginContext: ViewerContext | null = null

  constructor(
    canvas: HTMLCanvasElement,
    initialConfig?: Partial<ViewerConfig>
  ) {
    this.canvas = canvas

    // 初始化子系统
    this.eventBus = new EventBus()
    this.pluginManager = new PluginManager()
    this.configManager = new ConfigManager(initialConfig)
    this.qualityRequest = this.configManager.getConfig().quality
    this.effectiveQuality = initialQuality(this.qualityRequest, getDeviceProfile().isLowEnd)
    this.qualityController = new QualityController(this.effectiveQuality, this.qualityRequest === 'auto' ? 'high' : this.qualityRequest, performance.now())

    // 初始化 Three.js
    this.scene = new THREE.Scene()
    this.camera = this.createCamera()
    this.renderer = this.createRenderer()
    this.clock = new FrameClock()
    this.texturePool = new TexturePool(QUALITY_BUDGETS[this.effectiveQuality], loadPhotoTexture)
    this.photoScene = new PhotoScene(this.scene, this.texturePool, mesh => this.eventBus.emit('photo:texture-ready', mesh))

    // 初始化交互控制器 (OrbitControls)
    this.controls = this.createControls()

    // 绑定系统事件与 WebGL 上下文监听
    window.addEventListener('resize', this.handleResize)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.motionQuery.addEventListener('change', this.handleMotionChange)
    this.controls?.addEventListener('start', this.handleControlsStart)
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
  async init(slug?: string, serverConfigSnapshot?: ViewerConfig | null): Promise<void> {
    if (this.disposed) return
    this.eventBus.emit('init')

    // 1. 设置插件注册表
    const { pluginRegistry } = await import('../plugins/registry')
    if (this.disposed) return
    this.pluginManager.setRegistry(pluginRegistry)

    // 2. 如果提供了 slug，从服务端加载配置
    if (serverConfigSnapshot !== undefined) {
      this.configManager.adoptServerSnapshot(serverConfigSnapshot)
    } else if (slug) {
      await this.configManager.loadFromServer(slug)
      if (this.disposed) return
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
    await this.reconcilePlugins(this.configManager.getConfig(), true)

    if (this.disposed) return
    this.photoScene.updateVisibility(this.camera)
    if (import.meta.env.DEV || import.meta.env.VITE_VIEWER_DIAGNOSTICS === 'true') {
      this.diagnostics = {
        snapshot: () => this.getDiagnostics(),
        requestConfig: patch => this.applyConfig(patch),
        freezeTime: elapsed => { this.frozenTime = elapsed },
        photoMeshIds: () => this.photos.map(photo => photo.uuid),
        sampleQuality: sample => this.sampleQuality(sample),
        drainFrames: () => this.drainFrames()
      }
      window.__VIE_VIEWER_DIAGNOSTICS__ = this.diagnostics
    }
    this.eventBus.emit('ready')
    performance.mark('viewer:base-scene-ready')
  }

  /**
   * 根据配置自动安装插件
   */
  private async installPluginsFromConfig(): Promise<void> {
    await this.reconcilePlugins(this.configManager.getConfig())
  }

  getRequestedConfig(): ViewerConfig { return this.configManager.getConfig() }

  applyConfig(patch: Partial<ViewerConfig>): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.enableEffects()
    try { this.pendingConfig = mergeViewerConfig(this.pendingConfig ?? this.inFlightConfig ?? this.configManager.getConfig(), patch) }
    catch (error) { return Promise.reject(error) }
    if (!this.configDrain) this.configDrain = this.drainConfigs().finally(() => { this.configDrain = null })
    return this.configDrain
  }

  replaceConfig(config: ViewerConfig): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.enableEffects()
    const result = normalizeViewerConfig(config)
    if (result.issues.length) return Promise.reject(new ViewerConfigValidationError(result.issues))
    this.pendingConfig = result.config
    if (!this.configDrain) this.configDrain = this.drainConfigs().finally(() => { this.configDrain = null })
    return this.configDrain
  }

  private async drainConfigs(): Promise<void> {
    while (this.pendingConfig && !this.disposed) {
      const candidate = this.pendingConfig
      this.pendingConfig = null
      this.inFlightConfig = candidate
      const previous = this.configManager.getConfig()
      try {
        await this.reconcilePlugins(candidate)
        if (this.disposed) return
        this.configManager.replaceConfig(candidate)
        this.eventBus.emit('config:update', this.pluginContext!.config)
      } catch (error) {
        this.pendingConfig = null
        if (!this.disposed) {
          await this.reconcilePlugins(previous)
          this.eventBus.emit('config:update', this.pluginContext!.config)
        }
        throw error
      } finally {
        this.inFlightConfig = null
      }
    }
    this.markEffectsReady()
  }

  private enableEffects(): void {
    this.effectsStarted = true
    if (this.effectsDeadlineTimer !== null) {
      window.clearTimeout(this.effectsDeadlineTimer)
      this.effectsDeadlineTimer = null
    }
  }

  private markEffectsReady(): void {
    if (!this.effectsStarted || this.effectsReadyEmitted || this.disposed) return
    this.effectsReadyEmitted = true
    performance.mark('viewer:effects-ready')
    this.eventBus.emit('startup:effects-ready')
  }

  private async reconcilePlugins(candidate: ViewerConfig, deferEffects = false): Promise<void> {
    if (this.disposed) return
    if (candidate.quality !== this.qualityRequest) {
      this.qualityRequest = candidate.quality
      this.effectiveQuality = initialQuality(candidate.quality, getDeviceProfile().isLowEnd)
      this.qualityController = new QualityController(this.effectiveQuality, candidate.quality === 'auto' ? 'high' : candidate.quality, performance.now())
      this.qualityReason = null
    }
    const context = this.pluginContext ?? this.createContext()
    const effective = structuredClone(candidate)
    effective.quality = this.effectiveQuality
    const budget = QUALITY_BUDGETS[this.effectiveQuality]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.dpr))
    this.texturePool.setBudget(budget)
    if (this.motionQuery?.matches) {
      effective.effects.photoFloat = false
      effective.effects.photoEntrance = 'none'
      effective.layout.transition = { ...effective.layout.transition, style: 'none' }
      effective.particles.speed = 0
      effective.camera = { ...effective.camera, autoRotate: false, introFlight: false }
    }
    context.config = effective
    this.pluginManager.setContext(context)
    const wanted = new Map<string, boolean>([
      ['Layout', true], ['Lighting', true], ['PhotoFade', true], ['Background', true],
      ['Particles', effective.particles.enabled && effective.particles.types.length > 0 && (effective.particles.density ?? 1) > 0],
      ['Fog', !!effective.effects.fog?.enabled],
      ['ClickRipple', !!effective.interaction.clickRipple], ['CursorTrail', !!effective.interaction.cursorTrail]
    ])
    for (const [name, enabled] of wanted) {
      if (deferEffects && ['Background', 'Particles', 'Fog', 'ClickRipple', 'CursorTrail'].includes(name)) continue
      if (enabled) await this.pluginManager.install(name)
      else this.pluginManager.uninstall(name)
      if (this.disposed) return
    }
    if (!deferEffects) {
      if (!this.postProcessing) {
        const { PostProcessing } = await import('./PostProcessing')
        if (this.disposed) return
        this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera)
      }
      try {
        this.postProcessing.apply(effective.effects)
        this.resizePostProcessing()
      } catch {
        this.postProcessing?.dispose()
        this.postProcessing = null
        this.eventBus.emit('effects:fallback', { message: '已使用基础显示效果' })
      }
    }
    if (this.controls) {
      this.controls.autoRotate = !!effective.camera?.autoRotate
      this.controls.autoRotateSpeed = effective.camera?.rotateSpeed ?? .5
    }
    if (!effective.camera?.introFlight && this.introFlight?.arc) this.cancelIntroFlight()
  }

  /**
   * 动态加载预设
   */
  async loadPreset(presetName: string): Promise<void> {
    const config = await this.configManager.loadPreset(presetName)
    await this.replaceConfig(config)
  }

  /**
   * 注册用户交互监听（触发即时唤醒至满帧）
   */
  private readonly handleUserActivity = (): void => {
    this.wakeUp()
  }

  private attachUserActivityListeners(): void {
    const events: Array<keyof HTMLElementEventMap> = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove']
    events.forEach(event => {
      this.canvas.addEventListener(event, this.handleUserActivity as EventListener, { passive: true })
    })
  }

  private detachUserActivityListeners(): void {
    const events: Array<keyof HTMLElementEventMap> = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'touchmove']
    events.forEach(event => {
      this.canvas.removeEventListener(event, this.handleUserActivity as EventListener)
    })
  }

  /**
   * 唤醒引擎至满帧高响应状态，并重新计时空闲休眠
   */
  public wakeUp(durationMs = 4000): void {
    if (this.disposed) return
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
    this.cancelIntroFlight()
    this.stop()
    this.eventBus.emit('webgl:lost')
  }

  /**
   * WebGL 上下文自愈与重建
   */
  private handleContextRestored = (): void => {
    this.isContextLost = false
    this.clock.resume(performance.now())

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
   * 追加照片时 App 会整表重建 Mesh，因此这里负责回收被替换照片的几何与纹理
   */
  syncPhotos(photos: PublicPhoto[]): void {
    if (this.disposed) return
    const diff = this.photoScene.sync(photos)
    this.photos = diff.all
    if (this.pluginContext) this.pluginContext.photos = this.photos
    this.eventBus.emit('photos:loaded', this.photos)
    this.eventBus.emit('photos:added', diff.added)
    this.wakeUp(3000)
  }
  retryPhotoTextures(): void {
    // PhotoScene stores public identities; retry only failed entries.
    this.photoScene.retryFailed()
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
      isThrottled: this.isIdle,
      failedTextures: this.photos.filter(photo => photo.userData.textureState === 'failed').length
    }
  }

  /**
   * 启动渲染循环
   */
  start(): void {
    if (this.isRunning || this.disposed || document.hidden || this.isContextLost) return

    this.isRunning = true
    if (!this.effectsStarted && this.effectsDeadlineTimer === null) {
      this.effectsDeadlineTimer = window.setTimeout(() => { void this.initializeEffects() }, 2000)
    }
    this.clock.resume(performance.now())
    this.lastRenderTime = performance.now()
    this.lastFpsUpdateTime = this.lastRenderTime
    this.frameCount = 0
    this.qualityController.reset(this.lastRenderTime)

    // 开场电影运镜只随引擎首次启动播放一次
    if (!this.introFlightPlayed) {
      this.introFlightPlayed = true
      if (this.pluginContext?.config.camera?.introFlight && !this.motionQuery.matches) {
        this.playIntroFlight()
      }
    }

    this.animate()
  }

  /**
   * 开场电影式运镜：镜头从远景高位沿弧线推进至默认机位。
   * 直接对相机位置做贝塞尔插值（与照片聚焦飞行同一模式），
   * OrbitControls 每帧从当前相机位置派生状态，二者可共存。
   */
  private playIntroFlight(): void {
    if (!this.controls || this.motionQuery.matches) return
    const to = this.camera.position.clone()
    const from = to.clone().add(new THREE.Vector3(900, 620, 1500))
    this.introFlight = { start: this.clock.elapsed, duration: this.pluginContext?.config.camera?.introDuration ?? 2, from, to, arc: true }
    this.camera.position.copy(from)
    this.notifyTransitionStart()
  }
  private updateIntroFlight(elapsed: number): void {
    const flight = this.introFlight
    if (!flight) return
    const t = Math.min(1, (elapsed - flight.start) / flight.duration)
    const eased = 1 - (1 - t) ** 4
    this.camera.position.lerpVectors(flight.from, flight.to, eased)
    if (flight.arc) this.camera.position.y += Math.sin(eased * Math.PI) * 70
    if (flight.targetFrom && flight.targetTo) this.controls?.target.lerpVectors(flight.targetFrom, flight.targetTo, eased)
    if (t === 1) { this.cancelIntroFlight(); flight.complete?.() }
  }
  flyTo(position: THREE.Vector3, target: THREE.Vector3, duration = 1.4, complete?: () => void): void {
    if (!this.controls || this.disposed) return
    this.cancelIntroFlight()
    if (this.motionQuery.matches) { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); complete?.(); return }
    this.introFlight = { start: this.clock.elapsed, duration, from: this.camera.position.clone(), to: position.clone(), targetFrom: this.controls.target.clone(), targetTo: target.clone(), complete }
    this.notifyTransitionStart()
  }
  setAutoTour(enabled: boolean): void {
    if (this.controls) {
      this.controls.autoRotate = enabled && !this.motionQuery.matches
      this.controls.autoRotateSpeed = this.pluginContext?.config.camera?.rotateSpeed ?? .5
      this.wakeUp()
    }
  }
  private cancelIntroFlight(): void {
    if (this.introFlight) { this.introFlight = null; this.notifyTransitionEnd() }
  }
  private handleControlsStart = (): void => { this.cancelIntroFlight(); this.wakeUp() }
  private handleVisibilityChange = (): void => { if (document.hidden) this.stop(); else this.start() }
  private handleMotionChange = (): void => { void this.applyConfig({}) }

  /**
   * 视角复位：取消在途运镜并回到默认机位，不改动任何用户配置
   */
  resetView(): void {
    if (this.disposed) return
    this.cancelIntroFlight()
    this.camera.position.set(0, 80, 1100)
    if (this.controls) {
      this.controls.target.set(0, 0, 0)
      this.controls.update()
    }
    this.wakeUp(2000)
  }

  /**
   * 停止渲染循环
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    this.clock.suspend()
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
    // 先置位销毁标志，拦截在途的异步初始化与运镜帧
    this.disposed = true
    this.pendingConfig = null
    this.stop()
    this.cancelIntroFlight()

    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer)
      this.idleTimer = null
    }

    // 移除监听
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.detachUserActivityListeners()

    // 销毁 OrbitControls
    if (this.controls) {
      this.controls.removeEventListener('start', this.handleControlsStart)
      this.controls.dispose()
      this.controls = null
    }

    // 卸载所有插件
    this.pluginManager.dispose()

    this.photoScene.dispose()
    this.texturePool.dispose()
    this.photos = []

    this.postProcessing?.dispose()
    this.postProcessing = null
    if (window.__VIE_VIEWER_DIAGNOSTICS__ === this.diagnostics) delete window.__VIE_VIEWER_DIAGNOSTICS__
    this.diagnostics = undefined
    this.frames = []
    this.renderer.dispose()

    window.removeEventListener('resize', this.handleResize)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.motionQuery.removeEventListener('change', this.handleMotionChange)
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
    const profile = getDeviceProfile()
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY_BUDGETS[this.effectiveQuality].dpr)

    const context = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl')
    if (!context) {
      throw new WebGLUnavailableError('This device does not provide a usable WebGL context')
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: !profile.isLowEnd,
        powerPreference: profile.isLowEnd ? 'default' : 'high-performance'
      })

      const width = this.canvas.clientWidth || window.innerWidth
      const height = this.canvas.clientHeight || window.innerHeight
      renderer.setSize(width, height)
      renderer.setPixelRatio(this.basePixelRatio)
      renderer.info.autoReset = false
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.25

      return renderer
    } catch (error) {
      throw new WebGLUnavailableError(
        error instanceof Error ? error.message : 'Failed to initialize WebGL renderer'
      )
    }
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
    // 上下文对象身份保持稳定：插件在 install 时保存的引用会在
    // setPhotos / applyConfig 时被原地刷新（配合 PluginManager.setContext 的 Object.assign），
    // 避免插件读到过期的照片列表或配置快照。
    if (this.pluginContext) {
      this.pluginContext.photos = this.photos
      this.pluginContext.config = this.configManager.getConfig()
      this.pluginContext.composer = this.composer
      return this.pluginContext
    }

    this.pluginContext = {
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

      now: () => this.frozenTime ?? this.clock.elapsed,
      reducedMotion: () => this.motionQuery.matches,
      isMobile: () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
      getQuality: () => this.effectiveQuality,
      getParticleBudget: () => QUALITY_BUDGETS[this.effectiveQuality].particles
    }
    return this.pluginContext
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

    const frame = this.clock.tick(now)
    const delta = this.frozenTime === null ? frame.delta : 0
    const elapsed = this.frozenTime ?? frame.elapsed
    const frameDuration = now - this.lastRenderTime
    this.lastRenderTime = now

    this.frameCount++
    this.currentFrameTime = frameDuration
    const metricsDue = now - this.lastFpsUpdateTime >= 1000
    if (metricsDue) {
      this.currentFps = this.frameCount * 1000 / (now - this.lastFpsUpdateTime)
      this.frameCount = 0; this.lastFpsUpdateTime = now
      const textures = this.texturePool.getMetrics()
      this.sampleQuality({ nowMs: now, fps: this.currentFps, idle: this.isIdle, hidden: document.hidden,
        loading: textures.active > 0 || textures.pending > 0, transitioning: this.activeTransitionsCount > 0, contextLost: this.isContextLost })
      if (this.disposed) return
    }
    const cpuStart = performance.now()
    this.renderer.info.reset()

    // 更新 OrbitControls 阻尼
    if (this.controls) {
      this.updateIntroFlight(elapsed)
      this.controls.update(delta)
    }

    // 更新所有插件 (粒子动画、天空盒跟随、布局缓动)
    this.pluginManager.update(delta, elapsed)
    this.photoScene.updateVisibility(this.camera)

    try {
      if (this.postProcessing) this.postProcessing.render(delta)
      else this.renderer.render(this.scene, this.camera)
    }
    catch {
      this.postProcessing?.dispose()
      this.postProcessing = null
      this.renderer.render(this.scene, this.camera)
      this.eventBus.emit('effects:fallback', { message: '已使用基础显示效果' })
    }
    const visiblePhotoRendered = !this.firstPhotoRendered && this.photos.some(photo =>
      photo.visible && photo.userData.inView && photo.userData.textureState === 'ready'
      && (Array.isArray(photo.material) ? photo.material : [photo.material])
        .some(material => material.visible && material.opacity > 0)
    )
    if (visiblePhotoRendered) {
      this.firstPhotoRendered = true
      performance.mark('viewer:first-photo-rendered')
      this.eventBus.emit('startup:first-photo-rendered')
      this.scheduleEffects()
    }
    this.cpuRenderMs = performance.now() - cpuStart
    if (this.diagnostics) {
      const frame = { frameIntervalMs: frameDuration, cpuRenderMs: this.cpuRenderMs, drawCalls: this.renderer.info.render.calls }
      if (this.frames.length < 2400) this.frames.push(frame)
      else { this.frames[this.frameCursor] = frame; this.frameCursor = (this.frameCursor + 1) % 2400 }
    }
    if (metricsDue) this.eventBus.emit('metrics:update', this.getMetrics())
  }

  private scheduleEffects(): void {
    if (this.effectsStarted || this.disposed) return
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number }
    if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(() => { void this.initializeEffects() }, { timeout: 1200 })
    else window.setTimeout(() => { void this.initializeEffects() }, 100)
  }

  private async initializeEffects(): Promise<void> {
    if (this.effectsStarted || this.disposed) return
    this.effectsStarted = true
    try {
      const config = this.configManager.getConfig()
      await Promise.all([
        import('./PostProcessing'),
        import('../plugins/registry').then(({ preloadVisualEffects }) => preloadVisualEffects({
          particles: config.particles.enabled && config.particles.types.length > 0 && (config.particles.density ?? 1) > 0,
          fog: !!config.effects.fog?.enabled,
          clickRipple: !!config.interaction.clickRipple,
          cursorTrail: !!config.interaction.cursorTrail
        }))
      ])
      if (this.disposed) return
      await this.applyConfig({})
    } catch {
      if (!this.disposed) this.eventBus.emit('effects:fallback', { message: '已使用基础显示效果' })
    }
  }

  private resizePostProcessing(): void {
    const quality = this.effectiveQuality
    this.postProcessing?.resize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight,
      this.renderer.getPixelRatio(), QUALITY_BUDGETS[quality].postScale)
  }

  getEffectiveQuality(): Quality { return this.effectiveQuality }
  getQualityReason(): string | null { return this.qualityReason }
  private sampleQuality(sample: QualitySample): QualityDecision {
    const decision = this.qualityController.sample(sample)
    this.qualityReason = decision.reason
    if (decision.fallback2D) this.eventBus.emit('quality:fallback', { message: '已优化显示效果，继续使用经典画廊浏览。' })
    else if (decision.quality !== this.effectiveQuality) {
      this.effectiveQuality = decision.quality
      void this.applyConfig({}).then(() => this.eventBus.emit('quality:changed', decision)).catch(() => {})
    }
    return decision
  }
  private getDiagnostics() {
    const requested = this.getRequestedConfig(), metrics = this.getMetrics()
    const postProcessing = this.postProcessing?.getState() ?? {
      bloom: false, grading: false, vignette: false, width: 1, height: 1,
      uniforms: { brightness: 1, contrast: 1, saturation: 1, vignette: 0 }
    }
    const particles = this.pluginManager.get('Particles') as ParticlesPlugin | undefined
    const background = this.pluginManager.get('Background') as { getInfo?: () => { url: string | null; width: number; height: number; bytes: number; projection: 'flat' | 'equirectangular' | 'none' } } | undefined
    const direction = new THREE.Vector3()
    this.camera.getWorldDirection(direction)
    return { postProcessing, requestedConfig: requested, requested,
      effectiveConfig: structuredClone(this.pluginContext!.config), effectiveQuality: this.effectiveQuality, reason: this.qualityReason,
      elapsed: this.frozenTime ?? this.clock.elapsed, meshCount: this.photos.length,
      particleCounts: particles?.getParticleCounts() ?? { stars: 0, hearts: 0, sakura: 0, snow: 0, fireflies: 0, meteors: 0 },
      textures: { ...this.texturePool.getMetrics(), failed: metrics.failedTextures ?? 0, budget: this.texturePool.getBudget() },
      background: background?.getInfo?.() ?? { url: null, width: 0, height: 0, bytes: 0, projection: 'none' },
      cameraDirection: [direction.x, direction.y, direction.z] as [number, number, number],
      geometryCount: metrics.geometries, drawCalls: metrics.drawCalls, fps: metrics.fps, frameIntervalMs: this.currentFrameTime, cpuRenderMs: this.cpuRenderMs }
  }
  private drainFrames() {
    const result = [...this.frames.slice(this.frameCursor), ...this.frames.slice(0, this.frameCursor)]
    this.frames = []; this.frameCursor = 0
    return result
  }

  private handleResize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.renderer.setSize(width, height)

    this.resizePostProcessing()

    this.pluginManager.onResize(width, height)
    this.eventBus.emit('resize', { width, height })
    this.wakeUp(2000)
  }
}
