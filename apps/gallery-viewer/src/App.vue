<script setup lang="ts">
import { computed, defineAsyncComponent, ref, onMounted, onUnmounted, watch, nextTick, type CSSProperties } from 'vue'
import type * as Three from 'three'
import { CURATED_STYLES, applyCuratedStyle, type CuratedStyle } from '@vie/gallery-contracts'
import { isTrustedPreviewMessage, normalizeViewerConfig, serializeViewerConfig, ViewerConfigValidationError } from '@vie/gallery-contracts'
import { useViewerState } from './composables/useViewerState'
import { applyViewerSeo, clearViewerSeo } from './lib/seo'
import type { EngineMetrics, ViewerEngine } from './core/ViewerEngine'
import PasswordPrompt from './components/PasswordPrompt.vue'
import EmptyState from './components/EmptyState.vue'
import ErrorState from './components/ErrorState.vue'
import PhotoWall from './components/PhotoWall.vue'
import Icon from './components/Icon.vue'
import type { TheatreCommand, TheatreState } from './lib/photoTheatre'
const PhotoTheatreControls = defineAsyncComponent(() => import('./components/PhotoTheatreControls.vue'))
const theatreMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const theatreMotionChanged = () => {
  theatre.value = { ...theatre.value, reducedMotion: theatreMotion.matches }
  if (theatreMotion.matches) applyAutoTour(false)
}
const theatre = ref<TheatreState>({ active: false, mode: 'cloud', status: 'idle', elapsed: 0, offset: 0, indices: [], reducedMotion: theatreMotion.matches })
const theatreBusy = ref(false)
async function sendTheatreCommand(command: TheatreCommand) {
  const active = engine
  if (!active || theatreBusy.value) return
  theatreBusy.value = true
  try { await active.theatreCommand(command) }
  catch { if (engine === active) webglFallbackMessage.value = '照片编排暂未就绪，请重试。' }
  finally { theatreBusy.value = false }
}


const LightboxModal = defineAsyncComponent(() => import('./components/LightboxModal.vue'))
const VisitorShareModal = defineAsyncComponent(() => import('./components/VisitorShareModal.vue'))

// 从 URL 获取 slug。生产环境没有 slug 时不回退 demo 内容。
const slug = location.pathname.split('/').filter(Boolean).pop() || ''
const embeddedPreview = new URLSearchParams(location.search).get('embed') === 'preview'
const creatorPreview = new URLSearchParams(location.search).has('preview')
const liveWindowPreview = creatorPreview && new URLSearchParams(location.search).get('live') === 'config' && !!window.opener

// 状态机
const viewer = useViewerState(slug, { isPreviewEmbed: isConfigPreview })
let previewProgressTimer: number | null = null
let previewProgressDeadline: number | null = null
function stopPreviewProgress() {
  if (previewProgressTimer !== null) window.clearInterval(previewProgressTimer)
  if (previewProgressDeadline !== null) window.clearTimeout(previewProgressDeadline)
  previewProgressTimer = null
  previewProgressDeadline = null
}
watch(viewer.state, state => {
  if (['password_prompt', 'share_required', 'not_found', 'error'].includes(state)) stopPreviewProgress()
})

// SEO defaults to noindex until the public gallery has loaded successfully.
watch(
  () => [viewer.state.value, viewer.gallery.value, viewer.isPublicReady.value, viewer.photos.value],
  () => applyViewerSeo({
    slug,
    isPublicReady: viewer.isPublicReady.value,
    gallery: viewer.gallery.value,
    fallbackCoverUrl: viewer.photos.value?.[0]?.thumbnailUrl ?? null
  }),
  { immediate: true }
)

// 视图模式: '3d' 空间漫游 vs '2d' 策展画廊（记住访客上次的偏好）
type ViewerViewMode = '3d' | '2d'
const VIEW_MODE_STORAGE_KEY = 'vie:view-mode'
const storedViewMode = (() => {
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
  } catch {
    return null
  }
})()
const viewMode = ref<ViewerViewMode>(!creatorPreview && storedViewMode === '2d' ? '2d' : '3d')
const fullscreenAvailable = typeof document.documentElement.requestFullscreen === 'function'
watch(viewMode, (mode) => {
  if (creatorPreview || webglFallbackMessage.value) return
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // 隐私模式下写入会失败，忽略即可
  }
})
watch(
  () => [viewer.isReady.value, viewer.isEmpty.value, viewMode.value],
  async ([isReady, isEmpty, mode]) => {
    if ((!isReady && !isEmpty) || mode !== '2d') return
    await nextTick()
    performance.mark('viewer:interactive')
    if (isConfigPreview()) notifyParentReady()
  }
)
const webglFallbackMessage = ref('')

