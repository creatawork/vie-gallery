<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import PresetSelector from '../components/PresetSelector.vue'
import LayoutSettings from '../components/LayoutSettings.vue'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const { can } = useAuth()
const canConfigWrite = can('CONFIG_WRITE')
const router = useRouter()
const toast = useToast()
const galleryId = route.params.id as string

const loading = ref(true)
const saving = ref(false)
const galleryInfo = ref<any>(null)
const showResetConfirm = ref(false)
const resetting = ref(false)
const showPublishConfirm = ref(false)
const showRollbackConfirm = ref(false)
const publishing = ref(false)
const rollingBack = ref(false)
const rollbackVersionId = ref<string | null>(null)
const versions = ref<any[]>([])
const publishedVersionId = ref<string | null>(null)
const lastPublishedAt = ref<string | null>(null)
const savedDraftJson = ref('')
const publishedConfigJson = ref<string | null>(null)
const previewKey = ref(0)
const previewIframeRef = ref<HTMLIFrameElement | null>(null)

// Viewport simulator device mode ('desktop' | 'tablet' | 'mobile')
const emulatorDevice = ref<'desktop' | 'tablet' | 'mobile'>('desktop')

/**
 * 获取纯净的配置对象（深度剥离所有 Vue reactive proxy）
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
      previewIframeRef.value.contentWindow.postMessage(msg, '*')
    } catch (err) {
      console.warn('postMessage failed:', err)
    }
  }
}

function handleLayoutChange(mode: string) {
  if (!canConfigWrite.value) return
  config.layout.mode = mode
  sendLiveMessage({ type: 'VIE_LAYOUT_CHANGE', mode })
}

function refreshLivePreview() {
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

const hasDraftChanges = computed(() => savedDraftJson.value !== JSON.stringify(getCleanConfig()))
const hasUnpublishedDraft = computed(() => !publishedVersionId.value || publishedConfigJson.value !== savedDraftJson.value)

const previewUrl = computed(() => {
  const slug = galleryInfo.value?.slug || 'demo'
  const base = `${window.location.protocol}//${window.location.hostname}:5174`
  return `${base}/g/${slug}?t=${previewKey.value}`
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

async function loadVersions() {
  const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config/versions?page=0&pageSize=20`)
  if (!response.ok) return
  const data = await response.json()
  versions.value = Array.isArray(data.items) ? data.items : []
  const published = versions.value.find(version => version.id === publishedVersionId.value)
  publishedConfigJson.value = published?.configJson || null
}

async function loadGalleryAndConfig() {
  loading.value = true
  try {
    const gallRes = await apiFetch(`/api/galleries/${galleryId}`)
    if (gallRes.ok) {
      galleryInfo.value = await gallRes.json()
    }

    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`)
    if (response.ok) {
      const data = await response.json()
      if (data) {
        if (data.configJson) {
          const parsed = JSON.parse(data.configJson)
          deepMerge(config, parsed)
          if (data.presetName) config.presetName = data.presetName
        }
        publishedVersionId.value = data.publishedVersionId || null
        lastPublishedAt.value = data.lastPublishedAt || null
        publishedConfigJson.value = data.publishedVersionId ? null : JSON.stringify(getCleanConfig())
      }
    }
    ensureConfigDefaults()
    savedDraftJson.value = JSON.stringify(getCleanConfig())
    await loadVersions()
  } catch (err: any) {
    toast.error('加载相册配置失败')
  } finally {
    loading.value = false
  }
}

async function applyPreset(presetName: string) {
  if (!canConfigWrite.value) return
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
  if (!canConfigWrite.value) {
    toast.error('当前角色没有修改配置的权限。')
    return
  }
  saving.value = true
  try {
    ensureConfigDefaults()
    const cleanConfig = getCleanConfig()
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        configJson: JSON.stringify(cleanConfig),
        presetName: cleanConfig.presetName,
        schemaVersion: 1
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

    savedDraftJson.value = JSON.stringify(cleanConfig)
    toast.success('3D 视觉配置草稿已保存，发布后对访客生效。')
    refreshLivePreview()
  } catch (err: any) {
    toast.error(err.message || '保存失败，请检查网络或登录状态')
  } finally {
    saving.value = false
  }
}

async function publishDraft() {
  if (!canConfigWrite.value) return
  publishing.value = true
  try {
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1 })
    })
    if (!response.ok) throw new Error(`发布失败 (${response.status})`)
    const version = await response.json()
    publishedVersionId.value = version.id || null
    publishedConfigJson.value = savedDraftJson.value
    lastPublishedAt.value = version.createdAt || new Date().toISOString()
    await loadVersions()
    showPublishConfirm.value = false
    toast.success('配置已发布到访客端。')
  } catch (err: any) {
    toast.error(err.message || '发布失败，请稍后重试')
  } finally {
    publishing.value = false
  }
}

function requestRollback(versionId: string) {
  rollbackVersionId.value = versionId
  showRollbackConfirm.value = true
}

async function rollbackDraft() {
  if (!canConfigWrite.value || !rollbackVersionId.value) return
  rollingBack.value = true
  try {
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: rollbackVersionId.value })
    })
    if (!response.ok) throw new Error(`回滚失败 (${response.status})`)
    const version = await response.json()
    const parsed = JSON.parse(version.configJson)
    deepMerge(config, parsed)
    if (version.presetName) config.presetName = version.presetName
    ensureConfigDefaults()
    savedDraftJson.value = JSON.stringify(getCleanConfig())
    publishedVersionId.value = version.id || null
    publishedConfigJson.value = savedDraftJson.value
    lastPublishedAt.value = version.createdAt || new Date().toISOString()
    await loadVersions()
    showRollbackConfirm.value = false
    rollbackVersionId.value = null
    refreshLivePreview()
    toast.success('已回滚并发布该配置版本。')
  } catch (err: any) {
    toast.error(err.message || '回滚失败，请稍后重试')
  } finally {
    rollingBack.value = false
  }
}

async function confirmReset() {
  if (!canConfigWrite.value) return
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
  router.push({ name: 'gallery-workspace', params: { id: galleryId } })
}

onMounted(() => {
  loadGalleryAndConfig()
})
</script>

<template>
  <div class="config-view-root">
    <!-- Top Sticky Navigation Bar -->
    <header class="config-sticky-navbar">
      <div class="navbar-left">
        <button class="back-link-btn" type="button" @click="goBack">
          <Icon name="arrow-left" :size="15" />
          <span>相册空间</span>
        </button>
        <span class="nav-divider">/</span>
        <div class="config-title-group">
          <h1 class="config-title">{{ galleryInfo?.name || '相册空间' }} · 3D 视觉配置</h1>
          <span class="draft-badge" :class="hasDraftChanges ? 'draft-modified' : 'draft-synced'">
            <span class="pulse-dot-sm" :class="hasDraftChanges ? 'dot-amber' : 'dot-green'"></span>
            {{ hasDraftChanges ? '草稿已修改未保存' : '草稿已同步' }}
          </span>
        </div>
      </div>

      <div class="navbar-actions">
        <button v-if="canConfigWrite" class="btn btn-secondary btn-sm" type="button" @click="showResetConfirm = true">
          <Icon name="refresh" :size="14" />
          <span>重置默认</span>
        </button>
        <button v-if="canConfigWrite" class="btn btn-secondary btn-sm" :disabled="saving" type="button" @click="save">
          <Icon v-if="saving" name="refresh" :size="14" class="spin" />
          <Icon v-else name="check" :size="14" />
          <span>{{ saving ? '保存中…' : '保存草稿' }}</span>
        </button>
        <button
          v-if="canConfigWrite"
          class="btn btn-primary btn-sm publish-btn"
          :disabled="publishing || !hasUnpublishedDraft"
          type="button"
          @click="showPublishConfirm = true"
        >
          <Icon v-if="publishing" name="refresh" :size="14" class="spin" />
          <Icon v-else name="upload" :size="14" />
          <span>{{ publishing ? '发布中…' : '发布生效' }}</span>
        </button>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="config-loading-state" role="status">
      <div class="config-spinner"></div>
      <p>正在载入相册 3D 视觉配置参数…</p>
    </div>

    <!-- Main Two-Column Studio Layout (Matching image2.png prototype) -->
    <div v-else class="studio-two-column-layout">
      <!-- Left Column: Form Settings Cards -->
      <fieldset class="config-controls-col" :disabled="!canConfigWrite">
        <!-- 1. Ambient Presets Card -->
        <section class="config-section-card">
          <div class="section-card-header">
            <div class="header-icon-box">
              <Icon name="sparkles" :size="18" />
            </div>
            <div>
              <h2 class="card-title">一键氛围预设</h2>
              <p class="card-subtitle">精选大师级 3D 视觉主题，点击卡片即时同步</p>
            </div>
          </div>
          <PresetSelector
            :current-preset="config.presetName"
            :disabled="!canConfigWrite"
            @select="applyPreset"
          />
        </section>

        <!-- 2. 3D Layout Geometry Card -->
        <section class="config-section-card">
          <div class="section-card-header">
            <div class="header-icon-box">
              <Icon name="cube" :size="18" />
            </div>
            <div>
              <h2 class="card-title">三维空间几何排布</h2>
              <p class="card-subtitle">照片在 WebGL 3D 空间的数学拓扑分布形态</p>
            </div>
          </div>
          <LayoutSettings
            v-model:mode="config.layout.mode"
            :disabled="!canConfigWrite"
            @update:mode="handleLayoutChange"
          />
        </section>

        <!-- 3. Space Background & SkyDome Card -->
        <section class="config-section-card">
          <div class="section-card-header">
            <div class="header-icon-box">
              <Icon name="globe" :size="18" />
            </div>
            <div>
              <h2 class="card-title">空间背景与全景天穹</h2>
              <p class="card-subtitle">全景天空穹顶 (SkyDome) 与艺术渐变背景</p>
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">背景渲染模式</label>
              <select v-model="config.background.type" class="select-input" :disabled="!canConfigWrite" @change="onBackgroundTypeChange">
                <option value="sky">沉浸式天空穹顶 (SkyDome)</option>
                <option value="gradient">艺术色彩渐变 (Gradient)</option>
                <option value="none">极简纯黑背景 (Pure Dark)</option>
              </select>
            </div>

            <div v-if="config.background.type === 'sky' && config.background.sky" class="form-group">
              <label class="form-label">天穹主题</label>
              <select v-model="config.background.sky.theme" class="select-input" :disabled="!canConfigWrite" @change="refreshLivePreview">
                <option value="starry">星空银河 (Starry Night)</option>
                <option value="forest">暮色森林 (Forest Dream)</option>
                <option value="ocean">蔚蓝深海 (Ocean Breeze)</option>
                <option value="sunset">落日余晖 (Sunset Glow)</option>
              </select>
            </div>

            <div v-if="config.background.type === 'gradient' && config.background.gradient" class="form-group">
              <label class="form-label">渐变方向</label>
              <select v-model="config.background.gradient.direction" class="select-input" :disabled="!canConfigWrite" @change="refreshLivePreview">
                <option value="vertical">垂直线性 (Vertical)</option>
                <option value="horizontal">水平线性 (Horizontal)</option>
                <option value="radial">径向环形 (Radial)</option>
              </select>
            </div>
          </div>
        </section>

        <!-- 4. Dynamic Particle Systems Card -->
        <section class="config-section-card">
          <div class="section-card-header">
            <div class="header-icon-box">
              <Icon name="sparkles" :size="18" />
            </div>
            <div>
              <h2 class="card-title">动态物理粒子系统</h2>
              <p class="card-subtitle">空间中漫游的流体微粒与光斑效果</p>
            </div>
          </div>

          <div class="toggle-control-row">
            <label class="switch-container">
              <input type="checkbox" v-model="config.particles.enabled" :disabled="!canConfigWrite" class="switch-input" @change="refreshLivePreview" />
              <span class="switch-slider"></span>
            </label>
            <div class="toggle-text">
              <span class="toggle-title">启用 3D 粒子流</span>
              <span class="toggle-desc">开启实时物理运动微粒光影</span>
            </div>
          </div>

          <div v-if="config.particles.enabled" class="particle-pills-selector">
            <button
              class="particle-pill-btn"
              :class="{ active: config.particles.types.includes('stars') }"
              type="button"
              @click="canConfigWrite && toggleParticleType('stars')"
            >
              <Icon name="star" :size="14" />
              <span>璀璨星尘 (Stars)</span>
            </button>
            <button
              class="particle-pill-btn"
              :class="{ active: config.particles.types.includes('sakura') }"
              type="button"
              @click="canConfigWrite && toggleParticleType('sakura')"
            >
              <Icon name="sparkles" :size="14" />
              <span>飘落樱花 (Sakura)</span>
            </button>
            <button
              class="particle-pill-btn"
              :class="{ active: config.particles.types.includes('hearts') }"
              type="button"
              @click="canConfigWrite && toggleParticleType('hearts')"
            >
              <Icon name="star" :size="14" />
              <span>心动爱心 (Hearts)</span>
            </button>
            <button
              class="particle-pill-btn"
              :class="{ active: config.particles.types.includes('snow') }"
              type="button"
              @click="canConfigWrite && toggleParticleType('snow')"
            >
              <Icon name="sparkles" :size="14" />
              <span>静谧雪花 (Snow)</span>
            </button>
          </div>
        </section>

        <!-- 5. Postprocessing Bloom & Effects Card -->
        <section class="config-section-card">
          <div class="section-card-header">
            <div class="header-icon-box">
              <Icon name="sliders" :size="18" />
            </div>
            <div>
              <h2 class="card-title">电影级后处理滤镜 (Bloom & Fog)</h2>
              <p class="card-subtitle">高光溢出辉光 (Unreal Bloom) 与大气景深雾效</p>
            </div>
          </div>

          <div class="effects-container-box">
            <div class="toggle-control-row">
              <label class="switch-container">
                <input type="checkbox" v-model="config.effects.bloom.enabled" :disabled="!canConfigWrite" class="switch-input" @change="refreshLivePreview" />
                <span class="switch-slider"></span>
              </label>
              <div class="toggle-text">
                <span class="toggle-title">高光溢出辉光 (Bloom)</span>
                <span class="toggle-desc">明亮高光散射柔和光晕</span>
              </div>
            </div>

            <div v-if="config.effects.bloom.enabled" class="sliders-subgroup">
              <div class="slider-control-item">
                <div class="slider-header-label">
                  <span>辉光强度 (Strength)</span>
                  <span class="slider-value-bubble">{{ config.effects.bloom.strength }}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.8"
                  step="0.05"
                  v-model.number="config.effects.bloom.strength"
                  class="range-slider"
                  :disabled="!canConfigWrite"
                  @input="refreshLivePreview"
                />
              </div>

              <div class="slider-control-item">
                <div class="slider-header-label">
                  <span>辉光半径 (Radius)</span>
                  <span class="slider-value-bubble">{{ config.effects.bloom.radius }}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  v-model.number="config.effects.bloom.radius"
                  class="range-slider"
                  :disabled="!canConfigWrite"
                  @input="refreshLivePreview"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- 6. Version History Card -->
        <section v-if="versions.length" class="config-section-card">
          <div class="section-card-header">
            <div class="header-icon-box">
              <Icon name="clock" :size="18" />
            </div>
            <div>
              <h2 class="card-title">版本历史与发布回滚</h2>
              <p class="card-subtitle">查看历史发布快照，支持一键回滚发布版本</p>
            </div>
          </div>

          <div class="version-list-box">
            <div v-for="version in versions" :key="version.id" class="version-row-item">
              <div class="version-meta-info">
                <div class="version-title-row">
                  <strong>版本 v{{ version.versionNumber }}</strong>
                  <span v-if="version.id === publishedVersionId" class="badge-current-published">当前线上版本</span>
                </div>
                <span class="version-time">创建于 {{ new Date(version.createdAt).toLocaleString('zh-CN') }}</span>
              </div>
              <button
                v-if="canConfigWrite && version.id !== publishedVersionId"
                class="btn btn-secondary btn-xs"
                type="button"
                @click="requestRollback(version.id)"
              >
                回滚至此版本
              </button>
            </div>
          </div>
        </section>
      </fieldset>

      <!-- Right Column: Interactive Multi-Viewport Device Emulator Frame -->
      <aside class="device-emulator-col" aria-label="3D 实时渲染视口">
        <div class="emulator-container-card">
          <!-- Emulator Device Toolbar -->
          <div class="emulator-top-toolbar">
            <!-- Viewport Mode Buttons -->
            <div class="viewport-buttons-group">
              <button
                class="vp-btn"
                :class="{ active: emulatorDevice === 'desktop' }"
                type="button"
                title="桌面端全景视口 (100%)"
                @click="emulatorDevice = 'desktop'"
              >
                <Icon name="monitor" :size="15" />
                <span>桌面端</span>
              </button>
              <button
                class="vp-btn"
                :class="{ active: emulatorDevice === 'tablet' }"
                type="button"
                title="平板端视口 (768px)"
                @click="emulatorDevice = 'tablet'"
              >
                <Icon name="tablet" :size="15" />
                <span>平板</span>
              </button>
              <button
                class="vp-btn"
                :class="{ active: emulatorDevice === 'mobile' }"
                type="button"
                title="手机端移动视口 (375px)"
                @click="emulatorDevice = 'mobile'"
              >
                <Icon name="smartphone" :size="15" />
                <span>移动端</span>
              </button>
            </div>

            <!-- Quick tools -->
            <div class="emulator-quick-tools">
              <button class="icon-tool-btn" type="button" title="刷新 3D 渲染画面" @click="forceReloadPreview">
                <Icon name="refresh" :size="14" />
              </button>
              <button class="icon-tool-btn" type="button" title="独立新窗口打开预览" @click="openLivePreview">
                <Icon name="external" :size="14" />
              </button>
            </div>
          </div>

          <!-- Embedded Emulator Screen Frame -->
          <div class="emulator-screen-outer" :class="`device-${emulatorDevice}`">
            <div class="emulator-bezel">
              <div class="bezel-notch" v-if="emulatorDevice === 'mobile'"></div>
              <iframe
                ref="previewIframeRef"
                :src="previewUrl"
                class="emulator-iframe"
                allow="accelerometer; gyroscope; magnetometer; xr-spatial-tracking"
                title="3D Gallery Live Preview"
              ></iframe>
            </div>
          </div>

          <!-- Emulator Footer Hint -->
          <div class="emulator-footer-hint">
            <span class="live-dot-green"></span>
            <span>WebGL 3D 渲染实时双向同步中</span>
          </div>
        </div>
      </aside>
    </div>

    <!-- Modals -->
    <ConfirmModal
      :show="showPublishConfirm"
      title="发布 3D 视觉配置"
      message="确定要将当前草稿配置发布到线上吗？发布后所有访客将立即看到最新的 3D 展厅视觉效果。"
      confirm-text="确认发布"
      :loading="publishing"
      @confirm="publishDraft"
      @cancel="showPublishConfirm = false"
    />

    <ConfirmModal
      :show="showRollbackConfirm"
      title="确认回滚配置版本"
      message="回滚操作将立即应用历史版本并发布到线上，是否继续？"
      confirm-text="确认回滚"
      :loading="rollingBack"
      @confirm="rollbackDraft"
      @cancel="showRollbackConfirm = false"
    />

    <ConfirmModal
      :show="showResetConfirm"
      title="恢复默认配置"
      message="确定要将当前相册的 3D 视觉展示效果重置为系统初始预设风格吗？"
      confirm-text="确认重置"
      danger
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
  gap: 20px;
  width: min(100%, 1400px);
  margin: 0 auto;
  padding: 4px 4px 64px;
}

/* Sticky Top Navigation Bar */
.config-sticky-navbar {
  position: sticky;
  top: 72px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.back-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.2s ease;
}

