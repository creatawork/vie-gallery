<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import { useAuth } from '../composables/useAuth'
import { creatorPreviewUrl, issuePreviewToken, openCreatorPreview } from '../lib/preview'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { can } = useAuth()
const canConfigWrite = can('CONFIG_WRITE')
const galleryId = route.params.id as string

const LAYOUTS = [
  { id: 'sphere', label: '环形展厅' },
  { id: 'carousel', label: '线性长廊' },
  { id: 'helix', label: '螺旋长廊' },
  { id: 'grid', label: '聚焦式' },
  { id: 'spiral', label: '旋臂漫游' },
  { id: 'random', label: '自由探索' }
] as const

const ATMOSPHERE_PRESETS = [
  { name: 'minimal', label: '极简空间', hint: '通透白净' },
  { name: 'forest-dream', label: '森林之梦', hint: '樱花微尘' },
  { name: 'starry-night', label: '星空夜曲', hint: '辉光星尘' },
  { name: 'ocean-breeze', label: '海洋微风', hint: '蔚蓝天穹' },
  { name: 'sunset-glow', label: '日落余晖', hint: '晚霞云彩' },
  { name: 'romantic', label: '心动浪漫', hint: '玫瑰粉雾' }
] as const

const BG_TYPES = [
  { id: 'sky', label: '天穹' },
  { id: 'gradient', label: '渐变' },
  { id: 'none', label: '纯色' }
] as const

const SKY_THEMES = [
  { id: 'forest', label: '森林' },
  { id: 'ocean', label: '海洋' },
  { id: 'starry', label: '星空' },
  { id: 'sunset', label: '日落' }
] as const

const PARTICLE_TYPES = [
  { id: 'stars', label: '星尘' },
  { id: 'sakura', label: '樱花' },
  { id: 'hearts', label: '心形' },
  { id: 'snow', label: '雪花' }
] as const

const FOG_COLORS = ['#e8f0ea', '#163124', '#0c4a6e', '#7c2d12', '#0f172a', '#4a0e2e']

const ACCENTS = ['#9FE8C8', '#D4C4F0', '#A8D4F0', '#F5C9A8', '#F5E6A8']

const FLOOR_OPTIONS = ['磨砂水磨石', '原木地板', '抛光大理石']
const WALL_OPTIONS = ['微质感涂料', '清水混凝土', '艺术灰泥']

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

const accent = ref(ACCENTS[0])
const lightLevel = ref(72)
const fogLevel = ref(35)
const fogColor = ref('#e8f0ea')
const bloomOn = ref(true)
const bloomRadius = ref(50)
const bloomThreshold = ref(18)
const audioOn = ref(true)
const floorMaterial = ref(FLOOR_OPTIONS[0])
const wallMaterial = ref(WALL_OPTIONS[0])
const lastSavedLabel = ref('')
const lastSaveFailed = ref(false)
const loadError = ref('')
const isFullscreen = ref(false)
const previewIframeRef = ref<HTMLIFrameElement | null>(null)
const previewLive = ref(false)
const embedTimedOut = ref(false)
const previewToken = ref('')
const previewIssueError = ref('')
let handshakeTimer: number | null = null
const HANDSHAKE_MS = 8000
const configTab = ref<'basics' | 'atmosphere' | 'advanced' | 'history'>('basics')

const CONFIG_TABS = [
  { id: 'basics' as const, label: '基础' },
  { id: 'atmosphere' as const, label: '氛围' },
  { id: 'advanced' as const, label: '高级' },
  { id: 'history' as const, label: '版本' }
]

function clearHandshakeTimer() {
  if (handshakeTimer) {
    window.clearTimeout(handshakeTimer)
    handshakeTimer = null
  }
}

function startHandshakeTimer() {
  clearHandshakeTimer()
  if (!showPreviewFrame.value) return
  handshakeTimer = window.setTimeout(() => {
    if (!previewLive.value) embedTimedOut.value = true
  }, HANDSHAKE_MS)
}