// WebGL Engine
const canvasRef = ref<HTMLCanvasElement | null>(null)
// 响应式的引擎就绪标志：engine 实例本身不是响应式对象，
// HUD 的挂载状态必须依赖 ref 才能在引擎创建/销毁后正确刷新。
const engineReady = ref(false)
let engine: ViewerEngine | null = null
let engineInitVersion = 0
let threeRuntime: typeof import('three') | null = null
let viewerEngineModule: typeof import('./core/ViewerEngine') | null = null
let viewer3dModules: Promise<[typeof import('three'), typeof import('./core/ViewerEngine')]> | null = null
function loadViewer3dModules() {
  if (!viewer3dModules) {
    viewer3dModules = Promise.all([import('three'), import('./core/ViewerEngine')]).then(modules => {
      threeRuntime = modules[0]
      viewerEngineModule = modules[1]
      performance.mark('viewer:engine-module-ready')
      return modules
    }).catch(error => {
      viewer3dModules = null
      throw error
    })
  }
  return viewer3dModules
}
let canvasPointerDownHandler: ((event: PointerEvent) => void) | null = null
let canvasPointerMoveHandler: ((event: PointerEvent) => void) | null = null
let canvasClickHandler: ((event: MouseEvent) => void) | null = null
let webglLostHandler: (() => void) | null = null

// Lightbox
const showLightbox = ref(false)
const lightboxIndex = ref(0)
const stageIndex = ref(0)
const stageActive = ref(false)
const stagePhoto = computed(() => viewer.photos.value[stageIndex.value])
const sceneConfig = computed(() => viewer.viewerConfig.value)
const sceneStyle = computed<CSSProperties>(() => ({
  '--scene-color': sceneConfig.value?.background?.color ?? '#111a17',
  '--scene-tone': sceneConfig.value?.background?.secondaryColor ?? '#263b32'
}))
const stageCaption = computed(() => CURATED_STYLES.find(style => style.id === selectedStyle.value)?.caption || '让照片，在空间里相遇')
function stepStage(direction: number) {
  engine?.getEventBus().emit('stage:step', direction)
  engine?.wakeUp()
}

// HUD Controls
const selectedStyle = ref<string>('')
const styleBusy = ref(false)
async function selectStyle(mode: CuratedStyle) {
  if (!engine || styleBusy.value) return
  styleBusy.value = true
  try {
    await engine.replaceConfig(applyCuratedStyle(engine.getRequestedConfig(), mode))
    selectedStyle.value = mode
    viewer.setAppliedConfigSnapshot(engine.getRequestedConfig())
    stageActive.value = true
    applyAutoTour(isAutoTour.value)
    engine.wakeUp(2500)
  } catch { webglFallbackMessage.value = '风格暂未切换成功，请再试一次。' }
  finally { styleBusy.value = false }
}
const showShareSheet = ref(false)
const isFullscreen = ref(false)
watch(() => showLightbox.value || showShareSheet.value, open => engine?.getEventBus().emit('stage:suspend', open))
const hoverTagPosition = computed(() => ({
  left: `${Math.max(12, Math.min(hoveredScreenPos.value.x + 16, window.innerWidth - 220))}px`,
  top: `${Math.max(12, Math.min(hoveredScreenPos.value.y + 16, window.innerHeight - 60))}px`
}))

// 电影级巡航与交互增强
const isAutoTour = ref(false)
const hoveredPhoto = ref<{ index: number; title: string } | null>(null)
const hoveredScreenPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const showApm = ref(false)
const diagnosticsEnabled = import.meta.env.DEV || import.meta.env.VITE_VIEWER_DIAGNOSTICS === 'true'
const apmMetrics = ref<EngineMetrics | null>(null)
const gyroEnabled = ref(false)

// Raycaster
let raycaster: Three.Raycaster | null = null
let mousePos: Three.Vector2 | null = null
let lastHoveredMesh: Three.Mesh | null = null

