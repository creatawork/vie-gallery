<script setup lang="ts">
import { ref, onMounted, reactive, computed, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import PresetSelector from '../components/PresetSelector.vue'
import LayoutSettings from '../components/LayoutSettings.vue'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const galleryId = route.params.id as string

const loading = ref(true)
const saving = ref(false)
const galleryInfo = ref<any>(null)
const showResetConfirm = ref(false)
const resetting = ref(false)
const previewKey = ref(0)
const previewIframeRef = ref<HTMLIFrameElement | null>(null)

/**
 * 获取纯净的配置对象（深度剥离所有 Vue reactive proxy）
 * toRaw() 只能解除最外层代理，嵌套对象依然是 proxy，会导致 JSON.stringify 死循环
 * 这里手动构造纯粹的 POJO，彻底避免响应式追踪
 */
function getCleanConfig() {
  return {
    presetName: config.presetName || 'custom',
    layout: {
      mode: config.layout?.mode || 'sphere'
    },
    background: {
      type: config.background?.type || 'sky',
      gradient: config.background?.gradient ? {
        colors: [...(config.background.gradient.colors || ['#0f172a', '#1e293b'])],
        direction: config.background.gradient.direction || 'vertical'
      } : { colors: ['#0f172a', '#1e293b'], direction: 'vertical' },
      sky: config.background?.sky ? {
        theme: config.background.sky.theme || 'starry',
        timeOfDay: config.background.sky.timeOfDay || 'night'
      } : { theme: 'starry', timeOfDay: 'night' }
    },
    particles: {
      enabled: !!config.particles?.enabled,
      types: Array.isArray(config.particles?.types) ? [...config.particles.types] : ['stars'],
      density: config.particles?.density ?? 1.0
    },
    effects: {
      bloom: {
        enabled: !!config.effects?.bloom?.enabled,
        strength: config.effects?.bloom?.strength ?? 0.75,
        radius: config.effects?.bloom?.radius ?? 0.5,
        threshold: config.effects?.bloom?.threshold ?? 0.18
      },
      fog: {
        enabled: !!config.effects?.fog?.enabled,
        color: config.effects?.fog?.color || '#0f172a',
        density: config.effects?.fog?.density ?? 0.0008
      }
    },
    interaction: {
      clickRipple: config.interaction?.clickRipple ?? true
    },
    audio: {
      bgm: { enabled: !!config.audio?.bgm?.enabled },
      sfx: { enabled: config.audio?.sfx?.enabled ?? true }
    },
    theme: {
      engine: config.theme?.engine || 'custom'
    }
  }
}

function sendLiveMessage(msg: any) {
  if (previewIframeRef.value && previewIframeRef.value.contentWindow) {
    try {
      // 直接 postMessage，浏览器的结构化克隆会自动处理
      previewIframeRef.value.contentWindow.postMessage(msg, '*')
    } catch (err) {
      console.warn('postMessage failed:', err)
    }
  }
}

function handleLayoutChange(mode: string) {
  config.layout.mode = mode
  sendLiveMessage({ type: 'VIE_LAYOUT_CHANGE', mode })
}

function refreshLivePreview() {
  // 使用纯净的配置对象，避免传递 reactive proxy
  const cleanConfig = getCleanConfig()
  sendLiveMessage({ type: 'VIE_CONFIG_UPDATE', config: cleanConfig })
}

function forceReloadPreview() {
  previewKey.value++
}
const config = reactive({
  presetName: 'starry-night' as string | null,
  layout: {
    mode: 'sphere'
  },
  background: {
    type: 'sky',
    gradient: {
      colors: ['#0f172a', '#1e293b'],
      direction: 'vertical'
    },
    sky: {
      theme: 'starry',
      timeOfDay: 'night'
    }
  },
  particles: {
    enabled: true,
    types: ['stars'] as string[],
    density: 1.0
  },
  effects: {
    bloom: {
      enabled: true,
      strength: 0.75,
      radius: 0.5,
      threshold: 0.18
    },
    fog: {
      enabled: false,
      color: '#0f172a',
      density: 0.0008
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
    engine: 'custom'
  }
})

const previewUrl = computed(() => {
  const slug = galleryInfo.value?.slug || 'demo'
  const base = `${window.location.protocol}//${window.location.hostname}:5174`
  return `${base}/g/${slug}?t=${previewKey.value}&preset=${config.presetName || 'starry-night'}&layout=${config.layout.mode}`
})

function deepMerge(target: any, source: any) {
  if (!source) return target
  for (const key of Object.keys(source)) {
    const val = source[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {}
      }
      deepMerge(target[key], val)
    } else if (Array.isArray(val)) {
      target[key] = [...val]
    } else if (val !== undefined) {
      target[key] = val
    }
  }
  return target
}

function ensureConfigDefaults() {
  if (!config.background) config.background = { type: 'sky' } as any
  if (!config.background.sky) config.background.sky = { theme: 'starry', timeOfDay: 'night' }
  if (!config.background.gradient) config.background.gradient = { colors: ['#0f172a', '#1e293b'], direction: 'vertical' }
  if (!config.particles) config.particles = { enabled: true, types: ['stars'], density: 1.0 }
  if (!Array.isArray(config.particles.types)) config.particles.types = ['stars']
  if (!config.effects) config.effects = {} as any
  if (!config.effects.bloom) config.effects.bloom = { enabled: true, strength: 0.75, radius: 0.5, threshold: 0.18 }
  if (!config.effects.fog) config.effects.fog = { enabled: false, color: '#0f172a', density: 0.0008 }
  if (!config.layout) config.layout = { mode: 'sphere' }
}

function onBackgroundTypeChange() {
  ensureConfigDefaults()
  refreshLivePreview()
}

async function loadGalleryAndConfig() {
  loading.value = true
  try {
    // 1. 获取相册基础信息
    const gallRes = await apiFetch('/api/galleries')
    if (gallRes.ok) {
      const list = await gallRes.json()
      galleryInfo.value = list.find((g: any) => g.id === galleryId) || null
    }

    // 2. 获取相册 3D 配置
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`)
    if (response.ok) {
      const data = await response.json()
      if (data && data.configJson) {
        const parsed = JSON.parse(data.configJson)
        deepMerge(config, parsed)
        if (data.presetName) config.presetName = data.presetName
      }
    }
    ensureConfigDefaults()
  } catch (err: any) {
    toast.error('加载相册配置失败')
  } finally {
    loading.value = false
  }
}

async function applyPreset(presetName: string) {
  config.presetName = presetName
  ensureConfigDefaults()

  if (presetName === 'minimal') {
    config.layout.mode = 'sphere'
    config.background.type = 'gradient'
    config.background.gradient = { colors: ['#f8fafc', '#e2e8f0'], direction: 'vertical' }
    config.particles.enabled = false
    config.particles.types = []
    config.effects.bloom.enabled = false
    config.effects.fog.enabled = false
  } else if (presetName === 'forest-dream') {
    config.layout.mode = 'helix'
    config.background.type = 'sky'
    config.background.sky.theme = 'forest'
    config.particles.enabled = true
    config.particles.types = ['sakura', 'stars']
    config.effects.bloom.enabled = true
    config.effects.bloom.strength = 0.65
    config.effects.fog.enabled = true
    config.effects.fog.color = '#163124'
    config.effects.fog.density = 0.0006
  } else if (presetName === 'starry-night') {
    config.layout.mode = 'sphere'
    config.background.type = 'sky'
    config.background.sky.theme = 'starry'
    config.particles.enabled = true
    config.particles.types = ['stars']
    config.effects.bloom.enabled = true
    config.effects.bloom.strength = 0.8
    config.effects.fog.enabled = false
  } else if (presetName === 'ocean-breeze') {
    config.layout.mode = 'spiral'
    config.background.type = 'sky'
    config.background.sky.theme = 'ocean'
    config.particles.enabled = false
    config.particles.types = []
    config.effects.bloom.enabled = false
    config.effects.fog.enabled = true
    config.effects.fog.color = '#0c4a6e'
    config.effects.fog.density = 0.0008
  } else if (presetName === 'sunset-glow') {
    config.layout.mode = 'grid'
    config.background.type = 'sky'
    config.background.sky.theme = 'sunset'
    config.particles.enabled = true
    config.particles.types = ['sakura']
    config.effects.bloom.enabled = true
    config.effects.bloom.strength = 0.85
    config.effects.fog.enabled = true
    config.effects.fog.color = '#7c2d12'
    config.effects.fog.density = 0.0005
  } else if (presetName === 'romantic') {
    config.layout.mode = 'spiral'
    config.background.type = 'gradient'
    config.background.gradient = { colors: ['#4a0e2e', '#831843'], direction: 'radial' }
    config.particles.enabled = true
    config.particles.types = ['hearts']
    config.effects.bloom.enabled = true
    config.effects.bloom.strength = 0.7
    config.effects.fog.enabled = false
  }

  refreshLivePreview()
  toast.success(`已切换至 “${presetName}” 氛围预设`)
}

function toggleParticleType(type: string) {
  const index = config.particles.types.indexOf(type)
  if (index > -1) {
    config.particles.types.splice(index, 1)
  } else {
    config.particles.types.push(type)
  }
  refreshLivePreview()
}

async function save() {
  saving.value = true
  try {
    ensureConfigDefaults()
    // 使用纯净的配置对象，避免序列化 reactive proxy 导致死循环
    const cleanConfig = getCleanConfig()
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        configJson: JSON.stringify(cleanConfig),
        presetName: cleanConfig.presetName
      })
    })

    if (!response.ok) {
      let msg = `保存失败 (${response.status})`
      try {
        const data = await response.json()
        if (data && (data.message || data.code)) {
          msg = data.message || data.code
        }
      } catch (_) {}
      throw new Error(msg)
    }

    toast.success('3D 视觉配置已成功持久化并同步！')
    refreshLivePreview()
  } catch (err: any) {
    toast.error(err.message || '保存失败，请检查网络或登录状态')
  } finally {
    saving.value = false
  }
}

async function confirmReset() {
  resetting.value = true
  try {
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'DELETE'
    })

    if (response.ok) {
      await loadGalleryAndConfig()
      toast.success('已恢复默认配置')
      showResetConfirm.value = false
      refreshLivePreview()
    }
  } catch (err) {
    toast.error('重置操作失败')
  } finally {
    resetting.value = false
  }
}

function openLivePreview() {
  const slug = galleryInfo.value?.slug || 'demo'
  const baseViewer = `${window.location.protocol}//${window.location.hostname}:5174`
  window.open(`${baseViewer}/g/${slug}`, '_blank')
}

function goBack() {
  router.push('/')
}

onMounted(() => {
  loadGalleryAndConfig()
})
</script>

<template>
  <div class="config-view-root">
    <!-- Top Navigation Header -->
    <header class="config-top-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <Icon name="arrow-left" :size="16" />
          <span>返回空间</span>
        </button>
        <div class="title-meta">
          <h1>{{ galleryInfo?.name || '相册' }} · 3D 视觉工作室</h1>
          <p>实时三维参数调优 · 空间几何排布 · 天穹大气 · 动态物理粒子与 Bloom 电影级泛光</p>
        </div>
      </div>

      <div class="header-right">
        <button class="btn btn-secondary" title="新标签页打开画廊" @click="openLivePreview">
          <Icon name="external" :size="16" />
          <span>独立窗口预览</span>
        </button>
        <button class="btn btn-ghost" @click="showResetConfirm = true">
          <Icon name="refresh" :size="16" />
          <span>重置默认</span>
        </button>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <Icon v-if="saving" name="refresh" :size="16" class="spin" />
          <Icon v-else name="check" :size="16" />
          <span>{{ saving ? '保存中…' : '保存发布配置' }}</span>
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>正在载入相册 3D 视觉配置参数...</p>
    </div>

    <!-- Main Config Studio Layout -->
    <div v-else class="studio-container">
      <!-- Left Column: Controls & Settings -->
      <div class="controls-column">
        <!-- Section 1: Presets -->
        <section class="config-card">
          <div class="card-header">
            <div class="card-icon-box">
              <Icon name="sparkles" :size="18" />
            </div>
            <div>
              <h3>一键氛围预设</h3>
              <p>精选大师级 3D 视觉主题，点击立即预览</p>
            </div>
          </div>
          <PresetSelector
            :current-preset="config.presetName"
            @select="applyPreset"
          />
        </section>

        <!-- Section 2: 3D Layout Geometry -->
        <section class="config-card">
          <div class="card-header">
            <div class="card-icon-box">
              <Icon name="cube" :size="18" />
            </div>
            <div>
              <h3>三维几何排布模型</h3>
              <p>照片在 3D 空间的数学拓扑形态</p>
            </div>
          </div>
          <LayoutSettings
            v-model:mode="config.layout.mode"
            @update:mode="handleLayoutChange"
          />
        </section>

        <!-- Section 3: Background & SkyDome -->
        <section class="config-card">
          <div class="card-header">
            <div class="card-icon-box">
              <Icon name="globe" :size="18" />
            </div>
            <div>
              <h3>空间背景与天穹</h3>
              <p>全景天空穹顶 (SkyDome) 与艺术渐变背景</p>
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">背景模式</label>
              <select v-model="config.background.type" class="select-input" @change="onBackgroundTypeChange">
                <option value="sky">沉浸式天空穹顶 (SkyDome)</option>
                <option value="gradient">艺术渐变 (Gradient)</option>
                <option value="none">极简纯黑 (Pure Dark)</option>
              </select>
            </div>

            <div v-if="config.background.type === 'sky' && config.background.sky" class="form-group">
              <label class="form-label">天空盒主题</label>
              <select v-model="config.background.sky.theme" class="select-input" @change="refreshLivePreview">
                <option value="starry">星空银河 (Starry Night)</option>
                <option value="forest">暮色森林 (Forest)</option>
                <option value="ocean">蔚蓝深海 (Ocean Breeze)</option>
                <option value="sunset">落日晚霞 (Sunset Glow)</option>
              </select>
            </div>

            <div v-if="config.background.type === 'gradient' && config.background.gradient" class="form-group">
              <label class="form-label">渐变方向</label>
              <select v-model="config.background.gradient.direction" class="select-input" @change="refreshLivePreview">
                <option value="vertical">垂直线性 (Vertical)</option>
                <option value="horizontal">水平线性 (Horizontal)</option>
                <option value="radial">径向环形 (Radial)</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Section 4: Particle Systems -->
        <section class="config-card">
          <div class="card-header">
            <div class="card-icon-box">
              <Icon name="sparkles" :size="18" />
            </div>
            <div>
              <h3>动态物理粒子系统</h3>
              <p>漫游在空间中的流体微粒与光斑效果</p>
            </div>
          </div>

          <div class="toggle-row">
            <label class="switch-container">
              <input type="checkbox" v-model="config.particles.enabled" class="switch-input" @change="refreshLivePreview" />
              <span class="switch-slider"></span>
            </label>
            <div class="toggle-label-text">
              <span class="toggle-title">启用 3D 粒子流</span>
              <span class="toggle-desc">开启实时物理运动粒子效果</span>
            </div>
          </div>

          <div v-if="config.particles.enabled" class="particle-types-grid">
            <div
              class="particle-chip"
              :class="{ active: config.particles.types.includes('stars') }"
              @click="toggleParticleType('stars')"
            >
              <Icon name="star" :size="16" />
              <span>璀璨星尘 (Stars)</span>
            </div>
            <div
              class="particle-chip"
              :class="{ active: config.particles.types.includes('sakura') }"
              @click="toggleParticleType('sakura')"
            >
              <Icon name="sparkles" :size="16" />
              <span>飘落樱花 (Sakura)</span>
            </div>
            <div
              class="particle-chip"
              :class="{ active: config.particles.types.includes('hearts') }"
              @click="toggleParticleType('hearts')"
            >
              <Icon name="star" :size="16" />
              <span>心动爱心 (Hearts)</span>
            </div>
            <div
              class="particle-chip"
              :class="{ active: config.particles.types.includes('snow') }"
              @click="toggleParticleType('snow')"
            >
              <Icon name="sparkles" :size="16" />
              <span>静谧雪花 (Snow)</span>
            </div>
          </div>
        </section>

        <!-- Section 5: Postprocessing Bloom & Fog -->
        <section class="config-card">
          <div class="card-header">
            <div class="card-icon-box">
              <Icon name="sliders" :size="18" />
            </div>
            <div>
              <h3>电影级后处理滤镜 (Post-processing)</h3>
              <p>高光溢出辉光 (Unreal Bloom) 与大气景深雾效 (Fog)</p>
            </div>
          </div>

          <div class="effects-grid">
            <div class="effect-box">
              <div class="toggle-row">
                <label class="switch-container">
                  <input type="checkbox" v-model="config.effects.bloom.enabled" class="switch-input" @change="refreshLivePreview" />
                  <span class="switch-slider"></span>
                </label>
                <div class="toggle-label-text">
                  <span class="toggle-title">高光溢出辉光 (Bloom)</span>
                  <span class="toggle-desc">明亮高光散射柔和晕光</span>
                </div>
              </div>

              <div v-if="config.effects.bloom.enabled" class="slider-group">
                <div class="slider-row">
                  <span class="slider-label">辉光强度 (Strength): {{ config.effects.bloom.strength }}</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.8"
                    step="0.05"
                    v-model.number="config.effects.bloom.strength"
                    class="range-slider"
                    @input="refreshLivePreview"
                  />
                </div>
              </div>
            </div>

            <div class="effect-box">
              <div class="toggle-row">
                <label class="switch-container">
                  <input type="checkbox" v-model="config.effects.fog.enabled" class="switch-input" @change="refreshLivePreview" />
                  <span class="switch-slider"></span>
                </label>
                <div class="toggle-label-text">
                  <span class="toggle-title">空间大气雾效 (Atmospheric Fog)</span>
                  <span class="toggle-desc">营造深邃远近透视感</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Right Column: Live Interactive 3D Preview Frame -->
      <aside class="preview-column">
        <div class="preview-sticky-card">
          <div class="preview-header">
            <div class="preview-status-pill">
              <span class="live-dot"></span>
              <span class="preview-status-title">3D 实时动态预览</span>
            </div>
            <button class="preview-refresh-btn" title="强制刷新重载" @click="forceReloadPreview">
              <Icon name="refresh" :size="15" />
            </button>
          </div>

          <div class="preview-viewport">
            <iframe
              ref="previewIframeRef"
              :key="previewKey"
              :src="previewUrl"
              class="preview-iframe"
              title="3D Live Viewer"
              allow="accelerometer; gyroscope; fullscreen"
            ></iframe>
          </div>

          <div class="preview-footer">
            <Icon name="cube" :size="14" />
            <span>支持在视窗中拖拽旋转视角与缩放 · 实时响应参数变化</span>
          </div>
        </div>
      </aside>
    </div>

    <!-- Confirm Reset Modal -->
    <ConfirmModal
      :show="showResetConfirm"
      title="恢复默认配置"
      message="确定要将当前相册的 3D 视觉展示效果重置为系统默认风格吗？"
      confirm-text="确认重置"
      :danger="true"
      :loading="resetting"
      @confirm="confirmReset"
      @cancel="showResetConfirm = false"
    />
  </div>
</template>

<style scoped>
.config-view-root {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1560px;
  margin: 0 auto;
}

.config-top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  padding: 4px 8px;
  margin-left: -8px;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.back-btn:hover {
  color: var(--text-primary);
  background: var(--bg-surface-subtle);
}

.title-meta h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.title-meta p {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--text-secondary);
  gap: 16px;
}

.spinner {
  width: 44px;
  height: 44px;
  border: 3px solid var(--border-strong);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Studio 2-Column Layout */
.studio-container {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 480px;
  gap: 24px;
  align-items: start;
}

.controls-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-card {
  background: #ffffff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: 22px;
  box-shadow: var(--shadow-xs);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.card-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.card-header h3 {
  font-size: 15.5px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.card-header p {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

/* Switches & Toggles */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.switch-container {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #cbd5e1;
  transition: 0.25s;
  border-radius: 24px;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.25s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.switch-input:checked + .switch-slider {
  background-color: #10b981;
}

.switch-input:checked + .switch-slider:before {
  transform: translateX(20px);
}

.toggle-label-text {
  display: flex;
  flex-direction: column;
}

.toggle-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.toggle-desc {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* Particle Chips */
.particle-types-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.particle-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: var(--bg-surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.particle-chip:hover {
  background: #e2e8f0;
}

.particle-chip.active {
  background: #ecfdf5;
  border-color: #10b981;
  color: #065f46;
  font-weight: 600;
}

/* Effects Grid */
.effects-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.effect-box {
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #fafcfb;
}

.slider-group {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.slider-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slider-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.range-slider {
  width: 100%;
  accent-color: #10b981;
}

/* ==========================================
   Right Column: Sticky Live Preview
   ========================================== */
.preview-column {
  position: sticky;
  top: 24px;
}

.preview-sticky-card {
  background: #111820;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.preview-header {
  padding: 14px 18px;
  background: rgba(18, 25, 30, 0.95);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.preview-status-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.preview-refresh-btn {
  color: #94a3b8;
  padding: 4px;
  border-radius: 6px;
  display: grid;
  place-items: center;
}

.preview-refresh-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.preview-viewport {
  width: 100%;
  height: 520px;
  background: #070a0d;
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.preview-footer {
  padding: 12px 18px;
  background: rgba(18, 25, 30, 0.95);
  font-size: 11.5px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

@media (max-width: 1180px) {
  .studio-container {
    grid-template-columns: 1fr;
  }

  .preview-column {
    position: static;
  }
}
</style>
