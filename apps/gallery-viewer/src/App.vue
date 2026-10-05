<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { isTrustedPreviewMessage, normalizeViewerConfig, serializeViewerConfig, ViewerConfigValidationError } from '@vie/gallery-contracts'
import { useViewerState } from './composables/useViewerState'
import { applyViewerSeo, clearViewerSeo } from './lib/seo'
import { ViewerEngine, WebGLUnavailableError, type EngineMetrics } from './core/ViewerEngine'
import PasswordPrompt from './components/PasswordPrompt.vue'
import EmptyState from './components/EmptyState.vue'
import ErrorState from './components/ErrorState.vue'
import LightboxModal from './components/LightboxModal.vue'
import PhotoWall from './components/PhotoWall.vue'
import VisitorShareModal from './components/VisitorShareModal.vue'
import Icon from './components/Icon.vue'

// 从 URL 获取 slug。生产环境没有 slug 时不回退 demo 内容。
const slug = location.pathname.split('/').filter(Boolean).pop() || ''

// 状态机
const viewer = useViewerState(slug)

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
const viewMode = ref<ViewerViewMode>(storedViewMode === '2d' ? '2d' : '3d')
watch(viewMode, (mode) => {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // 隐私模式下写入会失败，忽略即可
  }
})
const webglFallbackMessage = ref('')

// WebGL Engine
const canvasRef = ref<HTMLCanvasElement | null>(null)
// 响应式的引擎就绪标志：engine 实例本身不是响应式对象，
// HUD 的挂载状态必须依赖 ref 才能在引擎创建/销毁后正确刷新。
const engineReady = ref(false)
let engine: ViewerEngine | null = null
let canvasPointerDownHandler: ((event: PointerEvent) => void) | null = null
let canvasPointerMoveHandler: ((event: PointerEvent) => void) | null = null
let canvasClickHandler: ((event: MouseEvent) => void) | null = null
let webglLostHandler: (() => void) | null = null

// Lightbox
const showLightbox = ref(false)
const lightboxIndex = ref(0)

// HUD Controls
const showPresetMenu = ref(false)
const currentPreset = ref('starry-night')
const showShareSheet = ref(false)
const isFullscreen = ref(false)

// 电影级巡航与交互增强
const isAutoTour = ref(false)
const hoveredPhoto = ref<{ index: number; title: string } | null>(null)
const hoveredScreenPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const showApm = ref(false)
const diagnosticsEnabled = import.meta.env.DEV || import.meta.env.VITE_VIEWER_DIAGNOSTICS === 'true'
const apmMetrics = ref<EngineMetrics | null>(null)
const gyroEnabled = ref(false)

// Raycaster
const raycaster = new THREE.Raycaster()
const mousePos = new THREE.Vector2()
let lastHoveredMesh: THREE.Mesh | null = null

const presets = [
  { name: 'starry-night', label: '星空夜曲 · Cosmic', icon: 'sparkles' },
  { name: 'forest-dream', label: '森林之梦 · Sakura', icon: 'sparkles' },
  { name: 'ocean-breeze', label: '海洋微风 · Breeze', icon: 'globe' },
  { name: 'sunset-glow', label: '日落余晖 · Sunset', icon: 'sparkles' },
  { name: 'romantic', label: '心动浪漫 · Hearts', icon: 'sparkles' },
  { name: 'minimal', label: '极简空间 · Minimal', icon: 'cube' },
  { name: 'winter-snow', label: '冬日雪境', icon: 'sparkles' },
  { name: 'film-gallery', label: '胶片展厅', icon: 'cube' }
]

onMounted(() => {
  viewer.initialize()
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('message', handlePostMessage)
})