onMounted(() => {
  theatreMotion.addEventListener('change', theatreMotionChanged)
  window.addEventListener('message', handlePostMessage)
  if (isConfigPreview()) {
    previewHost()?.postMessage({ type: 'VIE_PREVIEW_BOOTSTRAP_REQUEST' }, adminEmbedOrigin())
    previewProgressTimer = window.setInterval(() => {
      previewHost()?.postMessage({ type: 'VIE_PREVIEW_PROGRESS' }, adminEmbedOrigin())
    }, 5000)
    previewProgressDeadline = window.setTimeout(stopPreviewProgress, 120000)
    if (viewMode.value === '3d') {
      void loadViewer3dModules().catch(() => {})
      void import('./plugins/registry').then(({ preloadCorePlugins }) => preloadCorePlugins()).catch(() => {})
    }
  }
  viewer.initialize()
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onUnmounted(() => {
  theatreMotion.removeEventListener('change', theatreMotionChanged)
  stopPreviewProgress()
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('deviceorientation', handleOrientation, true)
  window.removeEventListener('message', handlePostMessage)
  destroy3DEngine()
  clearViewerSeo()
})

// 动态按需挂载陀螺仪监听（避免权限策略拦截与无意义开销）
watch(gyroEnabled, (enabled) => {
  if (enabled) {
    try {
      window.addEventListener('deviceorientation', handleOrientation, true)
    } catch (e) {
      console.warn('Device orientation not supported or permitted', e)
    }
  } else {
    window.removeEventListener('deviceorientation', handleOrientation, true)
  }
})

function isEmbedPreview() {
  return embeddedPreview && window.parent !== window
}
function isConfigPreview() { return isEmbedPreview() || liveWindowPreview }
function previewHost(): Window | null { return isEmbedPreview() ? window.parent : liveWindowPreview ? window.opener : null }

function adminEmbedOrigin() {
  if (import.meta.env.VITE_ADMIN_ORIGIN) return new URL(import.meta.env.VITE_ADMIN_ORIGIN).origin
  const { protocol, hostname, port } = window.location
  if (import.meta.env.DEV && ['5174', '5175', '15174'].includes(port)) return protocol + '//' + hostname + ':' + (port === '15174' ? '15173' : '5173')
  return window.location.origin
}
let previewSequence = 0
async function handlePostMessage(event: MessageEvent) {
  const origin = adminEmbedOrigin()
  const host = previewHost()
  if (!host || !isTrustedPreviewMessage(event, host, origin)) return
  const bootstrap = event.data?.type === 'VIE_PREVIEW_BOOTSTRAP'
  if (bootstrap && !engineReady.value && Number.isSafeInteger(event.data.sequence)) {
    const result = normalizeViewerConfig(event.data.config)
    if (result.issues.length) return
    viewer.setConfigSnapshot(result.config)
    // Once init has captured a config, seed state but defer acknowledgment so
    // READY triggers CONFIG_UPDATE after init instead of racing plugin setup.
    if (!engine) {
      host.postMessage({ type: 'VIE_PREVIEW_BOOTSTRAP_APPLIED', sequence: event.data.sequence }, origin)
    }
    return
  }
  if ((!bootstrap && event.data?.type !== 'VIE_CONFIG_UPDATE') || !Number.isSafeInteger(event.data.sequence) || event.data.sequence <= previewSequence) return
  const sequence: number = event.data.sequence
  previewSequence = sequence
  try {
    const result = normalizeViewerConfig(event.data.config)
    if (result.issues.length) throw new ViewerConfigValidationError(result.issues)
    serializeViewerConfig(result.config)
    const activeEngine = engine
    if (activeEngine) {
      const runtimeConfig = structuredClone(result.config)
      await activeEngine.replaceConfig(runtimeConfig)
      if (sequence !== previewSequence || activeEngine !== engine) return
    } else if (viewMode.value !== '2d') {
      throw new Error('预览尚未就绪，请重试。')
    }
    if (sequence !== previewSequence) return
    viewer.setAppliedConfigSnapshot(result.config)
    applyAutoTour(result.config.camera?.autoRotate === true)
    if (bootstrap) {
      host.postMessage({ type: 'VIE_PREVIEW_BOOTSTRAP_APPLIED', sequence }, origin)
    } else {
      host.postMessage({ type: 'VIE_CONFIG_APPLIED', sequence,
        effectiveQuality: activeEngine?.getEffectiveQuality() ?? 'low',
        reason: activeEngine?.getQualityReason() ?? (viewMode.value === '2d' ? 'classic 2D preview' : null) }, origin)
    }
  } catch (cause) {
    if (sequence !== previewSequence) return
    host.postMessage({ type: 'VIE_CONFIG_APPLIED', sequence, effectiveQuality: engine?.getEffectiveQuality() ?? 'low', reason: null,
      error: cause instanceof ViewerConfigValidationError ? cause.message : '预览应用失败，请重试。' }, origin)
  }
}
function notifyParentReady() {
  if (isConfigPreview()) {
    stopPreviewProgress()
    previewHost()?.postMessage({ type: 'VIE_PREVIEW_READY' }, adminEmbedOrigin())
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {
      webglFallbackMessage.value = '浏览器暂不支持全屏，可继续在当前窗口欣赏。'
    })
  } else {
    document.exitFullscreen().catch(() => {})
  }
}

function returnToStart() {
  if (viewMode.value === '3d') resetView()
  else window.scrollTo({ top: 0, behavior: theatreMotion.matches ? 'instant' : 'smooth' })
}

// 监听照片数据加载或视图模式切换后初始化 3D 引擎；
// "加载更多"追加照片时只增量刷新场景，不重建引擎（保留相机与特效状态）。
let scenePhotoCount = 0
watch(
  () => [viewer.gallery.value?.accessState, viewMode.value],
  ([accessState, mode]) => {
    if (accessState === 'READY' && mode === '3d') void loadViewer3dModules().catch(() => {})
  }
)
watch(
  () => [viewer.isReady.value, viewer.isEmpty.value, viewer.state.value, viewMode.value, viewer.photos.value.length, viewer.viewerConfig.value],
  async ([isReady, isEmpty, state, mode]) => {
    const embedReady = isEmbedPreview() && viewer.viewerConfig.value !== null
    const canInit3d = mode === '3d' && (isReady || isEmpty || embedReady)
    if (mode === '2d') {
      destroy3DEngine()
      return
    }
    if (!canInit3d) return

    const photoCount = viewer.photos.value.length
    if (engine) {
      if (photoCount !== scenePhotoCount) {
        scenePhotoCount = photoCount
        refresh3DPhotos()
      }
      return
    }

    await nextTick()
    init3DEngine()
  },
  { deep: true }
)

function scenePhotos() {
  return viewer.photos.value.length ? viewer.photos.value : (isDevDemo() ? createDemoFallbackPhotos() : [])
}
function refresh3DPhotos() {
  engine?.syncPhotos(scenePhotos())
}

async function init3DEngine() {
  if (!canvasRef.value) return
  destroy3DEngine()
  const initVersion = engineInitVersion
  webglFallbackMessage.value = ''
  let initializingEngine: ViewerEngine | null = null

  try {
    const [three, engineModule] = await loadViewer3dModules()
    if (initVersion !== engineInitVersion || viewMode.value !== '3d' || !canvasRef.value) return
    const canvas = canvasRef.value
    if (!canvas) return
    threeRuntime = three
    viewerEngineModule = engineModule
    raycaster = new three.Raycaster()
    mousePos = new three.Vector2()
    const rawPhotos = viewer.photos.value
    if (!rawPhotos || rawPhotos.length === 0) {
      if (!isDevDemo() && !isEmbedPreview()) return
    }

    const activeEngine = new engineModule.ViewerEngine(canvas)
    initializingEngine = activeEngine
    engine = activeEngine
    activeEngine.getEventBus().on('effects:fallback', (data: { message: string }) => {
      webglFallbackMessage.value = data.message
    })
    activeEngine.getEventBus().on('quality:fallback', (data: { message: string }) => fallbackTo2D(data.message))

    // 创建 3D Photo Mesh 列表（严格只使用真实空间中上传的照片）
    activeEngine.syncPhotos(scenePhotos())
    scenePhotoCount = viewer.photos.value.length

    try {
      const initialConfig = isEmbedPreview()
        ? viewer.viewerConfig.value
        : viewer.state.value === 'ready' || viewer.state.value === 'empty' ? viewer.viewerConfig.value : undefined
      await activeEngine.init(slug, initialConfig, { applyLocalPreferences: !creatorPreview })
    } catch (err) {
      if (!isEmbedPreview() || viewer.viewerConfig.value) throw err
      await activeEngine.init()
    }
    if (initVersion !== engineInitVersion) {
      initializingEngine.dispose()
      if (engine === initializingEngine) engine = null
      return
    }

    // 初始相机行为跟随已发布配置
    const initialConfig = activeEngine.getConfigManager().getConfig() as Record<string, any>
    viewer.setAppliedConfigSnapshot(activeEngine.getRequestedConfig())
    selectedStyle.value = initialConfig?.layout?.mode ?? ''
    stageActive.value = initialConfig?.layout?.params?.composition === 'curated'
    stageIndex.value = 0
    activeEngine.getEventBus().on('stage:change', (state: { index: number }) => { stageIndex.value = state.index })
    activeEngine.getEventBus().on('stage:open', (index: number) => openLightbox(index))
    activeEngine.getEventBus().on('stage:interaction', () => activeEngine.wakeUp())
    activeEngine.getEventBus().on('config:update', (config: { layout: { mode: string; params?: Record<string, unknown> } }) => {
      selectedStyle.value = config.layout.mode
      stageActive.value = config.layout.params?.composition === 'curated'
    })
    applyAutoTour(initialConfig?.camera?.autoRotate === true)

    // 监听 APM 探针
    activeEngine.getEventBus().on('metrics:update', (metrics: EngineMetrics) => {
      apmMetrics.value = metrics
    })

    webglLostHandler = () => fallbackTo2D('3D 渲染连接中断，已切换到经典画廊，照片仍可正常浏览。')
    activeEngine.getEventBus().on('webgl:lost', webglLostHandler)

    activeEngine.getEventBus().on('theatre:state', (state: TheatreState) => {
      theatre.value = state
      hoveredPhoto.value = null
      lastHoveredMesh = null
    })
    activeEngine.getEventBus().on('theatre:focused', (index: number) => openLightbox(index))

    // 绑定 3D 悬停与交互
    bindCanvasInteractions()
    activeEngine.start()
    engineReady.value = true
    performance.mark('viewer:interactive')
    notifyParentReady()
  } catch (err) {
    if (initVersion !== engineInitVersion) {
      initializingEngine?.dispose()
      if (engine === initializingEngine) engine = null
      return
    }
    if (!(viewerEngineModule !== null && err instanceof viewerEngineModule.WebGLUnavailableError)) console.error('Failed to init 3D engine:', err)
    fallbackTo2D(
      viewerEngineModule !== null && err instanceof viewerEngineModule.WebGLUnavailableError
        ? '当前设备无法使用 3D，已切换到经典画廊，照片仍可正常浏览。'
        : '3D 画廊暂时无法启动，已切换到经典画廊，照片仍可正常浏览。'
    )
  }
}

function fallbackTo2D(message: string) {
  if (webglFallbackMessage.value && viewMode.value === '2d') return
  destroy3DEngine()
  webglFallbackMessage.value = message
  viewMode.value = '2d'
}

function bindCanvasInteractions() {
  const canvas = canvasRef.value
  if (!canvas) return

  let pointerDownPos = { x: 0, y: 0 }

  canvasPointerDownHandler = (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY }
  }

  canvasPointerMoveHandler = (e) => {
    // Touch pointers are reserved for OrbitControls gestures; hover is mouse-only.
    const activeRaycaster = raycaster
    const activeMousePos = mousePos
    if (e.pointerType !== 'mouse' || !engine || !activeRaycaster || !activeMousePos) return
    const rect = canvas.getBoundingClientRect()
    activeMousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    activeMousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    activeRaycaster.setFromCamera(activeMousePos, engine.getCamera())
    const intersects = activeRaycaster.intersectObjects(engine.getPhotos().filter(photo => photo.visible), false)

    if (intersects.length > 0) {
      const hit = intersects[0].object as Three.Mesh
      canvas.style.cursor = 'pointer'

      if (lastHoveredMesh !== hit) {
        lastHoveredMesh = hit
        engine.getEventBus().emit('theatre:hover', hit.userData.index)
      }

      hoveredPhoto.value = {
        index: hit.userData.index,
        title: hit.userData.title
      }
      hoveredScreenPos.value = { x: e.clientX, y: e.clientY }
    } else {
      if (lastHoveredMesh) {
        lastHoveredMesh = null
      }
      canvas.style.cursor = 'default'
      hoveredPhoto.value = null
      engine.getEventBus().emit('theatre:hover', null)
    }
  }

  canvasClickHandler = (e) => {
    // 过滤拖拽旋转操作
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y)
    if (dist > 6) return

    const activeRaycaster = raycaster
    const activeMousePos = mousePos
    if (!engine || !activeRaycaster || !activeMousePos) return
    const rect = canvas.getBoundingClientRect()
    activeMousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    activeMousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    activeRaycaster.setFromCamera(activeMousePos, engine.getCamera())
    const intersects = activeRaycaster.intersectObjects(engine.getPhotos().filter(photo => photo.visible), false)

    if (intersects.length > 0) {
      const hit = intersects[0].object as Three.Mesh
      const idx = hit.userData.index
      if (stageActive.value) { openLightbox(idx); return }
      
      if (theatre.value.active) {
        void sendTheatreCommand({ type: 'focus', index: idx })
        return
      }

      // 触发照片点击事件，让光照系统响应
      engine.getEventBus().emit('photo:click', { photo: hit })
      
      flyToPhotoAndFocus(hit, () => {
        openLightbox(idx)
      })
    }
  }

  canvas.addEventListener('pointerdown', canvasPointerDownHandler)
  canvas.addEventListener('pointermove', canvasPointerMoveHandler)
  canvas.addEventListener('click', canvasClickHandler)
}