let saveTimer: number | null = null

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatClock(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatHistoryTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return `今天 ${hm}`
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hm}`
}

function getCleanConfig() {
  return {
    presetName: config.presetName || 'custom',
    layout: {
      mode: config.layout?.mode || 'sphere'
    },
    background: {
      type: config.background?.type || 'sky',
      gradient: config.background.gradient ? {
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
      engine: config.theme?.engine || 'custom',
      accent: accent.value,
      floor: floorMaterial.value,
      wall: wallMaterial.value
    }
  }
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

function deepMerge(target: any, source: any) {
  if (!source) return target
  for (const key of Object.keys(source)) {
    const val = source[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {}
      deepMerge(target[key], val)
    } else if (Array.isArray(val)) {
      target[key] = [...val]
    } else if (val !== undefined) {
      target[key] = val
    }
  }
  return target
}

function syncAtmosphereFromConfig() {
  bloomOn.value = !!config.effects.bloom.enabled
  lightLevel.value = Math.round(((config.effects.bloom.strength || 0.75) / 1.8) * 100)
  bloomRadius.value = Math.round((config.effects.bloom.radius ?? 0.5) * 100)
  bloomThreshold.value = Math.round((config.effects.bloom.threshold ?? 0.18) * 100)
  fogLevel.value = Math.round(((config.effects.fog.density || 0) / 0.002) * 100)
  fogColor.value = config.effects.fog.color || '#e8f0ea'
  audioOn.value = !!config.audio.bgm.enabled
  if (config.theme?.accent && ACCENTS.includes(config.theme.accent)) {
    accent.value = config.theme.accent
  }
  if (typeof config.theme?.floor === 'string') floorMaterial.value = config.theme.floor
  if (typeof config.theme?.wall === 'string') wallMaterial.value = config.theme.wall
}

function applyAtmosphereToConfig() {
  config.effects.bloom.enabled = bloomOn.value
  config.effects.bloom.strength = Math.max(0.1, (lightLevel.value / 100) * 1.8)
  config.effects.bloom.radius = Math.max(0.1, bloomRadius.value / 100)
  config.effects.bloom.threshold = Math.max(0.05, bloomThreshold.value / 100)
  config.effects.fog.enabled = fogLevel.value > 0
  config.effects.fog.density = (fogLevel.value / 100) * 0.002
  config.effects.fog.color = fogColor.value
  config.audio.bgm.enabled = audioOn.value
  if (config.theme) {
    config.theme.engine = 'custom'
    config.theme.accent = accent.value
    config.theme.floor = floorMaterial.value
    config.theme.wall = wallMaterial.value
  }
}

function sendLiveMessage(payload: Record<string, unknown>) {
  previewIframeRef.value?.contentWindow?.postMessage(payload, '*')
}

function refreshLivePreview() {
  sendLiveMessage({ type: 'VIE_CONFIG_UPDATE', config: getCleanConfig() })
}

function isTrustedPreviewOrigin(origin: string) {
  if (!origin || origin === 'null') return true
  try {
    const url = new URL(origin)
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
    if (localHosts.has(url.hostname) && localHosts.has(window.location.hostname)) return true
    return url.hostname === window.location.hostname
  } catch {
    return false
  }
}

function onPreviewReady(event: MessageEvent) {
  if (!isTrustedPreviewOrigin(event.origin)) return
  if (event.data?.type !== 'VIE_PREVIEW_READY') return
  clearHandshakeTimer()
  embedTimedOut.value = false
  previewLive.value = true
  const payload = { type: 'VIE_CONFIG_UPDATE', config: getCleanConfig() }
  const source = event.source as Window | MessagePort | ServiceWorker | null
  if (source && 'postMessage' in source) {
    source.postMessage(payload, { targetOrigin: event.origin === 'null' ? '*' : event.origin } as WindowPostMessageOptions)
  }
  nextTick(() => refreshLivePreview())
}

async function retryEmbedPreview() {
  embedTimedOut.value = false
  previewLive.value = false
  previewIssueError.value = ''
  try {
    previewToken.value = (await issuePreviewToken(galleryId)).token
  } catch (cause) {
    previewToken.value = ''
    previewIssueError.value = cause instanceof Error ? cause.message : '暂时无法打开内部预览，请稍后重试。'
    return
  }
  previewKey.value += 1
  if (showPreviewFrame.value) startHandshakeTimer()
}

const config = reactive({
  presetName: 'custom' as string | null,
  layout: { mode: 'sphere' },
  background: {
    type: 'sky',
    gradient: { colors: ['#f8fafc', '#e2e8f0'], direction: 'vertical' },
    sky: { theme: 'starry', timeOfDay: 'day' }
  },
  particles: { enabled: true, types: ['stars'] as string[], density: 1.0 },
  effects: {
    bloom: { enabled: true, strength: 1.3, radius: 0.5, threshold: 0.18 },
    fog: { enabled: true, color: '#e8f0ea', density: 0.0007 }
  },
  interaction: { clickRipple: true },
  audio: { bgm: { enabled: true }, sfx: { enabled: true } },
  theme: { engine: 'custom', accent: ACCENTS[0], floor: FLOOR_OPTIONS[0], wall: WALL_OPTIONS[0] }
})

const hasDraftChanges = computed(() => savedDraftJson.value !== JSON.stringify(getCleanConfig()))
const hasUnpublishedDraft = computed(() => !publishedVersionId.value || publishedConfigJson.value !== savedDraftJson.value)
const syncStatus = computed(() => {
  if (saving.value) return '正在保存草稿…'
  if (lastSaveFailed.value) return '草稿保存失败，请重试'
  if (hasDraftChanges.value) return '有未保存的更改'
  if (hasUnpublishedDraft.value) {
    return lastSavedLabel.value ? `草稿已保存 ${lastSavedLabel.value} · 尚未同步` : '草稿尚未同步到访客端'
  }
  if (lastSavedLabel.value) return `已同步到访客端`
  return '尚未保存过配置'
})

const displayVersions = computed(() => {
  return versions.value.slice(0, 10).map((version, index) => ({
    ...version,
    title: version.title || (index === 0 ? '当前版本' : `版本 v${version.versionNumber}`),
    current: version.id === publishedVersionId.value || (index === 0 && !publishedVersionId.value)
  }))
})

const gallerySlug = computed(() => galleryInfo.value?.slug || '')

const previewUrl = computed(() => {
  if (!gallerySlug.value || !previewToken.value) return ''
  return creatorPreviewUrl(gallerySlug.value, previewToken.value, true)
})

const canEmbedViewer = computed(() => {
  const port = window.location.port
  if (!gallerySlug.value || !previewToken.value) return false
  if (port === '5174' || port === '5175') return false
  return true
})

const showPreviewFrame = computed(() => canEmbedViewer.value && !embedTimedOut.value && !previewIssueError.value)
const previewEmptyText = computed(() => {
  if (previewIssueError.value) return previewIssueError.value
  if (!gallerySlug.value) return '加载空间信息后才能预览。'
  if (embedTimedOut.value) return '展厅预览没有响应。请确认预览页已启动，然后重试。'
  if (!canEmbedViewer.value) return '当前窗口无法嵌入预览，请用新窗口打开。'
  return '正在连接内部预览…'
})

async function loadVersions() {
  const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config/versions?page=0&pageSize=20`)
  if (!response.ok) {
    versions.value = []
    return
  }
  const data = await response.json()
  versions.value = Array.isArray(data.items) ? data.items : []
  const published = versions.value.find(version => version.id === publishedVersionId.value)
  publishedConfigJson.value = published?.configJson || publishedConfigJson.value
}

