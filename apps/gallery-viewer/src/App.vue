<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { useViewerState } from './composables/useViewerState'
import { ViewerEngine, type EngineMetrics } from './core/ViewerEngine'
import PasswordPrompt from './components/PasswordPrompt.vue'
import EmptyState from './components/EmptyState.vue'
import ErrorState from './components/ErrorState.vue'
import LightboxModal from './components/LightboxModal.vue'
import Icon from './components/Icon.vue'

// 从 URL 获取 slug
const slug = location.pathname.split('/').filter(Boolean).pop() || 'demo'

// 状态机
const viewer = useViewerState(slug)

// 视图模式: '3d' 空间漫游 vs '2d' 策展画廊
const viewMode = ref<'3d' | '2d'>('3d')

// WebGL Engine
const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: ViewerEngine | null = null

// Lightbox
const showLightbox = ref(false)
const lightboxIndex = ref(0)

// HUD Controls
const showPresetMenu = ref(false)
const currentPreset = ref('starry-night')
const copied = ref(false)
const isFullscreen = ref(false)

// 电影级巡航与交互增强
const isAutoTour = ref(false)
const hoveredPhoto = ref<{ index: number; title: string } | null>(null)
const hoveredScreenPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const showApm = ref(false)
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
  { name: 'minimal', label: '极简空间 · Minimal', icon: 'cube' }
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

function handlePostMessage(event: MessageEvent) {
  if (!event.data || typeof event.data !== 'object') return
  const { type, mode, config, presetName } = event.data

  if (type === 'VIE_LAYOUT_CHANGE' && mode && engine) {
    engine.getEventBus().emit('layout:change', mode)
  } else if (type === 'VIE_PRESET_CHANGE' && presetName) {
    selectPreset(presetName)
  } else if (type === 'VIE_CONFIG_UPDATE' && config && engine) {
    engine.applyConfig(config)
  }
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

// 监听照片数据加载或视图模式切换后初始化 3D 引擎
watch(
  () => [viewer.isReady.value, viewer.photos.value, viewMode.value],
  async ([isReady, photos, mode]) => {
    if (isReady && mode === '3d') {
      await nextTick()
      init3DEngine()
    } else if (mode === '2d') {
      destroy3DEngine()
    }
  },
  { deep: true }
)

async function init3DEngine() {
  if (!canvasRef.value) return
  destroy3DEngine()

  try {
    const rawPhotos = viewer.photos.value
    if (!rawPhotos || rawPhotos.length === 0) {
      if (slug !== 'demo') return
    }

    engine = new ViewerEngine(canvasRef.value)

    // 创建 3D Photo Mesh 列表（严格只使用真实空间中上传的照片）
    const textureLoader = new THREE.TextureLoader()
    const meshes: any[] = []

    const photoList = rawPhotos.length > 0 ? rawPhotos : (slug === 'demo' ? createDemoFallbackPhotos() : [])

    photoList.forEach((p, i) => {
      const w = 80
      const aspectRatio = (p.width && p.height) ? (p.width / p.height) : (4 / 3)
      const h = Math.round(w / aspectRatio)
      const geometry = new THREE.PlaneGeometry(w, h)
      let material: THREE.Material

      if (p.thumbnailUrl) {
        const texture = textureLoader.load(p.thumbnailUrl)
        texture.colorSpace = THREE.SRGBColorSpace
        material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide
        })
      } else {
        material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL((i * 0.15) % 1, 0.6, 0.5),
          side: THREE.DoubleSide
        })
      }

      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData = {
        index: i,
        title: p.title || `Photo ${i + 1}`,
        thumbnailUrl: p.thumbnailUrl,
        width: p.width,
        height: p.height
      }
      meshes.push(mesh)
    })

    engine.setPhotos(meshes)
    await engine.init(slug)
    engine.start()

    // 监听 APM 探针
    engine.getEventBus().on('metrics:update', (metrics: EngineMetrics) => {
      apmMetrics.value = metrics
    })

    // 绑定 3D 悬停与交互
    bindCanvasInteractions()
  } catch (err) {
    console.error('Failed to init 3D engine:', err)
  }
}

function bindCanvasInteractions() {
  const canvas = canvasRef.value
  if (!canvas) return

  let pointerDownPos = { x: 0, y: 0 }

  canvas.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY }
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!engine) return
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
          lastHoveredMesh.scale.set(1, 1, 1)
        }
        lastHoveredMesh = hit
        hit.scale.set(1.08, 1.08, 1.08)
      }

      hoveredPhoto.value = {
        index: hit.userData.index,
        title: hit.userData.title
      }
      hoveredScreenPos.value = { x: e.clientX, y: e.clientY }
    } else {
      if (lastHoveredMesh) {
        lastHoveredMesh.scale.set(1, 1, 1)
        lastHoveredMesh = null
      }
      canvas.style.cursor = 'default'
      hoveredPhoto.value = null
    }
  })

  canvas.addEventListener('click', (e) => {
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
      flyToPhotoAndFocus(hit, () => {
        openLightbox(idx)
      })
    }
  })
}

/**
 * 电影级相机平滑飞行聚焦 (Cinematic Smooth Flight)
 */