/**
 * 电影级相机平滑飞行聚焦 (Cinematic Smooth Flight)
 * 使用 Quartic Ease-Out 曲线，提供更流畅的电影感
 */
function flyToPhotoAndFocus(mesh: Three.Mesh, onComplete?: () => void) {
  if (!engine) return
  const target = new threeRuntime!.Vector3()
  mesh.getWorldPosition(target)
  const normal = new threeRuntime!.Vector3(0, 0, 1).applyEuler(mesh.rotation)
  const position = target.clone().add(normal.multiplyScalar(220))
  position.y += 15
  engine.getEventBus().emit('photo:focus', { photo: mesh })
  engine.flyTo(position, target, theatreMotion.matches ? 0 : 1.4, onComplete)
}

/**
 * 应用配置中心下发的相机行为（自动漫游），配置未开启时保持访客手动控制
 */
function applyAutoTour(enabled: boolean) {
  isAutoTour.value = enabled && !theatreMotion.matches
  engine?.setAutoTour(isAutoTour.value)
}

function selectLightboxPhoto(index: number) {
  lightboxIndex.value = index
  if (theatre.value.active) void sendTheatreCommand({ type: 'focus', index })
}

function closeLightbox() {
  showLightbox.value = false
  engine?.getEventBus().emit('photo:blur')
}