async function loadGalleryAndConfig() {
  loading.value = true
  loadError.value = ''
  previewLive.value = false
  embedTimedOut.value = false
  lastSavedLabel.value = ''
  lastSaveFailed.value = false
  try {
    const gallRes = await apiFetch(`/api/galleries/${galleryId}`)
    if (!gallRes.ok) {
      if (gallRes.status === 401) {
        loadError.value = '登录已失效，请重新登录。'
      } else if (gallRes.status === 404) {
        loadError.value = '找不到这个相册空间。'
      } else if (gallRes.status === 403) {
        loadError.value = '你没有权限查看这个展厅配置。'
      } else {
        loadError.value = '空间加载失败，请稍后重试。'
      }
      galleryInfo.value = null
      return
    }
    galleryInfo.value = await gallRes.json()
    previewIssueError.value = ''
    try {
      previewToken.value = (await issuePreviewToken(galleryId)).token
    } catch (cause) {
      previewToken.value = ''
      previewIssueError.value = cause instanceof Error ? cause.message : '暂时无法打开内部预览，请稍后重试。'
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
        publishedConfigJson.value = data.publishedConfigJson || (data.publishedVersionId ? null : JSON.stringify(getCleanConfig()))
      }
      ensureConfigDefaults()
      syncAtmosphereFromConfig()
      savedDraftJson.value = JSON.stringify(getCleanConfig())
      lastSavedLabel.value = formatClock(new Date())
      await loadVersions()
    } else if (response.status === 404) {
      ensureConfigDefaults()
      syncAtmosphereFromConfig()
      savedDraftJson.value = JSON.stringify(getCleanConfig())
    } else {
      loadError.value = '展厅配置加载失败，请稍后重试。'
    }
  } catch {
    loadError.value = '网络连接失败，请稍后重试。'
  } finally {
    loading.value = false
    if (galleryInfo.value?.slug) previewKey.value += 1
  }
}

function scheduleAutoSave() {
  if (!canConfigWrite.value) return
  applyAtmosphereToConfig()
  refreshLivePreview()
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    save({ silent: true })
  }, 800)
}

function setLayout(mode: string) {
  if (!canConfigWrite.value) return
  config.layout.mode = mode
  config.presetName = 'custom'
  sendLiveMessage({ type: 'VIE_LAYOUT_CHANGE', mode })
  scheduleAutoSave()
}

function setAccent(color: string) {
  if (!canConfigWrite.value) return
  accent.value = color
  config.presetName = 'custom'
  scheduleAutoSave()
}

function onAtmosphereInput() {
  config.presetName = 'custom'
  applyAtmosphereToConfig()
  scheduleAutoSave()
}

function setBackgroundType(type: 'sky' | 'gradient' | 'none') {
  if (!canConfigWrite.value) return
  config.background.type = type
  config.presetName = 'custom'
  scheduleAutoSave()
}

function setSkyTheme(theme: 'forest' | 'ocean' | 'starry' | 'sunset') {
  if (!canConfigWrite.value) return
  config.background.sky.theme = theme
  config.presetName = 'custom'
  scheduleAutoSave()
}

function toggleParticleType(id: string) {
  if (!canConfigWrite.value) return
  const types = config.particles.types
  const index = types.indexOf(id)
  if (index >= 0) types.splice(index, 1)
  else types.push(id)
  config.particles.enabled = types.length > 0
  config.presetName = 'custom'
  scheduleAutoSave()
}

function setParticlesEnabled(enabled: boolean) {
  if (!canConfigWrite.value) return
  config.particles.enabled = enabled
  if (enabled && !config.particles.types.length) config.particles.types = ['stars']
  config.presetName = 'custom'
  scheduleAutoSave()
}

function setFogColor(color: string) {
  if (!canConfigWrite.value) return
  fogColor.value = color
  config.presetName = 'custom'
  scheduleAutoSave()
}

