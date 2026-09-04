<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { useViewerState } from './composables/useViewerState'
import { ViewerEngine } from './core/ViewerEngine'
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
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  destroy3DEngine()
})

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
    // 如果没有照片，且处于非准备状态，则不初始化
    if (!rawPhotos || rawPhotos.length === 0) {
      if (slug === 'demo') {
        // demo 模式 fallback 占位
      } else {
        return
      }
    }

    engine = new ViewerEngine(canvasRef.value)

    // 创建 3D Photo Mesh 列表（严格只使用真实空间中上传的照片）
    const textureLoader = new THREE.TextureLoader()
    const meshes: any[] = []

    // 若真实照片存在，完全按真实照片数组生成
    const photoList = rawPhotos.length > 0 ? rawPhotos : (slug === 'demo' ? createDemoFallbackPhotos() : [])

    photoList.forEach((p, i) => {
      // 保持照片宽高比计算
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
  } catch (err) {
    console.error('Failed to init 3D engine:', err)
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

          <!-- Preset Switcher (Only for 3D mode) -->
          <div v-if="viewMode === '3d'" class="preset-dropdown-wrap">
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

      <!-- Mode 1: 3D Spatial WebGL Canvas -->
      <div v-show="viewMode === '3d'" class="canvas-container">
        <canvas ref="canvasRef" class="webgl-canvas"></canvas>
        <div class="spatial-tips">
          <p>按住鼠标左键旋转视角 · 滚轮缩放景深</p>
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
  top: 20px;
  left: 24px;
  right: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1000;
  pointer-events: none;
}

.hud-left,
.hud-right {
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: auto;
}

.brand-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(18, 25, 30, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 10px #10b981;
}

.brand-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #ffffff;
}

.gallery-title-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(18, 25, 30, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  font-size: 13px;
}

.chip-title {
  font-weight: 600;
  color: #f1f5f9;
}

.chip-count {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
}

/* Mode Switch */
.mode-switch-pill {
  display: flex;
  background: rgba(18, 25, 30, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 3px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  color: #94a3b8;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  color: #ffffff;
}

.mode-btn.active {
  background: #10b981;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

/* HUD Buttons */
.hud-icon-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(18, 25, 30, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  color: #f1f5f9;
  font-size: 12.5px;
  font-weight: 500;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
}

.hud-icon-btn:hover {
  background: rgba(30, 41, 50, 0.95);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.share-btn.copied {
  background: #059669;
  color: #ffffff;
}

/* Preset Popup Menu */
.preset-dropdown-wrap {
  position: relative;
}

.preset-popup-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 200px;
  background: rgba(18, 25, 30, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 6px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-header {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  padding: 6px 10px 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12.5px;
  color: #cbd5e1;
  text-align: left;
  transition: all 0.15s ease;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.menu-item.active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  font-weight: 600;
}

.check-icon {
  margin-left: auto;
}

/* ==========================================
   3. 3D WebGL Canvas Mode
   ========================================== */
.canvas-container {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000000;
}

.webgl-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.spatial-tips {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(18, 25, 30, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 18px;
  border-radius: 9999px;
  font-size: 12px;
  color: #94a3b8;
  pointer-events: none;
  z-index: 100;
}

/* ==========================================
   4. 2D Editorial Curated Wall Mode
   ========================================== */
.editorial-main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 120px 40px 80px;
}

.editorial-hero {
  text-align: center;
  margin-bottom: 60px;
}

.hero-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: #34d399;
  margin-bottom: 12px;
}

.hero-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: clamp(38px, 6vw, 68px);
  font-weight: 600;
  color: #ffffff;
  letter-spacing: -0.01em;
  margin-bottom: 14px;
  line-height: 1.15;
}

.hero-meta {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: #64748b;
}

.editorial-photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.editorial-photo-card {
  position: relative;
  background: #111820;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.editorial-photo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
}

.photo-img-frame {
  position: relative;
  aspect-ratio: 4/3;
  overflow: hidden;
  background: #0f172a;
}

.photo-img-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.editorial-photo-card:hover .photo-img-frame img {
  transform: scale(1.05);
}

.card-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 50%);
  display: flex;
  align-items: flex-end;
  padding: 16px;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.editorial-photo-card:hover .card-overlay {
  opacity: 1;
}

.photo-caption {
  font-size: 13.5px;
  font-weight: 500;
  color: #f8fafc;
}

@media (max-width: 800px) {
  .floating-hud {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    top: 12px;
    left: 12px;
    right: 12px;
  }

  .gallery-title-chip,
  .brand-title {
    display: none;
  }

  .editorial-main {
    padding: 140px 16px 40px;
  }

  .editorial-photo-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