function toggleAutoTour() {
  applyAutoTour(!isAutoTour.value)
}

/**
 * 移动端陀螺仪重力感应视差
 */
function handleOrientation(e: DeviceOrientationEvent) {
  if (theatre.value.active) return
  if (!gyroEnabled.value || !engine) return
  const beta = e.beta || 0   // -180 ~ 180 (X-axis tilt)
  const gamma = e.gamma || 0 // -90 ~ 90 (Y-axis tilt)

  const camera = engine.getCamera()
  const offsetX = (gamma / 90) * 80
  const offsetY = ((beta - 45) / 90) * 80
  camera.position.x += (offsetX - camera.position.x * 0.05) * 0.05
  camera.position.y += (offsetY - camera.position.y * 0.05) * 0.05
}

function toggleGyro() {
  if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
    (DeviceOrientationEvent as any).requestPermission()
      .then((state: string) => {
        if (state === 'granted') {
          gyroEnabled.value = !gyroEnabled.value
        }
      })
      .catch(console.error)
  } else {
    gyroEnabled.value = !gyroEnabled.value
  }
}

// 演示内容只在本地开发构建可访问，生产环境不会显示 demo 相册。
function isDevDemo() {
  return import.meta.env.DEV && slug === 'demo'
}

function createDemoFallbackPhotos() {
  return Array.from({ length: 12 }).map((_, i) => ({
    title: `Demo Photo ${i + 1}`,
    thumbnailUrl: `https://picsum.photos/800/600?random=${i + 1}`,
    width: 800,
    height: 600,
    sortOrder: i
  }))
}