function applyPreset(name: string) {
  if (!canConfigWrite.value) return
  const presets: Record<string, Partial<typeof config>> = {
    minimal: {
      presetName: 'minimal',
      layout: { mode: 'sphere' },
      background: {
        type: 'gradient',
        gradient: { colors: ['#f8fafc', '#e2e8f0'], direction: 'vertical' },
        sky: { theme: 'starry', timeOfDay: 'day' }
      },
      particles: { enabled: false, types: [], density: 1 },
      effects: {
        bloom: { enabled: false, strength: 0.4, radius: 0.4, threshold: 0.3 },
        fog: { enabled: false, color: '#e8f0ea', density: 0 }
      },
      audio: { bgm: { enabled: false }, sfx: { enabled: true } }
    },
    'forest-dream': {
      presetName: 'forest-dream',
      layout: { mode: 'helix' },
      background: {
        type: 'sky',
        gradient: { colors: ['#0f172a', '#163124'], direction: 'vertical' },
        sky: { theme: 'forest', timeOfDay: 'sunset' }
      },
      particles: { enabled: true, types: ['sakura', 'stars'], density: 1 },
      effects: {
        bloom: { enabled: true, strength: 0.65, radius: 0.5, threshold: 0.2 },
        fog: { enabled: true, color: '#163124', density: 0.0006 }
      },
      audio: { bgm: { enabled: true }, sfx: { enabled: true } }
    },
    'starry-night': {
      presetName: 'starry-night',
      layout: { mode: 'sphere' },
      background: {
        type: 'sky',
        gradient: { colors: ['#0f172a', '#1e293b'], direction: 'vertical' },
        sky: { theme: 'starry', timeOfDay: 'night' }
      },
      particles: { enabled: true, types: ['stars'], density: 1.2 },
      effects: {
        bloom: { enabled: true, strength: 0.8, radius: 0.6, threshold: 0.15 },
        fog: { enabled: false, color: '#0f172a', density: 0 }
      },
      audio: { bgm: { enabled: true }, sfx: { enabled: true } }
    },
    'ocean-breeze': {
      presetName: 'ocean-breeze',
      layout: { mode: 'spiral' },
      background: {
        type: 'sky',
        gradient: { colors: ['#0c4a6e', '#0ea5e9'], direction: 'vertical' },
        sky: { theme: 'ocean', timeOfDay: 'day' }
      },
      particles: { enabled: false, types: [], density: 1 },
      effects: {
        bloom: { enabled: false, strength: 0.4, radius: 0.4, threshold: 0.25 },
        fog: { enabled: true, color: '#0c4a6e', density: 0.0008 }
      },
      audio: { bgm: { enabled: true }, sfx: { enabled: true } }
    },
    'sunset-glow': {
      presetName: 'sunset-glow',
      layout: { mode: 'grid' },
      background: {
        type: 'sky',
        gradient: { colors: ['#7c2d12', '#fdba74'], direction: 'vertical' },
        sky: { theme: 'sunset', timeOfDay: 'sunset' }
      },
      particles: { enabled: true, types: ['sakura'], density: 0.8 },
      effects: {
        bloom: { enabled: true, strength: 0.85, radius: 0.6, threshold: 0.2 },
        fog: { enabled: true, color: '#7c2d12', density: 0.0005 }
      },
      audio: { bgm: { enabled: true }, sfx: { enabled: true } }
    },
    romantic: {
      presetName: 'romantic',
      layout: { mode: 'spiral' },
      background: {
        type: 'gradient',
        gradient: { colors: ['#4a0e2e', '#831843'], direction: 'radial' },
        sky: { theme: 'sunset', timeOfDay: 'night' }
      },
      particles: { enabled: true, types: ['hearts'], density: 1 },
      effects: {
        bloom: { enabled: true, strength: 0.7, radius: 0.5, threshold: 0.25 },
        fog: { enabled: false, color: '#4a0e2e', density: 0 }
      },
      audio: { bgm: { enabled: true }, sfx: { enabled: true } }
    }
  }
  const next = presets[name]
  if (!next) return
  deepMerge(config, next)
  config.presetName = name
  ensureConfigDefaults()
  syncAtmosphereFromConfig()
  sendLiveMessage({ type: 'VIE_PRESET_CHANGE', presetName: name })
  scheduleAutoSave()
}

async function save(options?: { silent?: boolean }) {
  if (!canConfigWrite.value) {
    if (!options?.silent) toast.error('当前角色没有修改配置的权限。')
    return
  }
  saving.value = true
  try {
    ensureConfigDefaults()
    applyAtmosphereToConfig()
    const cleanConfig = getCleanConfig()
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configJson: JSON.stringify(cleanConfig),
        presetName: cleanConfig.presetName,
        schemaVersion: 1
      })
    })

    if (!response.ok) {
      let msg = '草稿保存失败，请稍后重试。'
      try {
        const data = await response.json()
        if (data && (data.message || data.code)) msg = data.message || data.code
      } catch (_) {}
      throw new Error(msg)
    }

    savedDraftJson.value = JSON.stringify(cleanConfig)
    lastSavedLabel.value = formatClock(new Date())
    lastSaveFailed.value = false
    refreshLivePreview()
    if (!options?.silent) toast.success('草稿已保存。')
  } catch (err: any) {
    lastSaveFailed.value = true
    if (!options?.silent) toast.error(err.message || '保存失败，请检查网络或登录状态')
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
    if (!response.ok) {
      throw new Error('发布失败，请稍后重试。')
    }
    const version = await response.json()
    publishedVersionId.value = version.id || null
    publishedConfigJson.value = savedDraftJson.value
    lastPublishedAt.value = version.createdAt || new Date().toISOString()
    await loadVersions()
    showPublishConfirm.value = false
    toast.success('配置已同步到访客端。')
  } catch (err: any) {
    toast.error(err.message || '发布失败，请稍后重试')
  } finally {
    publishing.value = false
  }
}

function requestHeaderRollback() {
  const previous = displayVersions.value.find(version => !version.current)
  if (!previous) {
    toast.info('暂无可回滚的历史版本')
    return
  }
  rollbackVersionId.value = previous.id
  showRollbackConfirm.value = true
}

function requestRollback(versionId: string) {
  rollbackVersionId.value = versionId
  showRollbackConfirm.value = true
}

async function rollbackDraft() {
  if (!canConfigWrite.value || !rollbackVersionId.value) return
  rollingBack.value = true
  try {
    const selected = versions.value.find(version => version.id === rollbackVersionId.value)
    if (selected?.configJson) {
      const parsed = JSON.parse(selected.configJson)
      deepMerge(config, parsed)
      if (selected.presetName) config.presetName = selected.presetName
      ensureConfigDefaults()
      syncAtmosphereFromConfig()
      await save({ silent: true })
      showRollbackConfirm.value = false
      rollbackVersionId.value = null
      refreshLivePreview()
      toast.success('已恢复为草稿。同步到访客端后才会生效。')
      return
    }
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: rollbackVersionId.value, publish: false })
    })
    if (!response.ok) throw new Error('回滚失败，请稍后重试。')
    const version = await response.json()
    const parsed = JSON.parse(version.configJson)
    deepMerge(config, parsed)
    if (version.presetName) config.presetName = version.presetName
    ensureConfigDefaults()
    syncAtmosphereFromConfig()
    savedDraftJson.value = JSON.stringify(getCleanConfig())
    await loadVersions()
    showRollbackConfirm.value = false
    rollbackVersionId.value = null
    refreshLivePreview()
    toast.success('已恢复为草稿。同步到访客端后才会生效。')
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
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, { method: 'DELETE' })
    if (response.ok) {
      await loadGalleryAndConfig()
      toast.success('已恢复默认配置')
      showResetConfirm.value = false
    } else {
      toast.error('重置失败，请稍后重试')
    }
  } catch {
    toast.error('重置操作失败')
  } finally {
    resetting.value = false
  }
}