function flyToPhotoAndFocus(mesh: THREE.Mesh, onComplete?: () => void) {
  if (!engine) return
  engine.notifyTransitionStart()

  const camera = engine.getCamera()
  const controls = engine.getControls()
  if (!controls) return

  const targetWorldPos = new THREE.Vector3()
  mesh.getWorldPosition(targetWorldPos)

  const normal = new THREE.Vector3(0, 0, 1).applyEuler(mesh.rotation)
  const targetCamPos = targetWorldPos.clone().add(normal.multiplyScalar(220))

  const startCamPos = camera.position.clone()
  const startTarget = controls.target.clone()

  let startTime = performance.now()
  const duration = 1200 // 1.2s 电影级俯冲曲线

  function step(now: number) {
    const elapsed = now - startTime
    const t = Math.min(1, elapsed / duration)
    // easeInOutCubic
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    camera.position.lerpVectors(startCamPos, targetCamPos, ease)
    controls.target.lerpVectors(startTarget, targetWorldPos, ease)
    controls.update()

    if (t < 1) {
      requestAnimationFrame(step)
    } else {
      engine?.notifyTransitionEnd()
      if (onComplete) onComplete()
    }
  }

  requestAnimationFrame(step)
}

/**
 * 切换无人机自动漫游巡航
 */
function toggleAutoTour() {
  isAutoTour.value = !isAutoTour.value
  if (engine && engine.getControls()) {
    const controls = engine.getControls()!
    controls.autoRotate = isAutoTour.value
    controls.autoRotateSpeed = 1.2
    if (isAutoTour.value) {
      engine.wakeUp(3600000) // 保持活跃
    }
  }
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
  if (engine) {
    engine.stop()
    engine.dispose()
    engine = null
  }
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

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch (e) {
    console.error('Copy failed', e)
  }
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
      @unlock="handleUnlock"
    />

    <!-- 3. 空相册状态 -->
    <EmptyState
      v-else-if="viewer.isEmpty.value"
      :message="viewer.gallery.value?.title ? `“${viewer.gallery.value.title}” 暂无照片` : undefined"
    />

    <!-- 4. 错误状态 -->
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
            <span class="chip-count">{{ viewer.photos.value.length }} 张照片</span>
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

          <!-- 3D Extra Tools (Preset, Tour, Gyro, APM) -->
          <template v-if="viewMode === '3d'">
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
          <button class="hud-icon-btn share-btn" :class="{ copied }" title="复制分享链接" @click="copyShareLink">
            <Icon :name="copied ? 'check' : 'share'" :size="17" />
            <span>{{ copied ? '已复制' : '分享' }}</span>
          </button>
        </div>
      </header>

      <!-- APM Real-time Dashboard Capsule -->
      <aside v-if="showApm && viewMode === '3d' && apmMetrics" class="apm-dashboard">
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
          <p>单击照片聚焦飞入 · 按住左键旋转视角 · 滚轮缩放星云</p>
        </div>
      </div>

      <!-- Mode 2: 2D Editorial Curated Wall -->
      <main v-show="viewMode === '2d'" class="editorial-main">
        <div class="editorial-hero">
          <p class="hero-kicker">CURATED EXHIBITION</p>
          <h1 class="hero-title">{{ viewer.gallery.value?.title || 'Moments in Light' }}</h1>
          <p class="hero-meta">{{ viewer.photos.value.length }} PHOTOGRAPHS · HIGH FIDELITY GALLERY</p>
        </div>

        <section class="editorial-photo-grid" aria-label="照片墙">
          <article
            v-for="(photo, idx) in viewer.photos.value"
            :key="photo.sortOrder ?? idx"
            class="editorial-photo-card"
            @click="openLightbox(idx)"
          >
            <div class="photo-img-frame">
              <img :src="photo.thumbnailUrl" :alt="photo.title || 'Photograph'" loading="lazy" />
              <div class="card-overlay">
                <span class="photo-caption">{{ photo.title || `Photograph ${idx + 1}` }}</span>
              </div>
            </div>
          </article>
        </section>
      </main>

      <!-- Lightbox High-Res Viewer Modal -->
      <LightboxModal
        :show="showLightbox"
        :photos="viewer.photos.value"
        :current-index="lightboxIndex"
        @close="showLightbox = false"
        @select="idx => lightboxIndex = idx"
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
  background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%);
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
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.4);
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
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
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
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
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
  border-color: rgba(16, 185, 129, 0.3);
}

.hud-icon-btn.active {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.5);
}

.share-btn.copied {
  background: #10b981;
  color: #ffffff;
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
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  font-weight: 600;
}

.check-icon {
  margin-left: auto;
  color: #10b981;
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
  border: 1px solid rgba(16, 185, 129, 0.25);
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
  color: #10b981;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
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
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: fadeIn 0.15s ease;
}

.tag-index {
  color: #10b981;
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
  color: #10b981;
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

.editorial-photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.editorial-photo-card {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  background: #0f1c16;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.editorial-photo-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
  border-color: rgba(16, 185, 129, 0.3);
}

.photo-img-frame {
  position: relative;
  aspect-ratio: 4 / 3;
  width: 100%;
  overflow: hidden;
}

.photo-img-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.editorial-photo-card:hover .photo-img-frame img {
  transform: scale(1.05);
}

.card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, transparent 60%);
  display: flex;
  align-items: flex-end;
  padding: 14px;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.editorial-photo-card:hover .card-overlay {
  opacity: 1;
}

.photo-caption {
  font-size: 13px;
  font-weight: 500;
  color: #f1f5f3;
}

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