function destroy3DEngine() {
  engineInitVersion++
  const canvas = canvasRef.value
  if (canvas) {
    if (canvasPointerDownHandler) canvas.removeEventListener('pointerdown', canvasPointerDownHandler)
    if (canvasPointerMoveHandler) canvas.removeEventListener('pointermove', canvasPointerMoveHandler)
    if (canvasClickHandler) canvas.removeEventListener('click', canvasClickHandler)
  }

  if (engine && webglLostHandler) {
    engine.getEventBus().off('webgl:lost', webglLostHandler)
  }

  canvasPointerDownHandler = null
  canvasPointerMoveHandler = null
  canvasClickHandler = null
  webglLostHandler = null
  hoveredPhoto.value = null
  lastHoveredMesh = null
  scenePhotoCount = 0

  if (engine) {
    engine.stop()
    engine.dispose()
    engine = null
  }
  engineReady.value = false
  stageActive.value = false
  theatre.value = { ...theatre.value, active: false, status: 'idle', elapsed: 0, indices: [] }
  theatreBusy.value = false
  raycaster = null
  mousePos = null
}

async function handleUnlock(password: string) {
  const success = await viewer.unlock(password)
  if (!success && viewer.error.value) {
    // handled in state
  }
}

function openLightbox(index: number) {
  if (index < 0 || index >= viewer.photos.value.length) return
  lightboxIndex.value = index
  showLightbox.value = true
}

function markPhotoWallReady() {
  if (viewMode.value === '2d') performance.mark('viewer:first-photo-rendered')
}

// 照片数量与视图模式共同决定 HUD 装载：
// 2D 视图/无照片时不再渲染 3D 专属控件（自动巡航、陀螺仪、氛围预设）。
const hudState = computed(() => {
  if (!viewer.isReady.value || viewer.photos.value.length === 0) return 'empty' as const
  return viewMode.value === '3d' && !engineReady.value ? 'pending' as const : 'ready' as const
})
const show3dHud = computed(() => viewMode.value === '3d' && hudState.value === 'ready')
const showTheatreControls = computed(() => !isEmbedPreview() && show3dHud.value && (!stageActive.value || theatre.value.active))

// 视角复位：回到默认机位，不打断配置中的自动漫游状态
function resetView() {
  if (!engine) return
  engine.resetView()
}

</script>