async function openLivePreview() {
  if (!galleryInfo.value?.slug) {
    toast.error(previewIssueError.value || '还没有可用的预览地址。')
    return
  }
  try {
    await openCreatorPreview(galleryId, galleryInfo.value.slug)
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : '暂时无法打开内部预览，请稍后重试。')
  }
}

function goBack() {
  router.push({ name: 'gallery-workspace', params: { id: galleryId } })
}

watch(showPreviewFrame, (shouldEmbed) => {
  previewLive.value = false
  if (shouldEmbed) startHandshakeTimer()
  else clearHandshakeTimer()
})

onMounted(() => {
  loadGalleryAndConfig()
  window.addEventListener('message', onPreviewReady)
})

onUnmounted(() => {
  if (saveTimer) window.clearTimeout(saveTimer)
  clearHandshakeTimer()
  window.removeEventListener('message', onPreviewReady)
})
</script>

<template>
  <div class="config-page" :class="{ 'is-full': isFullscreen }" :style="{ '--accent': accent, '--light': lightLevel / 100, '--fog': fogLevel / 100 }">
    <div class="config-scene" aria-hidden="true"></div>

    <header class="config-nav">
      <RouterLink to="/" class="brand">
        <span class="fold-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="#12B981" />
            <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="#059669" />
            <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="#047857" />
          </svg>
        </span>
        <span>VIE Gallery</span>
      </RouterLink>

      <nav class="config-tabs" aria-label="展厅导航">
        <RouterLink to="/" class="config-tab">
          <Icon name="layout" :size="15" />
          <span>我的空间</span>
        </RouterLink>
        <button class="config-tab" type="button" @click="goBack">
          <Icon name="gallery" :size="15" />
          <span>展厅工作区</span>
        </button>
        <span class="config-tab is-active">
          <Icon name="settings" :size="15" />
          <span>展厅配置</span>
        </span>
      </nav>

      <div class="nav-actions">
        <p class="autosave" :class="{ 'is-warn': lastSaveFailed || hasDraftChanges }">
          <Icon :name="lastSaveFailed || hasDraftChanges ? 'alert-circle' : 'check-circle'" :size="15" />
          <span>{{ syncStatus }}</span>
        </p>
        <button v-if="canConfigWrite" class="btn ghost" type="button" @click="requestHeaderRollback">
          <Icon name="undo" :size="14" />
          <span>回滚</span>
        </button>
        <button v-if="canConfigWrite" class="btn ghost" type="button" @click="showResetConfirm = true">
          <Icon name="refresh" :size="14" />
          <span>重置</span>
        </button>
        <button
          v-if="canConfigWrite && lastSaveFailed"
          class="btn outline"
          type="button"
          :disabled="saving"
          @click="save()"
        >
          <span>{{ saving ? '保存中…' : '重试保存' }}</span>
        </button>
        <button v-if="canConfigWrite" class="btn solid" type="button" :disabled="publishing || hasDraftChanges || lastSaveFailed" @click="showPublishConfirm = true">
          <Icon name="send" :size="14" />
          <span>{{ publishing ? '同步中…' : '同步到访客端' }}</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="config-state">正在载入展厅配置…</div>
    <div v-else-if="loadError" class="config-state">
      <h1>无法加载展厅配置</h1>
      <p>{{ loadError }}</p>
      <div class="state-actions">
        <button class="btn outline" type="button" @click="goBack">返回工作区</button>
        <button class="btn solid" type="button" @click="loadGalleryAndConfig">重试</button>
      </div>
    </div>

    <div v-else class="config-split">
      <aside class="config-side">
        <div class="side-tabs" role="tablist" aria-label="配置分区">
          <button
            v-for="tab in CONFIG_TABS"
            :key="tab.id"
            class="side-tab"
            :class="{ active: configTab === tab.id }"
            type="button"
            role="tab"
            :aria-selected="configTab === tab.id"
            @click="configTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <section v-show="configTab === 'basics'" class="side-block">
          <h2>
            <Icon name="layout" :size="15" />
            布局预设
          </h2>
          <div class="layout-grid">
            <button
              v-for="item in LAYOUTS"
              :key="item.id"
              class="layout-card"
              :class="{ active: config.layout.mode === item.id }"
              type="button"
              :disabled="!canConfigWrite"
              @click="setLayout(item.id)"
            >
              <span class="layout-glyph" :data-layout="item.id" aria-hidden="true">
                <svg v-if="item.id === 'sphere'" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="9" />
                  <ellipse cx="16" cy="16" rx="9" ry="3.5" />
                  <ellipse cx="16" cy="16" rx="3.5" ry="9" />
                </svg>
                <svg v-else-if="item.id === 'carousel'" viewBox="0 0 32 32" fill="none">
                  <path d="M6 20c4-8 16-8 20 0" />
                  <path d="M8 16c3.4-5 13-5 16 0" />
                  <circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="13" r="1.5" fill="currentColor" stroke="none" />
                  <circle cx="23" cy="18" r="1.5" fill="currentColor" stroke="none" />
                </svg>
                <svg v-else-if="item.id === 'helix'" viewBox="0 0 32 32" fill="none">
                  <path d="M11 7c6 2 6 6 0 8s-6 6 0 8" />
                  <path d="M21 7c-6 2-6 6 0 8s6 6 0 8" />
                </svg>
                <svg v-else-if="item.id === 'spiral'" viewBox="0 0 32 32" fill="none">
                  <path d="M16 16c6 0 8-4 8-7s-3-6-8-6-9 3-9 8 4 10 10 10 8-3 8-7" />
                </svg>
                <svg v-else-if="item.id === 'random'" viewBox="0 0 32 32" fill="none">
                  <circle cx="10" cy="11" r="2.2" fill="currentColor" stroke="none" />
                  <circle cx="22" cy="9" r="1.6" fill="currentColor" stroke="none" />
                  <circle cx="24" cy="20" r="2" fill="currentColor" stroke="none" />
                  <circle cx="13" cy="22" r="1.7" fill="currentColor" stroke="none" />
                  <circle cx="17" cy="15" r="1.4" fill="currentColor" stroke="none" />
                </svg>
                <svg v-else viewBox="0 0 32 32" fill="none">
                  <rect x="8" y="8" width="16" height="16" rx="2" />
                  <rect x="12" y="12" width="8" height="8" rx="1" />
                </svg>
              </span>
              <span>{{ item.label }}</span>
            </button>
          </div>
        </section>

        <section v-show="configTab === 'basics'" class="side-block">
          <h2>
            <Icon name="sparkles" :size="15" />
            一键氛围
          </h2>
          <div class="preset-grid">
            <button
              v-for="preset in ATMOSPHERE_PRESETS"
              :key="preset.name"
              class="preset-mini"
              :class="{ active: config.presetName === preset.name }"
              type="button"
              :disabled="!canConfigWrite"
              @click="applyPreset(preset.name)"
            >
              <strong>{{ preset.label }}</strong>
              <small>{{ preset.hint }}</small>
            </button>
          </div>
        </section>

        <section v-show="configTab === 'atmosphere'" class="side-block">
          <h2>
            <Icon name="sparkles" :size="15" />
            氛围
          </h2>

          <label class="field-label">主色调</label>
          <div class="swatches">
            <button
              v-for="color in ACCENTS"
              :key="color"
              class="swatch"
              :class="{ active: accent === color }"
              type="button"
              :style="{ background: color }"
              :aria-label="color"
              :disabled="!canConfigWrite"
              @click="setAccent(color)"
            />
          </div>

          <label class="field-label">背景模式</label>
          <div class="chip-row">
            <button
              v-for="item in BG_TYPES"
              :key="item.id"
              class="chip"
              :class="{ active: config.background.type === item.id }"
              type="button"
              :disabled="!canConfigWrite"
              @click="setBackgroundType(item.id)"
            >
              {{ item.label }}
            </button>
          </div>

          <template v-if="config.background.type === 'sky'">
            <label class="field-label">天穹主题</label>
            <div class="chip-row">
              <button
                v-for="item in SKY_THEMES"
                :key="item.id"
                class="chip"
                :class="{ active: config.background.sky.theme === item.id }"
                type="button"
                :disabled="!canConfigWrite"
                @click="setSkyTheme(item.id)"
              >
                {{ item.label }}
              </button>
            </div>
          </template>

          <div class="slider-row">
            <Icon name="sun" :size="15" />
            <div class="slider-copy">
              <span>光照强度</span>
              <strong>{{ lightLevel }}%</strong>
            </div>
          </div>
          <input
            v-model.number="lightLevel"
            class="range"
            type="range"
            min="8"
            max="100"
            :disabled="!canConfigWrite"
            @input="onAtmosphereInput"
          />

          <div class="toggle-row">
            <div class="slider-row">
              <Icon name="zap" :size="15" />
              <span>辉光 Bloom</span>
            </div>
            <label class="switch">
              <input v-model="bloomOn" type="checkbox" :disabled="!canConfigWrite" @change="onAtmosphereInput" />
              <span></span>
            </label>
          </div>
          <template v-if="bloomOn">
            <div class="slider-row">
              <div class="slider-copy">
                <span>辉光半径</span>
                <strong>{{ bloomRadius }}%</strong>
              </div>
            </div>
            <input
              v-model.number="bloomRadius"
              class="range"
              type="range"
              min="10"
              max="100"
              :disabled="!canConfigWrite"
              @input="onAtmosphereInput"
            />
            <div class="slider-row">
              <div class="slider-copy">
                <span>辉光阈值</span>
                <strong>{{ bloomThreshold }}%</strong>
              </div>
            </div>
            <input
              v-model.number="bloomThreshold"
              class="range"
              type="range"
              min="5"
              max="60"
              :disabled="!canConfigWrite"
              @input="onAtmosphereInput"
            />
          </template>

          <div class="toggle-row">
            <div class="slider-row">
              <Icon name="volume" :size="15" />
              <span>环境音效</span>
            </div>
            <label class="switch">
              <input v-model="audioOn" type="checkbox" :disabled="!canConfigWrite" @change="onAtmosphereInput" />
              <span></span>
            </label>
          </div>

          <div class="slider-row">
            <Icon name="cloud" :size="15" />
            <div class="slider-copy">
              <span>空间雾化</span>
              <strong>{{ fogLevel }}%</strong>
            </div>
          </div>
          <input
            v-model.number="fogLevel"
            class="range"
            type="range"
            min="0"
            max="80"
            :disabled="!canConfigWrite"
            @input="onAtmosphereInput"
          />
          <label class="field-label">雾的颜色</label>
          <div class="swatches">
            <button
              v-for="color in FOG_COLORS"
              :key="color"
              class="swatch"
              :class="{ active: fogColor === color }"
              type="button"
              :style="{ background: color }"
              :aria-label="color"
              :disabled="!canConfigWrite"
              @click="setFogColor(color)"
            />
          </div>
        </section>

        <section v-show="configTab === 'advanced'" class="side-block">
          <h2>
            <Icon name="star" :size="15" />
            粒子特效
          </h2>
          <div class="toggle-row">
            <span class="field-inline">启用粒子</span>
            <label class="switch">
              <input
                type="checkbox"
                :checked="config.particles.enabled"
                :disabled="!canConfigWrite"
                @change="setParticlesEnabled(($event.target as HTMLInputElement).checked)"
              />
              <span></span>
            </label>
          </div>
          <div class="chip-row particle-chips">
            <button
              v-for="item in PARTICLE_TYPES"
              :key="item.id"
              class="chip"
              :class="{ active: config.particles.types.includes(item.id) }"
              type="button"
              :disabled="!canConfigWrite"
              @click="toggleParticleType(item.id)"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="slider-row">
            <div class="slider-copy">
              <span>粒子密度</span>
              <strong>{{ Number(config.particles.density || 1).toFixed(1) }}</strong>
            </div>
          </div>
          <input
            v-model.number="config.particles.density"
            class="range"
            type="range"
            min="0.2"
            max="2"
            step="0.1"
            :disabled="!canConfigWrite || !config.particles.enabled"
            @input="onAtmosphereInput"
          />
        </section>

        <section v-show="configTab === 'advanced'" class="side-block">
          <h2>
            <Icon name="grid" :size="15" />
            纹理
          </h2>
          <label class="field-label">地面材质</label>
          <select v-model="floorMaterial" class="select" :disabled="!canConfigWrite" @change="scheduleAutoSave">
            <option v-for="item in FLOOR_OPTIONS" :key="item" :value="item">{{ item }}</option>
          </select>
          <label class="field-label">墙面材质</label>
          <select v-model="wallMaterial" class="select" :disabled="!canConfigWrite" @change="scheduleAutoSave">
            <option v-for="item in WALL_OPTIONS" :key="item" :value="item">{{ item }}</option>
          </select>
        </section>

        <section v-show="configTab === 'history'" class="side-block">
          <h2>
            <Icon name="clock" :size="15" />
            版本历史
          </h2>
          <ul v-if="displayVersions.length" class="history">
            <li v-for="version in displayVersions" :key="version.id">
              <button class="history-row" type="button" @click="version.current ? null : requestRollback(version.id)">
                <span>
                  <strong>{{ version.title }}</strong>
                  <em>v{{ version.versionNumber }}</em>
                </span>
                <small>{{ formatHistoryTime(version.createdAt) }}</small>
              </button>
            </li>
          </ul>
          <p v-else class="history-empty">还没有可回滚的历史版本。</p>
        </section>
      </aside>

      <section class="preview-pane" aria-label="3D 实时预览">
        <div v-if="!previewLive" class="preview-empty">
          <p>{{ previewEmptyText }}</p>
          <div class="preview-empty-actions">
            <button v-if="embedTimedOut" class="btn outline" type="button" @click="retryEmbedPreview">重试连接</button>
            <button v-if="gallerySlug" class="btn solid" type="button" @click="openLivePreview">新窗口打开</button>
          </div>
        </div>

        <iframe
          v-if="showPreviewFrame"
          :key="previewKey"
          ref="previewIframeRef"
          class="live-preview"
          :class="{ 'is-ready': previewLive }"
          :src="previewUrl"
          title="展厅实时预览"
          allow="autoplay; fullscreen"
        ></iframe>

        <div class="preview-tools">
          <button class="glass-btn" type="button" @click="openLivePreview">
            <Icon name="external" :size="14" />
            <span>新窗口预览</span>
          </button>
          <button class="glass-btn" type="button" @click="isFullscreen = !isFullscreen">
            <Icon name="maximize" :size="14" />
            <span>{{ isFullscreen ? '退出全屏' : '全屏' }}</span>
          </button>
        </div>
      </section>
    </div>

    <ConfirmModal
      :show="showPublishConfirm"
      title="同步到访客端"
      message="确定将当前展厅配置同步到访客端吗？访客将立即看到最新的空间布局与氛围。"
      confirm-text="确认同步"
      :loading="publishing"
      @confirm="publishDraft"
      @cancel="showPublishConfirm = false"
    />

    <ConfirmModal
      :show="showRollbackConfirm"
      title="确认回滚配置版本"
      message="确定将历史版本恢复为当前草稿吗？访客端在你再次同步前不会改变。"
      confirm-text="确认回滚"
      :loading="rollingBack"
      @confirm="rollbackDraft"
      @cancel="showRollbackConfirm = false"
    />

    <ConfirmModal
      :show="showResetConfirm"
      title="恢复默认配置"
      message="确定要将当前展厅配置重置为系统初始预设吗？"
      confirm-text="确认重置"
      danger
      :loading="resetting"
      @confirm="confirmReset"
      @cancel="showResetConfirm = false"
    />
  </div>