onUnmounted(() => {
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
  return window.parent !== window
}

function adminEmbedOrigin() {
  if (import.meta.env.VITE_ADMIN_ORIGIN) return new URL(import.meta.env.VITE_ADMIN_ORIGIN).origin
  const { protocol, hostname, port } = window.location
  if (import.meta.env.DEV && ['5174', '5175', '15174'].includes(port)) return protocol + '//' + hostname + ':' + (port === '15174' ? '15173' : '5173')
  return window.location.origin
}
let previewSequence = 0
async function handlePostMessage(event: MessageEvent) {
  const origin = adminEmbedOrigin()
  if (!isEmbedPreview() || !isTrustedPreviewMessage(event, window.parent, origin)) return
  if (event.data?.type !== 'VIE_CONFIG_UPDATE' || !Number.isSafeInteger(event.data.sequence) || event.data.sequence <= previewSequence) return
  const sequence: number = event.data.sequence
  previewSequence = sequence
  try {
    const result = normalizeViewerConfig(event.data.config)
    if (result.issues.length) throw new ViewerConfigValidationError(result.issues)
    serializeViewerConfig(result.config)
    const activeEngine = engine
    if (!activeEngine) throw new Error('预览尚未就绪，请重试。')
    await activeEngine.replaceConfig(result.config)
    if (sequence !== previewSequence || activeEngine !== engine) return
    viewer.viewerConfig.value = result.config
    applyAutoTour(result.config.camera?.autoRotate === true)
    window.parent.postMessage({ type: 'VIE_CONFIG_APPLIED', sequence, effectiveQuality: activeEngine.getEffectiveQuality(), reason: activeEngine.getQualityReason() }, origin)
  } catch (cause) {
    if (sequence !== previewSequence) return
    window.parent.postMessage({ type: 'VIE_CONFIG_APPLIED', sequence, effectiveQuality: engine?.getEffectiveQuality() ?? 'low', reason: null,
      error: cause instanceof ViewerConfigValidationError ? cause.message : '预览应用失败，请重试。' }, origin)
  }
}
function notifyParentReady() {
  if (isEmbedPreview()) window.parent.postMessage({ type: 'VIE_PREVIEW_READY' }, adminEmbedOrigin())
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
  } else {
    document.exitFullscreen().catch(() => {})
  }
}