<template>
  <div class="viewer-app-root" :style="sceneStyle" :class="{ 'is-spatial': viewMode === '3d' && (viewer.isReady.value || isEmbedPreview()), 'is-editorial': viewMode === '2d', 'is-embedded': isEmbedPreview() }">
    <!-- 1. 加载中状态 -->
    <div v-if="viewer.state.value === 'loading'" class="loading-screen" role="status" aria-live="polite" aria-busy="true">
      <div class="loader-box">
        <span class="loader-wordmark" aria-hidden="true">vie</span>
        <div class="loader-line" aria-hidden="true"></div>
        <p class="loader-text">正在打开影展…</p>
      </div>
    </div>

    <!-- 2. 密码解锁状态 -->
    <PasswordPrompt
      v-else-if="viewer.needsPassword.value"
      :is-unlocking="viewer.unlocking.value"
      :error="viewer.error.value"
      :gallery-title="viewer.gallery.value?.title"
      @unlock="handleUnlock"
    />

    <!-- 3. Admin 嵌入预览：草稿/未公开时仍渲染 WebGL 沙盒 -->
    <div v-else-if="isEmbedPreview() && viewMode === '3d'" class="gallery-viewport embed-preview">
      <div class="canvas-container">
        <canvas ref="canvasRef" class="webgl-canvas"></canvas>
      </div>
    </div>

    <!-- 3D 预览失败时，嵌入页也保留可浏览的照片网格 -->
    <div v-else-if="isEmbedPreview() && viewMode === '2d'" class="gallery-viewport embed-preview embed-fallback-viewport">
      <div v-if="webglFallbackMessage" class="webgl-fallback-banner" role="status">
        <Icon name="grid" :size="16" />
        <span>{{ webglFallbackMessage }}</span>
        <button type="button" @click="webglFallbackMessage = ''">知道了</button>
      </div>
      <main class="editorial-main embed-fallback-main">
        <PhotoWall :photos="viewer.photos.value" fit="cover" :prioritize-first-photos="true" @select="openLightbox" @first-photo-rendered="markPhotoWallReady" />
      </main>
      <LightboxModal
        :show="showLightbox"
        :photos="viewer.photos.value"
        :current-index="lightboxIndex"
        :allow-download="viewer.allowDownload.value"
        @close="closeLightbox"
        @select="selectLightboxPhoto"
      />
    </div>

    <!-- 4. 空相册状态 -->
    <EmptyState
      v-else-if="viewer.isEmpty.value"
      :message="viewer.gallery.value?.title ? `“${viewer.gallery.value.title}” 还没有作品，创作者正在准备照片，请稍后再来欣赏。` : undefined"
    />

    <!-- 5. 错误状态 -->
    <ErrorState
      v-else-if="viewer.state.value === 'not_found'"
      title="找不到这场影展"
      :message="viewer.error.value || '展厅可能已被移除，请检查链接，或向创作者索取新的链接。'"
      @retry="viewer.retry"
    />

    <ErrorState
      v-else-if="viewer.state.value === 'share_required'"
      title="请使用分享链接进入"
      :message="viewer.error.value || '这是一个私密展厅，请向创作者索取新的分享链接。'"
      @retry="viewer.retry"
    />

    <ErrorState
      v-else-if="viewer.state.value === 'error'"
      title="影展暂时无法打开"
      :message="viewer.error.value || '加载相册数据时遇到问题，请重试。'"
      @retry="viewer.retry"
    />

    <!-- 5. 就绪：沉浸式双模画廊 -->
    <div v-else-if="viewer.isReady.value" class="gallery-viewport">
      <div v-if="viewMode === '3d' && apmMetrics?.failedTextures && !webglFallbackMessage" class="webgl-fallback-banner" role="status">
        <span>{{ apmMetrics?.failedTextures }} 张照片的预览暂未载入</span>
        <button type="button" @click="engine?.retryPhotoTextures()">重试照片预览</button>
      </div>
      <div v-if="webglFallbackMessage" class="webgl-fallback-banner" role="status">
        <Icon name="grid" :size="16" />
        <span>{{ webglFallbackMessage }}</span>
        <button type="button" @click="webglFallbackMessage = ''">知道了</button>
      </div>

      <header class="exhibition-header">
        <button type="button" class="exhibition-brand" @click="returnToStart" aria-label="回到展厅起点">vie<span>光影之间</span></button>
        <div class="exhibition-tools">
          <div class="exhibition-view" role="group" aria-label="观看方式">
            <button type="button" :aria-pressed="viewMode === '3d'" @click="viewMode = '3d'">空间漫游</button>
            <button type="button" :aria-pressed="viewMode === '2d'" @click="viewMode = '2d'">平面展览</button>
          </div>
          <button v-if="show3dHud && !theatre.active && !theatre.reducedMotion" type="button" class="quiet-button tour-button" :aria-label="isAutoTour ? '暂停漫游' : '自动漫游'" :aria-pressed="isAutoTour" @click="toggleAutoTour"><Icon :name="isAutoTour ? 'pause' : 'play'" :size="15" /><span>{{ isAutoTour ? '暂停漫游' : '自动漫游' }}</span></button>
          <button v-if="fullscreenAvailable" type="button" class="quiet-button fullscreen-button" :aria-label="isFullscreen ? '退出全屏' : '全屏欣赏'" :aria-pressed="isFullscreen" @click="toggleFullscreen"><Icon name="maximize" :size="17" /></button>
          <button type="button" class="exhibition-share" aria-label="分享" @click="showShareSheet = true"><Icon name="share" :size="15" /><span>分享</span></button>
        </div>
      </header>
      <div v-if="viewMode === '3d'" class="exhibition-heading">
        <h1>{{ viewer.gallery.value?.title || '光影之间' }}</h1>
        <p>{{ viewer.total.value }} 件作品 · 摄影展览</p>
      </div>
      <div v-if="show3dHud && stageActive && !theatre.active" class="stage-info">
        <div class="stage-counter" aria-live="polite" aria-atomic="true"><span>{{ String(stageIndex + 1).padStart(2, '0') }}</span><i aria-hidden="true"></i><span>{{ String(viewer.photos.value.length).padStart(2, '0') }}</span></div>
        <button type="button" class="stage-current" aria-label="查看当前作品" @click="openLightbox(stageIndex)"><span>{{ stagePhoto?.title || `作品 ${stageIndex + 1}` }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg></button>
        <p>{{ stageCaption }}</p>
      </div>
      <div v-if="show3dHud && stageActive && !theatre.active" class="stage-navigation" aria-label="逐张浏览">
        <button type="button" aria-label="上一张作品" :disabled="viewer.photos.value.length < 2" @click="stepStage(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h13"/></svg></button>
        <button type="button" aria-label="下一张作品" :disabled="viewer.photos.value.length < 2" @click="stepStage(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6M3 12h13"/></svg></button>
      </div>
      <nav v-if="show3dHud && !theatre.active" class="composition-dock" :class="{ 'with-theatre-entry': showTheatreControls }" aria-label="展示风格">
        <button v-for="style in CURATED_STYLES" :key="style.id" type="button" :aria-pressed="selectedStyle === style.id" :disabled="styleBusy" @click="selectStyle(style.id)">
          <svg viewBox="0 0 44 24" aria-hidden="true"><path v-if="style.id === 'helix'" d="M4 19C3 1 39 1 39 8S4 24 4 16S38 9 40 4"/><ellipse v-else-if="style.id === 'carousel'" cx="22" cy="12" rx="18" ry="8"/><path v-else d="M2 12Q12 -2 22 12T42 12M2 20Q12 6 22 20T42 20"/></svg>
          {{ style.label }}
        </button>
      </nav>
      <!-- APM Real-time Dashboard Capsule -->
      <aside v-if="diagnosticsEnabled && showApm && viewMode === '3d' && apmMetrics" class="apm-dashboard">
        <div class="apm-title">
          <span class="live-dot"></span>
          <span>SPATIAL APM MONITOR</span>
        </div>
        <div class="apm-grid">
          <div class="apm-item">
            <span class="apm-label">FPS:</span>
            <span class="apm-val" :class="{ 'fps-warn': apmMetrics.fps < 40 }">{{ apmMetrics.fps }}</span>
          </div>
          <div class="apm-item">
            <span class="apm-label">Frame:</span>
            <span class="apm-val">{{ apmMetrics.frameTimeMs }}ms</span>
          </div>
          <div class="apm-item">
            <span class="apm-label">DrawCalls:</span>
            <span class="apm-val">{{ apmMetrics.drawCalls }}</span>
          </div>
          <div class="apm-item">
            <span class="apm-label">Triangles:</span>
            <span class="apm-val">{{ apmMetrics.triangles }}</span>
          </div>
          <div class="apm-item">
            <span class="apm-label">DPR:</span>
            <span class="apm-val">{{ apmMetrics.pixelRatio }}x</span>
          </div>
          <div class="apm-item">
            <span class="apm-label">Power:</span>
            <span class="apm-val">{{ apmMetrics.isThrottled ? 'Eco-Idle' : 'Active 60Hz' }}</span>
          </div>
        </div>
      </aside>

      <!-- Hover Tooltip Tag -->
      <div
        v-if="hoveredPhoto && viewMode === '3d' && !showLightbox && !showShareSheet"
        class="photo-hover-tag"
        :style="hoverTagPosition"
      >
        <span class="tag-index">#{{ hoveredPhoto.index + 1 }}</span>
        <span class="tag-title">{{ hoveredPhoto.title }}</span>
      </div>

      <!-- Mode 1: 3D Spatial WebGL Canvas -->
      <div v-show="viewMode === '3d'" class="canvas-container" :class="{ 'has-theatre-controls': showTheatreControls, 'is-theatre-active': theatre.active }">
        <canvas ref="canvasRef" class="webgl-canvas" tabindex="0" :aria-label="stageActive ? '照片空间，拖动、滚轮或左右方向键切换作品，Enter 查看大图。' : '照片空间，可拖动探索、滚动缩放。也可切换平面展览，用键盘逐张浏览照片。'"></canvas>
        <div v-if="!engineReady" class="scene-loading" role="status"><span class="scene-loading-line" aria-hidden="true"></span><span>正在布置展厅…</span><button type="button" @click="viewMode = '2d'">先看平面展览</button></div>
        <div v-else-if="!theatre.active" class="spatial-tips">
          <p><span class="desktop-tip">{{ stageActive ? '拖动 / 方向键切换' : '拖动探索 · 滚动缩放' }}</span><span class="touch-tip">左右滑动浏览</span><span class="tip-separator" aria-hidden="true">·</span>点击作品查看大图</p>
        </div>
        <PhotoTheatreControls v-if="showTheatreControls" :state="theatre" :total="viewer.photos.value.length" :busy="theatreBusy" @command="sendTheatreCommand" />
        <p v-if="viewer.error.value" class="pagination-error spatial-error" role="alert">{{ viewer.error.value }}</p>
        <button
          v-if="viewer.hasMore.value"
          class="load-more-floating"
          type="button"
          :disabled="viewer.loadingMore.value"
          @click="viewer.loadMore"
        >
          {{ viewer.loadingMore.value ? '正在加载…' : viewer.error.value ? '重试加载照片' : `继续浏览 · 还有 ${viewer.total.value - viewer.photos.value.length} 张` }}
        </button>
      </div>

      <!-- Mode 2: 2D Editorial Curated Wall -->
      <main v-show="viewMode === '2d'" class="editorial-main">
        <div class="editorial-hero">
          <h1 class="hero-title">{{ viewer.gallery.value?.title || '光影之间' }}</h1>
          <p class="hero-meta"><span>{{ viewer.total.value }} 件作品</span><span>点击照片，近看每一帧</span></p>
        </div>

        <PhotoWall :photos="viewer.photos.value" fit="cover" :prioritize-first-photos="viewMode === '2d'" @select="openLightbox" @first-photo-rendered="markPhotoWallReady" />
        <p v-if="viewer.error.value" class="pagination-error" role="alert">{{ viewer.error.value }}</p>
        <button
          v-if="viewer.hasMore.value"
          class="load-more-btn"
          type="button"
          :disabled="viewer.loadingMore.value"
          @click="viewer.loadMore"
        >
          {{ viewer.loadingMore.value ? '正在加载…' : viewer.error.value ? '重试加载照片' : `加载更多 · 还有 ${viewer.total.value - viewer.photos.value.length} 张` }}
        </button>
        <footer class="exhibition-footer"><span>vie · 光影之间</span><span>{{ viewer.photos.value.length }} / {{ viewer.total.value }} 件作品</span></footer>
      </main>

      <!-- Lightbox High-Res Viewer Modal -->
      <LightboxModal
        :show="showLightbox"
        :photos="viewer.photos.value"
        :current-index="lightboxIndex"
        :allow-download="viewer.allowDownload.value"
        @close="closeLightbox"
        @select="selectLightboxPhoto"
      />

      <!-- 访客分享面板：微信/QQ 内置浏览器引导 + 系统分享 + 复制链接 -->
      <VisitorShareModal
        :show="showShareSheet"
        :gallery-title="viewer.gallery.value?.title || ''"
        :photo-count="viewer.total.value"
        @close="showShareSheet = false"
      />
    </div>
  </div>
</template>

<style scoped src="./curated.css"></style>