</template>

<style scoped>
.config-page {
  position: relative;
  min-height: 100dvh;
  color: #111827;
  --accent: #9fe8c8;
  --light: 0.72;
  --fog: 0.35;
}

.config-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: #eef6f1;
  background-image: url('/hall-bg.png');
  background-size: cover;
  background-position: center;
}

.config-nav,
.config-split,
.config-state {
  position: relative;
  z-index: 1;
}

.config-nav {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin: 14px 18px 0;
  padding: 12px 22px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.07);
}

.config-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: center;
  padding: 4px;
  border-radius: 12px;
  background: #f3f4f6;
}

.config-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 650;
  color: #6b7280;
}

.config-tab.is-active {
  color: #047857;
  background: #fff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 750;
  color: #111827;
}

.fold-mark svg {
  width: 28px;
  height: 28px;
}

.nav-title h1 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.nav-title p {
  margin-top: 1px;
  font-size: 12px;
  color: #9ca3af;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.autosave {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
  color: #00b88f;
  font-size: 12px;
  font-weight: 650;
}

.autosave.is-warn {
  color: #b45309;
}

.history-empty {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.state-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 650;
}

.btn.ghost {
  color: #6b7280;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.btn.outline {
  color: #00b88f;
  background: #fff;
  border: 1px solid #00b88f;
}