.back-link-btn:hover {
  background: #d1fae5;
  color: #047857;
}

.nav-divider {
  color: #cbd5e1;
}

.config-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.config-title {
  font-size: 17px;
  font-weight: 750;
  color: #0f172a;
}

.draft-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 650;
  padding: 2px 8px;
  border-radius: 9999px;
}

.draft-modified {
  background: #fef3c7;
  color: #b45309;
}

.draft-synced {
  background: #ecfdf5;
  color: #047857;
}

.pulse-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.dot-amber { background: #f59e0b; }
.dot-green { background: #10b981; }

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.publish-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  font-weight: 700;
}

/* Two-Column Studio Layout */
.studio-two-column-layout {
  display: grid;
  grid-template-columns: minmax(480px, 1.1fr) minmax(440px, 0.9fr);
  gap: 24px;
  align-items: start;
}

.config-controls-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  border: none;
  padding: 0;
  margin: 0;
  min-width: 0;
}

.config-section-card {
  padding: 22px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.header-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
}

.card-subtitle {
  font-size: 12.5px;
  color: #64748b;
  margin-top: 2px;
}

.form-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

/* Switches & Toggles */
.toggle-control-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch-container {
  position: relative;
  width: 44px;
  height: 24px;
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
  background: #cbd5e1;
  border-radius: 24px;
  transition: all 0.25s ease;
}