// 监听照片数据加载或视图模式切换后初始化 3D 引擎；
// "加载更多"追加照片时只增量刷新场景，不重建引擎（保留相机与特效状态）。
let scenePhotoCount = 0
watch(
  () => [viewer.isReady.value, viewer.isEmpty.value, viewer.state.value, viewMode.value, viewer.photos.value.length],
  async ([isReady, isEmpty, state, mode]) => {
    const embedReady = isEmbedPreview() && state !== 'loading' && state !== 'password_prompt'
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
  webglFallbackMessage.value = ''

  try {
    const rawPhotos = viewer.photos.value
    if (!rawPhotos || rawPhotos.length === 0) {
      if (!isDevDemo() && !isEmbedPreview()) return
    }

    engine = new ViewerEngine(canvasRef.value)
    engine.getEventBus().on('effects:fallback', (data: { message: string }) => {
      webglFallbackMessage.value = data.message
    })
    engine.getEventBus().on('quality:changed', () => { webglFallbackMessage.value = '已优化显示效果' })
    engine.getEventBus().on('quality:fallback', (data: { message: string }) => fallbackTo2D(data.message))

    // 创建 3D Photo Mesh 列表（严格只使用真实空间中上传的照片）
    engine.syncPhotos(scenePhotos())
    scenePhotoCount = viewer.photos.value.length

    try {
      await engine.init(slug)
    } catch (err) {
      if (!isEmbedPreview()) throw err
      await engine.init()
    }
    engine.start()
    engineReady.value = true
    notifyParentReady()

    // 初始相机行为跟随已发布配置
    const initialConfig = engine.getConfigManager().getConfig() as Record<string, any>
    applyAutoTour(initialConfig?.camera?.autoRotate === true)

    // 监听 APM 探针
    engine.getEventBus().on('metrics:update', (metrics: EngineMetrics) => {
      apmMetrics.value = metrics
    })

    webglLostHandler = () => fallbackTo2D('3D 渲染连接中断，已切换到经典画廊，照片仍可正常浏览。')
    engine.getEventBus().on('webgl:lost', webglLostHandler)

    // 绑定 3D 悬停与交互
    bindCanvasInteractions()
  } catch (err) {
    console.error('Failed to init 3D engine:', err)
    fallbackTo2D(
      err instanceof WebGLUnavailableError
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
    if (e.pointerType !== 'mouse' || !engine) return
    const rect = canvas.getBoundingClientRect()
    mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mousePos, engine.getCamera())
    const intersects = raycaster.intersectObjects(engine.getPhotos())

    if (intersects.length > 0) {
      const hit = intersects[0].object as THREE.Mesh
      canvas.style.cursor = 'pointer'

      if (lastHoveredMesh !== hit) {
        if (lastHoveredMesh) {
          lastHoveredMesh.scale.setScalar(lastHoveredMesh.userData.layoutScale ?? 1)
        }
        lastHoveredMesh = hit
        hit.scale.setScalar((hit.userData.layoutScale ?? 1) * 1.08)
      }

      hoveredPhoto.value = {
        index: hit.userData.index,
        title: hit.userData.title
      }
      hoveredScreenPos.value = { x: e.clientX, y: e.clientY }
    } else {
      if (lastHoveredMesh) {
        lastHoveredMesh.scale.setScalar(lastHoveredMesh.userData.layoutScale ?? 1)
        lastHoveredMesh = null
      }
      canvas.style.cursor = 'default'
      hoveredPhoto.value = null
    }
  }

  canvasClickHandler = (e) => {
    // 过滤拖拽旋转操作
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y)
    if (dist > 6) return

    if (!engine) return
    const rect = canvas.getBoundingClientRect()
    mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mousePos, engine.getCamera())
    const intersects = raycaster.intersectObjects(engine.getPhotos())

    if (intersects.length > 0) {
      const hit = intersects[0].object as THREE.Mesh
      const idx = hit.userData.index
      
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
function flyToPhotoAndFocus(mesh: THREE.Mesh, onComplete?: () => void) {
  if (!engine) return
  const target = new THREE.Vector3()
  mesh.getWorldPosition(target)
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(mesh.rotation)
  const position = target.clone().add(normal.multiplyScalar(220))
  position.y += 15
  engine.getEventBus().emit('photo:focus', { photo: mesh })
  engine.flyTo(position, target, 1.4, onComplete)
}

/**
 * 应用配置中心下发的相机行为（自动漫游），配置未开启时保持访客手动控制
 */
function applyAutoTour(enabled: boolean) {
  isAutoTour.value = enabled
  engine?.setAutoTour(enabled)
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
}

async function handleUnlock(password: string) {
  const success = await viewer.unlock(password)
  if (!success && viewer.error.value) {
    // handled in state
  }
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  showLightbox.value = true
}

// 照片数量与视图模式共同决定 HUD 装载：
// 2D 视图/无照片时不再渲染 3D 专属控件（自动巡航、陀螺仪、氛围预设）。
const hudState = computed(() => {
  if (!viewer.isReady.value || viewer.photos.value.length === 0) return 'empty' as const
  return viewMode.value === '3d' && !engineReady.value ? 'pending' as const : 'ready' as const
})
const show3dHud = computed(() => viewMode.value === '3d' && hudState.value === 'ready')

// 视角复位：回到默认机位，不打断配置中的自动漫游状态
function resetView() {
  if (!engine) return
  engine.resetView()
}

async function selectPreset(presetName: string) {
  currentPreset.value = presetName
  showPresetMenu.value = false
  if (engine) {
    await engine.loadPreset(presetName)
  }
}
</script>

<template>
  <div class="viewer-app-root">
    <!-- 1. 加载中状态 -->
    <div v-if="viewer.state.value === 'loading'" class="loading-screen">
      <div class="glow-orb"></div>
      <div class="loader-box">
        <div class="loader-spinner"></div>
        <p class="loader-text">Loading immersive spatial gallery...</p>
      </div>
    </div>

    <!-- 2. 密码解锁状态 -->
    <PasswordPrompt
      v-else-if="viewer.needsPassword.value"
      :is-unlocking="viewer.unlocking.value"
      :error="viewer.error.value"
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
        <PhotoWall :photos="viewer.photos.value" fit="cover" @select="openLightbox" />
      </main>
      <LightboxModal
        :show="showLightbox"
        :photos="viewer.photos.value"
        :current-index="lightboxIndex"
        :allow-download="viewer.allowDownload.value"
        @close="closeLightbox"
        @select="idx => lightboxIndex = idx"
      />
    </div>

    <!-- 4. 空相册状态 -->
    <EmptyState
      v-else-if="viewer.isEmpty.value"
      :message="viewer.gallery.value?.title ? `“${viewer.gallery.value.title}” 暂无照片` : undefined"
    />

    <!-- 5. 错误状态 -->
    <ErrorState
      v-else-if="viewer.state.value === 'not_found'"
      title="相册空间未找到"
      :message="viewer.error.value || '抱歉，你访问的画廊空间不存在或已被移除。'"
      @retry="viewer.retry"
    />

    <ErrorState
      v-else-if="viewer.state.value === 'share_required'"
      title="需要专用分享凭证"
      :message="viewer.error.value || '此画廊属于私密空间，请使用带有访问 Token 的有效分享链接进入。'"
      @retry="viewer.retry"
    />

    <ErrorState
      v-else-if="viewer.state.value === 'error'"
      title="空间连接异常"
      :message="viewer.error.value || '加载相册数据时遇到问题，请重试。'"
      @retry="viewer.retry"
    />

    <!-- 5. 就绪：沉浸式双模画廊 -->
    <div v-else-if="viewer.isReady.value" class="gallery-viewport">
      <div v-if="viewMode === '3d' && apmMetrics?.failedTextures" class="webgl-fallback-banner" role="status">
        <span>{{ apmMetrics?.failedTextures }} 张照片的预览暂未载入</span>
        <button type="button" @click="engine?.retryPhotoTextures()">重试照片预览</button>
      </div>
      <div v-if="webglFallbackMessage" class="webgl-fallback-banner" role="status">
        <Icon name="grid" :size="16" />
        <span>{{ webglFallbackMessage }}</span>
        <button type="button" @click="webglFallbackMessage = ''">知道了</button>
      </div>

      <!-- 浮动毛玻璃 HUD 控制台 -->
      <header class="floating-hud">
        <!-- Brand & Gallery Info -->
        <div class="hud-left">
          <div class="brand-pill">
            <span class="brand-dot"></span>
            <span class="brand-title">VIE GALLERY</span>
          </div>
          <div class="gallery-title-chip">
            <span class="chip-title">{{ viewer.gallery.value?.title || 'Moments in Light' }}</span>
            <span class="chip-count">{{ viewer.total.value }} 张照片</span>
          </div>
        </div>

        <!-- Mode Toggle & Controls -->
        <div class="hud-right">
          <!-- 3D / 2D Switcher -->
          <div class="mode-switch-pill">
            <button
              class="mode-btn"
              :class="{ active: viewMode === '3d' }"
              title="3D 空间漫游"
              @click="viewMode = '3d'"
            >
              <Icon name="3d" :size="16" />
              <span>3D 空间</span>
            </button>
            <button
              class="mode-btn"
              :class="{ active: viewMode === '2d' }"
              title="2D 经典画廊"
              @click="viewMode = '2d'"
            >
              <Icon name="grid" :size="16" />
              <span>经典网格</span>
            </button>
          </div>

          <!-- 3D Extra Tools (Preset, Tour, Gyro, APM)：仅在 3D 就绪时挂载，切换 2D 即释放 -->
          <template v-if="show3dHud">
            <!-- Reset View -->
            <button
              class="hud-icon-btn"
              title="视角复位"
              @click="resetView"
            >
              <Icon name="compass" :size="17" />
            </button>

            <!-- Autopilot Tour -->
            <button
              class="hud-icon-btn"
              :class="{ active: isAutoTour }"
              :title="isAutoTour ? '暂停自动巡航' : '开启电影级自动漫游'"
              @click="toggleAutoTour"
            >
              <Icon name="eye" :size="17" />
              <span class="btn-label-desktop">{{ isAutoTour ? '巡航中' : '自动巡航' }}</span>
            </button>

            <!-- Gyroscope Parallax -->
            <button
              class="hud-icon-btn gyro-btn"
              :class="{ active: gyroEnabled }"
              title="陀螺仪重力感应视差"
              @click="toggleGyro"
            >
              <Icon name="globe" :size="17" />
            </button>

            <!-- APM Performance Probe -->
            <button
              v-if="diagnosticsEnabled"
              class="hud-icon-btn"
              :class="{ active: showApm }"
              title="3D 性能指标探针"
              @click="showApm = !showApm"
            >
              <Icon name="cube" :size="16" />
            </button>

            <!-- Preset Switcher -->
            <div class="preset-dropdown-wrap">
              <button
                class="hud-icon-btn preset-btn"
                title="切换视觉特效预设"
                @click="showPresetMenu = !showPresetMenu"
              >
                <Icon name="sparkles" :size="17" />
                <span>氛围特效</span>
              </button>

              <!-- Preset Menu -->
              <div v-if="showPresetMenu" class="preset-popup-menu">
                <div class="menu-header">视觉预设</div>
                <button
                  v-for="p in presets"
                  :key="p.name"
                  class="menu-item"
                  :class="{ active: currentPreset === p.name }"
                  @click="selectPreset(p.name)"
                >
                  <Icon :name="p.icon" :size="14" />
                  <span>{{ p.label }}</span>
                  <Icon v-if="currentPreset === p.name" name="check" :size="14" class="check-icon" />
                </button>
              </div>
            </div>
          </template>

          <!-- Fullscreen Toggle -->
          <button class="hud-icon-btn" :title="isFullscreen ? '退出全屏' : '全屏浏览'" @click="toggleFullscreen">
            <Icon name="maximize" :size="17" />
          </button>

          <!-- Share Button -->
          <button class="hud-icon-btn share-btn" title="分享给朋友" @click="showShareSheet = true">
            <Icon name="share" :size="17" />
            <span>分享</span>
          </button>
        </div>
      </header>

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
        v-if="hoveredPhoto && viewMode === '3d'"
        class="photo-hover-tag"
        :style="{ left: `${hoveredScreenPos.x + 16}px`, top: `${hoveredScreenPos.y + 16}px` }"
      >
        <span class="tag-index">#{{ hoveredPhoto.index + 1 }}</span>
        <span class="tag-title">{{ hoveredPhoto.title }}</span>
      </div>

      <!-- Mode 1: 3D Spatial WebGL Canvas -->
      <div v-show="viewMode === '3d'" class="canvas-container">
        <canvas ref="canvasRef" class="webgl-canvas"></canvas>
        <div class="spatial-tips">
          <p>单击照片聚焦飞入 · 拖动旋转视角 · 滚轮缩放 · 罗盘按钮复位视角</p>
        </div>
        <button
          v-if="viewer.hasMore.value"
          class="load-more-floating"
          type="button"
          :disabled="viewer.loadingMore.value"
          @click="viewer.loadMore"
        >
          {{ viewer.loadingMore.value ? '正在加载…' : '加载更多照片' }}
        </button>
      </div>

      <!-- Mode 2: 2D Editorial Curated Wall -->
      <main v-show="viewMode === '2d'" class="editorial-main">
        <div class="editorial-hero">
          <p class="hero-kicker">CURATED EXHIBITION</p>
          <h1 class="hero-title">{{ viewer.gallery.value?.title || 'Moments in Light' }}</h1>
          <p class="hero-meta">{{ viewer.total.value }} PHOTOGRAPHS · HIGH FIDELITY GALLERY</p>
        </div>

        <PhotoWall :photos="viewer.photos.value" fit="cover" @select="openLightbox" />
        <button
          v-if="viewer.hasMore.value"
          class="load-more-btn"
          type="button"
          :disabled="viewer.loadingMore.value"
          @click="viewer.loadMore"
        >
          {{ viewer.loadingMore.value ? '正在加载…' : '加载更多照片' }}
        </button>
      </main>

      <!-- Lightbox High-Res Viewer Modal -->
      <LightboxModal
        :show="showLightbox"
        :photos="viewer.photos.value"
        :current-index="lightboxIndex"
        :allow-download="viewer.allowDownload.value"
        @close="closeLightbox"
        @select="idx => lightboxIndex = idx"
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

<style scoped>
.viewer-app-root {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  background-color: var(--bg-deep);
  color: var(--text-main);
  overflow-x: hidden;
}

/* ==========================================
   1. Loading Screen
   ========================================== */
.loading-screen {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: #070a0d;
  z-index: 100;
}

.glow-orb {
  position: absolute;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent, #10b981) 20%, transparent) 0%, transparent 70%);
  filter: blur(40px);
}

.loader-box {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loader-spinner {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--accent, #10b981);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent, #10b981) 40%, transparent);
}

.loader-text {
  font-size: 13.5px;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==========================================
   2. Floating HUD Header
   ========================================== */
.floating-hud {
  position: fixed;
  top: 18px;
  left: 20px;
  right: 20px;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  pointer-events: none;
}

.hud-left,
.hud-right {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
}

.brand-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(13, 26, 21, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  box-shadow: var(--shadow-sm);
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #10b981);
  box-shadow: 0 0 10px var(--accent, #10b981);
}

.brand-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #f1f5f3;
}

.gallery-title-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(13, 26, 21, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  box-shadow: var(--shadow-sm);
}

.chip-title {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
}

.chip-count {
  font-size: 11px;
  color: #64748b;
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

/* Mode Switcher Pill */
.mode-switch-pill {
  display: flex;
  align-items: center;
  padding: 4px;
  background: rgba(13, 26, 21, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  box-shadow: var(--shadow-sm);
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 9999px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  color: #f1f5f3;
}

.mode-btn.active {
  background: linear-gradient(135deg, var(--accent, #10b981) 0%, #059669 100%);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent, #10b981) 35%, transparent);
}

/* Icon Buttons */
.hud-icon-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 12px;
  background: rgba(13, 26, 21, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.hud-icon-btn:hover {
  background: rgba(20, 38, 31, 0.9);
  color: #f1f5f3;
  border-color: color-mix(in srgb, var(--accent, #10b981) 30%, transparent);
}

.hud-icon-btn.active {
  background: color-mix(in srgb, var(--accent, #10b981) 20%, transparent);
  color: var(--accent-strong, #34d399);
  border-color: color-mix(in srgb, var(--accent, #10b981) 50%, transparent);
}

/* Preset Dropdown */
.preset-dropdown-wrap {
  position: relative;
}

.preset-popup-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 200px;
  background: rgba(13, 26, 21, 0.94);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  animation: menuFadeIn 0.2s ease;
}

.menu-header {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.08em;
  padding: 6px 10px 4px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
}

.menu-item.active {
  background: color-mix(in srgb, var(--accent, #10b981) 15%, transparent);
  color: var(--accent-strong, #34d399);
  font-weight: 600;
}

.check-icon {
  margin-left: auto;
  color: var(--accent, #10b981);
}

@keyframes menuFadeIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==========================================
   3. APM Performance Dashboard
   ========================================== */
.apm-dashboard {
  position: fixed;
  top: 74px;
  left: 20px;
  z-index: 35;
  padding: 10px 14px;
  background: rgba(6, 13, 10, 0.85);
  backdrop-filter: blur(16px);
  border: 1px solid color-mix(in srgb, var(--accent, #10b981) 25%, transparent);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-family: ui-monospace, monospace;
  font-size: 11px;
}

.apm-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: var(--accent, #10b981);
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #10b981);
  animation: pulse 1.5s infinite;
}

.apm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 12px;
}

.apm-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.apm-label {
  color: #64748b;
}

.apm-val {
  color: #e2e8f0;
  font-weight: 600;
}

.apm-val.fps-warn {
  color: #f59e0b;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

/* ==========================================
   4. Photo Hover Floating Tag
   ========================================== */
.photo-hover-tag {
  position: fixed;
  z-index: 35;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(10, 20, 16, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--accent, #10b981) 40%, transparent);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: fadeIn 0.15s ease;
}

.tag-index {
  color: var(--accent, #10b981);
  font-weight: 700;
  font-size: 11px;
}

.tag-title {
  color: #f1f5f3;
  font-size: 12px;
  font-weight: 500;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.webgl-fallback-banner {
  position: fixed;
  top: 78px;
  left: 50%;
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(620px, calc(100vw - 32px));
  padding: 10px 12px 10px 14px;
  color: #d1fae5;
  background: rgba(8, 31, 24, 0.92);
  border: 1px solid rgba(52, 211, 153, 0.34);
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
  transform: translateX(-50%);
  backdrop-filter: blur(16px);
  font-size: 12px;
}

.webgl-fallback-banner button {
  flex: 0 0 auto;
  margin-left: 4px;
  padding: 4px 8px;
  color: #a7f3d0;
  background: transparent;
  border: 1px solid rgba(167, 243, 208, 0.35);
  border-radius: 7px;
  cursor: pointer;
  font-size: 11px;
}

.webgl-fallback-banner button:hover,
.webgl-fallback-banner button:focus-visible {
  color: #ffffff;
  background: color-mix(in srgb, var(--accent, #10b981) 20%, transparent);
  outline: none;
}

.embed-preview {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #0b1220;
}

.embed-preview .canvas-container {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

.embed-preview .webgl-canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.embed-fallback-viewport {
  overflow-y: auto;
}

.embed-fallback-main {
  min-height: 100%;
  padding-top: 100px;
}

/* ==========================================
   5. 3D WebGL Canvas Viewport
   ========================================== */
.canvas-container {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 10;
}

.webgl-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.spatial-tips {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
  background: rgba(13, 26, 21, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  font-size: 12px;
  color: #94a3b8;
  pointer-events: none;
  letter-spacing: 0.03em;
}

.load-more-floating {
  position: absolute;
  right: 50%;
  bottom: 76px;
  z-index: 2;
  padding: 9px 16px;
  border: 1px solid color-mix(in srgb, var(--accent, #10b981) 35%, transparent);
  border-radius: 10px;
  color: #a7f3d0;
  background: rgba(10, 20, 16, 0.82);
  transform: translateX(50%);
  backdrop-filter: blur(12px);
  font-size: 12px;
}

.load-more-floating:hover:not(:disabled),
.load-more-floating:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--accent, #10b981) 20%, transparent);
}

.load-more-floating:disabled {
  cursor: wait;
  opacity: 0.65;
}

/* ==========================================
   6. 2D Editorial Curated Viewport
   ========================================== */
.editorial-main {
  position: relative;
  z-index: 20;
  max-width: 1320px;
  margin: 0 auto;
  padding: 110px 24px 80px;
}

.editorial-hero {
  text-align: center;
  margin-bottom: 56px;
}

.hero-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--accent, #10b981);
  margin-bottom: 12px;
}

.hero-title {
  font-size: 38px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}

.hero-meta {
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.1em;
}

.load-more-btn {
  display: block;
  margin: 28px auto 0;
  padding: 10px 20px;
  border: 1px solid color-mix(in srgb, var(--accent, #10b981) 34%, transparent);
  border-radius: 10px;
  color: #a7f3d0;
  background: color-mix(in srgb, var(--accent, #10b981) 10%, transparent);
  font-size: 13px;
}

.load-more-btn:hover:not(:disabled),
.load-more-btn:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--accent, #10b981) 20%, transparent);
}

.load-more-btn:disabled {
  cursor: wait;
  opacity: 0.65;
}

/* 照片墙卡片样式见 PhotoWall.vue（2D 经典画廊与嵌入回退共用） */

/* ==========================================
   7. Mobile Adaptations (Phase 3)
   ========================================== */
@media (max-width: 768px) {
  .floating-hud {
    top: 12px;
    left: 12px;
    right: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .gallery-title-chip {
    display: none;
  }

  .btn-label-desktop {
    display: none;
  }

  .spatial-tips {
    bottom: 16px;
    width: 90%;
    text-align: center;
    font-size: 11px;
    padding: 6px 12px;
  }

  .hero-title {
    font-size: 28px;
  }

  .apm-dashboard {
    top: auto;
    bottom: 60px;
    left: 12px;
  }
}
</style>