.btn.solid {
  color: #fff;
  background: #059669;
}

.config-state {
  width: min(720px, calc(100% - 40px));
  margin: 80px auto;
  padding: 40px;
  text-align: center;
  background: #fff;
  border-radius: 18px;
}

.config-split {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  margin: 16px 18px 18px;
  height: calc(100dvh - 110px);
}

.config-side {
  overflow: auto;
  padding: 18px 16px 22px;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.side-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 16px;
}

.side-tab {
  padding: 8px 6px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 12px;
  font-weight: 650;
  color: #6b7280;
}

.side-tab.active {
  color: #047857;
  border-color: #00b88f;
  background: #ecfdf5;
}

.side-block + .side-block {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #f3f4f6;
}

.side-block h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #111827;
  font-size: 14px;
  font-weight: 750;
}

.layout-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.layout-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px 8px;
  border-radius: 12px;
  border: 1px solid #eef0f2;
  background: #f8fafc;
  color: #6b7280;
  font-size: 12px;
  font-weight: 650;
}

.layout-card.active {
  background: #ecfdf5;
  border-color: #00b88f;
  color: #047857;
  box-shadow: 0 0 0 1px #00b88f;
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-mini {
  text-align: left;
  padding: 10px 10px 8px;
  border-radius: 12px;
  border: 1px solid #eef0f2;
  background: #f8fafc;
}

.preset-mini.active {
  background: #ecfdf5;
  border-color: #00b88f;
  box-shadow: 0 0 0 1px #00b88f;
}

.preset-mini strong {
  display: block;
  font-size: 12px;
  color: #111827;
}

.preset-mini small {
  color: #9ca3af;
  font-size: 10px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.particle-chips {
  margin-top: 10px;
}

.chip {
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #eef0f2;
  background: #f8fafc;
  color: #6b7280;
  font-size: 11px;
  font-weight: 650;
}

.chip.active {
  background: #ecfdf5;
  border-color: #00b88f;
  color: #047857;
}

.field-inline {
  color: #6b7280;
  font-size: 12px;
  font-weight: 650;
}

.layout-glyph {
  width: 42px;
  height: 32px;
  color: inherit;
}

.layout-glyph svg {
  width: 100%;
  height: 100%;
  stroke: currentColor;
  stroke-width: 1.6;
}

.field-label {
  display: block;
  margin: 10px 0 6px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 650;
}

.swatches {
  display: flex;
  gap: 8px;
}

.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.swatch.active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #00b88f;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  color: #6b7280;
  font-size: 12px;
}

.slider-copy {
  display: flex;
  flex: 1;
  justify-content: space-between;
}

.slider-copy strong {
  color: #00b88f;
  font-variant-numeric: tabular-nums;
}

.range {
  width: 100%;
  margin-top: 6px;
  accent-color: #00b88f;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.switch {
  position: relative;
  width: 40px;
  height: 22px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch span {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #d1d5db;
  transition: 0.2s ease;
}

.switch span::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background: #fff;
  transition: 0.2s ease;
}

.switch input:checked + span {
  background: #00b88f;
}

.switch input:checked + span::before {
  transform: translateX(18px);
}

.select {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font-size: 13px;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 4px;
  text-align: left;
}

.history-row strong {
  font-size: 13px;
}

.history-row em {
  margin-left: 6px;
  color: #9ca3af;
  font-style: normal;
  font-size: 11px;
}

.history-row small {
  color: #9ca3af;
  font-size: 11px;
}

.history-more {
  margin-top: 8px;
  color: #00b88f;
  font-size: 12px;
  font-weight: 650;
}

.preview-pane {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  box-shadow: 0 16px 40px rgba(15, 40, 28, 0.1);
}

.preview-empty {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  place-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
  background: #eef6f1;
  color: #6b7280;
  font-size: 13px;
}

.preview-empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
}

.live-preview {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  opacity: 0;
  pointer-events: none;
}

.live-preview.is-ready {
  opacity: 1;
  pointer-events: auto;
  background: #0b1220;
}

.preview-tools {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  display: flex;
  gap: 8px;
}

.glass-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.82);
  color: #374151;
  font-size: 12px;
  font-weight: 650;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
}

.config-page.is-full .config-nav,
.config-page.is-full .config-side {
  display: none;
}

.config-page.is-full .config-split {
  grid-template-columns: 1fr;
  margin: 0;
  height: 100dvh;
}

.config-page.is-full .preview-pane {
  border-radius: 0;
}

@media (max-width: 980px) {
  .config-split {
    grid-template-columns: 1fr;
    height: auto;
  }
  .preview-pane {
    min-height: 520px;
  }
}
</style>