.switch-slider::before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: all 0.25s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.switch-input:checked + .switch-slider {
  background: #10b981;
}

.switch-input:checked + .switch-slider::before {
  transform: translateX(20px);
}

.toggle-text {
  display: flex;
  flex-direction: column;
}

.toggle-title {
  font-size: 13.5px;
  font-weight: 650;
  color: #0f172a;
}

.toggle-desc {
  font-size: 12px;
  color: #64748b;
}

/* Particle Pills */
.particle-pills-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.particle-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  transition: all 0.2s ease;
}

.particle-pill-btn.active {
  background: #ecfdf5;
  color: #047857;
  border-color: rgba(16, 185, 129, 0.35);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
}

/* Sliders */
.sliders-subgroup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}

.slider-control-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slider-header-label {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 600;
  color: #475569;
}

.slider-value-bubble {
  color: #059669;
  font-weight: 750;
}

.range-slider {
  width: 100%;
  accent-color: #10b981;
}

/* Versions List */
.version-list-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.version-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-current-published {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
}

.version-time {
  font-size: 11.5px;
  color: #94a3b8;
}

/* ==========================================================================
   Device Simulator Column (Matching image2.png prototype)
   ========================================================================== */
.device-emulator-col {
  position: sticky;
  top: 148px;
}

.emulator-container-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.05);
}

.emulator-top-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.viewport-buttons-group {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 10px;
  gap: 2px;
}

.vp-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  transition: all 0.2s ease;
}

.vp-btn.active {
  background: #ffffff;
  color: #047857;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.emulator-quick-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-tool-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.icon-tool-btn:hover {
  background: #ecfdf5;
  color: #047857;
}

/* Emulator Screen Outer */
.emulator-screen-outer {
  width: 100%;
  display: flex;
  justify-content: center;
  background: #0f172a;
  border-radius: 16px;
  padding: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.emulator-bezel {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  background: #020617;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.device-tablet .emulator-bezel {
  max-width: 480px;
  aspect-ratio: 3 / 4;
}

.device-mobile .emulator-bezel {
  max-width: 320px;
  aspect-ratio: 9 / 18;
}

.bezel-notch {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 70px;
  height: 12px;
  background: #0f172a;
  border-radius: 9999px;
  z-index: 10;
}

.emulator-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
}

.emulator-footer-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11.5px;
  color: #64748b;
  font-weight: 500;
}

.live-dot-green {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

.config-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 320px;
  background: #ffffff;
  border-radius: 20px;
  color: #64748b;
}

.config-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(16, 185, 129, 0.2);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1080px) {
  .studio-two-column-layout {
    grid-template-columns: 1fr;
  }

  .device-emulator-col {
    position: static;
  }
}
</style>
