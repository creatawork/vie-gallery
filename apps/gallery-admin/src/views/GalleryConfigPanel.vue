<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import type { Gallery } from '@vie/gallery-contracts'
import { useToast } from '../composables/useToast'
import { useViewerConfigEditor } from '../composables/useViewerConfigEditor'
import { createViewerPreviewChannel } from '../lib/viewerPreviewChannel'
import { createRecommendedViewerConfig, isViewerPreset, parseViewerConfig, serializeViewerConfig, type PresetName } from '@vie/gallery-contracts'
import LayoutControls from '../components/gallery-config/LayoutControls.vue'
import AtmosphereControls from '../components/gallery-config/AtmosphereControls.vue'
import MotionQualityControls from '../components/gallery-config/MotionQualityControls.vue'
import PresetCards from '../components/gallery-config/PresetCards.vue'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import { useAuth } from '../composables/useAuth'
import { creatorPreviewUrl, issuePreviewToken, openCreatorPreview } from '../lib/preview'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { can } = useAuth()
const canConfigWrite = can('CONFIG_WRITE')
const galleryId = route.params.id as string

interface ConfigVersionItem {
  id: string
  configJson?: string
  presetName?: string | null
  versionNumber?: number
  title?: string
  createdAt?: string
  createdByUserId?: string | null
}


const loading = ref(true)
const configLoaded = ref(false)
const editor = useViewerConfigEditor(galleryId, { canWrite: () => canConfigWrite.value })
const { config, issues, saving, savedJson: savedDraftJson } = editor
const galleryInfo = ref<Gallery | null>(null)
const showResetConfirm = ref(false)
const showPublishConfirm = ref(false)
const showRollbackConfirm = ref(false)
const publishing = ref(false)
const hasServerDraft = ref(false) // 服务端是否已有草稿配置行（决定发布前是否需要强制保存）
const rollingBack = ref(false)
const rollbackVersionId = ref<string | null>(null)
const versions = ref<ConfigVersionItem[]>([])
const publishedVersionId = ref<string | null>(null)
const lastPublishedAt = ref<string | null>(null)
const publishedConfigJson = ref<string | null>(null)
const previewKey = ref(0)

const lastSavedLabel = ref('')
const lastSaveFailed = ref(false)
const loadError = ref('')
const isFullscreen = ref(false)
const previewIframeRef = ref<HTMLIFrameElement | null>(null)
const previewLive = ref(false)
const embedTimedOut = ref(false)
const previewLoadingSlow = ref(false)
const previewToken = ref('')
const previewIssueError = ref('')
let previewRequestVersion = 0
let handshakeTimer: number | null = null
let previewSlowTimer: number | null = null
const PREVIEW_PROGRESS_MS = 8000
const PREVIEW_TIMEOUT_MS = 30000
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
  if (previewSlowTimer) {
    window.clearTimeout(previewSlowTimer)
    previewSlowTimer = null
  }
  previewLoadingSlow.value = false
}

function startHandshakeTimer() {
  clearHandshakeTimer()
  if (!showPreviewFrame.value) return
  previewSlowTimer = window.setTimeout(() => {
    if (!previewLive.value) previewLoadingSlow.value = true
  }, PREVIEW_PROGRESS_MS)
  handshakeTimer = window.setTimeout(() => {
    if (!previewLive.value) {
      previewLoadingSlow.value = false
      embedTimedOut.value = true
    }
  }, PREVIEW_TIMEOUT_MS)
}

function resetPreviewDeadline() {
  if (previewLive.value) return
  if (handshakeTimer) window.clearTimeout(handshakeTimer)
  handshakeTimer = window.setTimeout(() => {
    previewLoadingSlow.value = false
    embedTimedOut.value = true
  }, PREVIEW_TIMEOUT_MS)
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

function getCleanConfig() { return config.value }
function canonicalConfig(json: string): string { return serializeViewerConfig(parseViewerConfig(json, 1, 'legacy').config) }
// 历史版本可能携带当前解析器拒绝的旧 schema（如 background.type 形态），
// 规范化失败只影响"是否已同步"的比对，不能让整个配置面板挂掉。
function tryCanonicalConfig(json: string | null | undefined): string | null {
  if (!json) return null
  try {
    return canonicalConfig(json)
  } catch {
    return null
  }
}
let previewChannel: ReturnType<typeof createViewerPreviewChannel> | null = null
function refreshLivePreview(force = false) {
  if (issues.value.length) return
  previewChannel?.send(config.value, { force })
}
watch(previewIframeRef, iframe => {
  previewChannel?.dispose(); previewChannel = null
  if (!iframe) { clearHandshakeTimer(); return }
  previewChannel = createViewerPreviewChannel(iframe, message => {
    clearHandshakeTimer()
    embedTimedOut.value = false
    previewLive.value = true
    if (message.error) toast.error('预览应用失败，请重试')
  }, bootstrapped => {
    clearHandshakeTimer()
    embedTimedOut.value = false
    previewLive.value = bootstrapped
  }, () => {
    previewLive.value = false
    startHandshakeTimer()
  }, resetPreviewDeadline)
  if (configLoaded.value) refreshLivePreview()
}, { flush: 'post' })

async function retryEmbedPreview() {
  const version = ++previewRequestVersion
  embedTimedOut.value = false
  previewLive.value = false
  previewIssueError.value = ''
  try {
    const result = await issuePreviewToken(galleryId)
    if (version !== previewRequestVersion) return
    previewToken.value = result.token
  } catch (cause) {
    if (version !== previewRequestVersion) return
    previewToken.value = ''
    previewIssueError.value = cause instanceof Error ? cause.message : '暂时无法打开内部预览，请稍后重试。'
    return
  }
  previewKey.value += 1
  if (showPreviewFrame.value) startHandshakeTimer()
}

const hasDraftChanges = editor.dirty
const hasUnpublishedDraft = computed(() => !publishedVersionId.value || publishedConfigJson.value !== savedDraftJson.value)
const publishedVersionNumber = computed(() => versions.value.find(version => version.id === publishedVersionId.value)?.versionNumber ?? null)
const draftStatus = computed(() => {
  if (saving.value) return { tone: 'busy', text: '正在保存草稿…' }
  if (issues.value.length) return { tone: 'warn', text: `有 ${issues.value.length} 项配置错误` }
  if (lastSaveFailed.value) return { tone: 'warn', text: '草稿保存失败，请重试' }
  if (hasDraftChanges.value) return { tone: 'warn', text: '有未保存的更改' }
  if (hasServerDraft.value) return { tone: 'ok', text: `草稿已保存 ${lastSavedLabel.value}`.trim() }
  return { tone: 'idle', text: '尚未保存到服务器' }
})
const publishStatus = computed(() => {
  if (!publishedVersionId.value) return { tone: 'idle', text: '尚未发布' }
  if (hasUnpublishedDraft.value) return { tone: 'warn', text: `线上是 v${publishedVersionNumber.value ?? '?'} · 草稿待同步` }
  return { tone: 'ok', text: `已发布 v${publishedVersionNumber.value ?? '?'}` }
})
const isGalleryPublished = computed(() => galleryInfo.value?.status === 'PUBLISHED')

const publishConfirmMessage = computed(() => isGalleryPublished.value
  ? '确定将当前展厅配置同步到访客端吗？访客将立即看到最新的空间布局与氛围。'
  : '将保存当前草稿、把配置同步为线上版本，并正式发布展厅。发布后可随时撤回。')

const displayVersions = computed(() => {
  return versions.value.slice(0, 10).map((version) => {
    const current = version.id === publishedVersionId.value
    return {
      ...version,
      current,
      title: current ? '当前线上版本' : (version.title || `历史版本 v${version.versionNumber ?? ''}`.trim())
    }
  })
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
  if (!previewToken.value) return '正在连接内部预览…'
  if (!canEmbedViewer.value) return '当前窗口无法嵌入预览，请用新窗口打开。'
  if (previewLoadingSlow.value) return '展厅正在载入，请稍候。'
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
  if (published?.configJson) publishedConfigJson.value = tryCanonicalConfig(published.configJson)
}

async function loadGalleryAndConfig() {
  loading.value = true
  configLoaded.value = false
  loadError.value = ''
  previewLive.value = false
  embedTimedOut.value = false
  previewLoadingSlow.value = false
  clearHandshakeTimer()
  lastSavedLabel.value = ''
  lastSaveFailed.value = false
  try {
    // These requests do not depend on each other. Start them together so the
    // preview can begin booting while the editor config is still in flight.
    const galleryRequest = apiFetch(`/api/galleries/${galleryId}`)
    const configRequest = apiFetch(`/api/galleries/${galleryId}/viewer-config`)
      .then(response => ({ response }), cause => ({ cause }))
    previewToken.value = ''
    void retryEmbedPreview()
    const gallRes = await galleryRequest
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
    galleryInfo.value = await gallRes.json() as Gallery
    // The configuration controls remain disabled until their server snapshot
    // arrives, while the iframe starts loading independently.
    loading.value = false

    const configResult = await configRequest
    if (!('response' in configResult)) throw configResult.cause
    const response = configResult.response
    if (response.ok) {
      const data = await response.json()
      if (data) {
        if (data.configJson) {
          editor.replace(data.configJson, false, data.schemaVersion ?? 1)
          if (data.presetName) config.value.presetName = data.presetName
        }
        publishedVersionId.value = data.publishedVersionId || null
        lastPublishedAt.value = data.lastPublishedAt || null
        publishedConfigJson.value = tryCanonicalConfig(data.publishedConfigJson) ?? (data.publishedVersionId ? null : serializeViewerConfig(getCleanConfig()))
      }
      savedDraftJson.value = serializeViewerConfig(getCleanConfig())
      hasServerDraft.value = true
      lastSavedLabel.value = formatClock(new Date())
      configLoaded.value = true
      previewChannel?.send(config.value)
      void loadVersions().catch(() => { versions.value = [] })
    } else if (response.status === 404) {
      // 新相册还没有配置行：直接以推荐场景（星空夜曲）作为草稿与预览起点。
      editor.replace(serializeViewerConfig(createRecommendedViewerConfig()), true)
      configLoaded.value = true
      previewChannel?.send(config.value)
    } else {
      loadError.value = '展厅配置加载失败，请稍后重试。'
    }
  } catch {
    loadError.value = '网络连接失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

function scheduleAutoSave() {
  if (!canConfigWrite.value || issues.value.length) {
    if (saveTimer) window.clearTimeout(saveTimer)
    return
  }
  refreshLivePreview()
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { saveTimer = null; void save({ silent: true }) }, 800)
}
function patchConfig(input: unknown) { editor.patch(input); scheduleAutoSave() }
function applyPreset(name: PresetName) { editor.preset(name); scheduleAutoSave() }
function resetPreset() { editor.resetPreset(); scheduleAutoSave() }

let saveQueue: Promise<boolean> = Promise.resolve(true)

/**
 * 串行化保存入口：自动保存与显式保存可能高频触发，
 * 按顺序排队发送（后一次执行时读取的是最新草稿），避免乱序覆盖。
 * 返回是否保存成功，供发布/回滚/离开守卫判定，不再"吞异常假成功"。
 */
function save(options?: { silent?: boolean }): Promise<boolean> {
  const run = () => doSave(options)
  const result = saveQueue.then(run, run)
  saveQueue = result.then(
    () => true,
    () => false
  )
  return result
}

async function doSave(options?: { silent?: boolean }): Promise<boolean> {
  if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null }
  const success = await editor.save()
  lastSaveFailed.value = !success
  if (success) {
    hasServerDraft.value = true
    lastSavedLabel.value = formatClock(new Date())
    refreshLivePreview()
    if (!options?.silent) toast.success('草稿已保存。')
  } else if (!options?.silent) toast.error(issues.value.length ? '请先修正配置字段错误。' : editor.error.value || '草稿未保存，请检查权限。')
  return success
}

async function publishDraft() {
  if (!canConfigWrite.value || issues.value.length || publishing.value) return
  // 发布前确保草稿已落库：草稿有改动、上次保存失败、或服务端从未有过草稿行时都先保存，
  // 否则 viewer-config/publish 会在后端因 CONFIG_NOT_FOUND 返回 404。
  if (hasDraftChanges.value || lastSaveFailed.value || !hasServerDraft.value) {
    const saved = await save({ silent: true })
    if (!saved) {
      showPublishConfirm.value = false
      toast.error('草稿尚未保存成功，请先重试保存再发布。')
      return
    }
  }
  if (hasDraftChanges.value) {
    toast.info('保存期间有新更改，请再次点击发布。')
    showPublishConfirm.value = false
    return
  }
  publishing.value = true
  try {
    const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1 })
    })
    if (!response.ok) throw new Error('配置同步失败，请稍后重试。')
    const version = await response.json()
    publishedVersionId.value = version.id || null
    publishedConfigJson.value = savedDraftJson.value
    lastPublishedAt.value = version.createdAt || new Date().toISOString()
    await loadVersions()
    if (!isGalleryPublished.value) {
      const publishResponse = await apiFetch(`/api/galleries/${galleryId}/publish`, { method: 'POST' })
      if (!publishResponse.ok) throw new Error('配置已同步，但展厅发布失败，请到展厅工作区重试。')
      if (galleryInfo.value) galleryInfo.value = { ...galleryInfo.value, status: 'PUBLISHED' }
      toast.success('展厅已发布！去展厅工作区获取分享链接。')
    } else {
      toast.success('配置已同步到访客端。')
    }
    showPublishConfirm.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '发布失败，请稍后重试')
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
      editor.replace(JSON.stringify(parsed))
      if (selected.presetName) config.value.presetName = selected.presetName
      const saved = await save({ silent: true })
      if (!saved) throw new Error('草稿保存失败，未完成回滚，请重试。')
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
    editor.replace(JSON.stringify(parsed))
    if (version.presetName) config.value.presetName = version.presetName
    savedDraftJson.value = serializeViewerConfig(getCleanConfig())
    await loadVersions()
    showRollbackConfirm.value = false
    rollbackVersionId.value = null
    refreshLivePreview()
    toast.success('已恢复为草稿。同步到访客端后才会生效。')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '回滚失败，请稍后重试')
  } finally {
    rollingBack.value = false
  }
}

async function confirmReset() {
  resetPreset()
  showResetConfirm.value = false
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

// 离开配置页时先补存草稿（自动保存有 800ms 防抖窗口，直接离开会丢改动）；
// 补存失败时由用户确认是否放弃。
onBeforeRouteLeave(async () => {
  if (!canConfigWrite.value) return true
  if (!hasDraftChanges.value && !lastSaveFailed.value && !issues.value.length) return true
  if (saveTimer) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  const saved = await save({ silent: true })
  if (saved) return true
  return window.confirm('展厅配置尚未保存成功，离开将丢失未保存的更改。确定离开？')
})

function handleConfigBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasDraftChanges.value && !lastSaveFailed.value && !issues.value.length) return
  event.preventDefault()
  event.returnValue = '展厅配置尚未保存，确定离开？'
}

onMounted(() => {
  loadGalleryAndConfig()

  window.addEventListener('beforeunload', handleConfigBeforeUnload)
})

onUnmounted(() => {
  previewRequestVersion += 1
  if (saveTimer) window.clearTimeout(saveTimer)
  previewChannel?.dispose()
  clearHandshakeTimer()
  window.removeEventListener('beforeunload', handleConfigBeforeUnload)
})
</script>

<template>
  <div class="config-page" :class="{ 'is-full': isFullscreen }">
    <div class="config-scene" aria-hidden="true"></div>

    <header class="config-nav">
      <RouterLink to="/" class="brand">
        <BrandMark :size="28" />
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
        <p role="status" class="status-chip" :class="`is-${draftStatus.tone}`"><span>{{ draftStatus.text }}</span></p>
        <p role="status" class="status-chip" :class="`is-${publishStatus.tone}`"><span>{{ publishStatus.text }}</span></p>
        <button v-if="canConfigWrite" class="btn ghost" type="button" @click="requestHeaderRollback">
          <Icon name="undo" :size="14" />
          <span>回滚</span>
        </button>
        <button v-if="canConfigWrite" class="btn ghost" type="button" :disabled="!configLoaded || !config.presetName || !isViewerPreset(config.presetName)" @click="showResetConfirm = true">
          <Icon name="refresh" :size="14" />
          <span>重置</span>
        </button>
        <button
          v-if="canConfigWrite && lastSaveFailed"
          class="btn outline"
          type="button"
          :disabled="!configLoaded || saving"
          @click="save()"
        >
          <span>{{ saving ? '保存中…' : '重试保存' }}</span>
        </button>
        <button v-if="canConfigWrite" class="btn outline" type="button" :disabled="!configLoaded || saving || !!issues.length" @click="save()">{{ saving ? '保存中…' : '保存草稿' }}</button>
        <button v-if="canConfigWrite" class="btn solid" type="button" :disabled="!configLoaded || publishing || saving || hasDraftChanges || lastSaveFailed || !!issues.length" @click="showPublishConfirm = true">
          <Icon name="send" :size="14" />
          <span>{{ publishing ? (isGalleryPublished ? '同步中…' : '发布中…') : (isGalleryPublished ? '同步到访客端' : '发布展厅') }}</span>
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
        <div class="side-heading"><span class="side-eyebrow">展厅设计</span><strong>让作品拥有自己的空间</strong><span>选择场景，细调每一束光</span></div>
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

        <div v-show="configTab === 'basics'"><LayoutControls :config="config" :issues="issues" :disabled="!canConfigWrite || !configLoaded" @patch="patchConfig" /></div>
        <div v-if="configTab === 'atmosphere'">
          <PresetCards :config="config" :disabled="!canConfigWrite || !configLoaded" @preset="applyPreset" @reset="resetPreset" />
          <p class="atmosphere-hint">选好场景即可发布；粒子、辉光、雾效等微调已收入「高级」。</p>
        </div>
        <div v-if="configTab === 'advanced'">
          <MotionQualityControls :config="config" :issues="issues" :disabled="!canConfigWrite || !configLoaded" @patch="patchConfig" />
          <AtmosphereControls :config="config" :issues="issues" :disabled="!canConfigWrite || !configLoaded" @patch="patchConfig" />
        </div>
        <p v-if="issues.length" class="config-errors" role="alert">有 {{ issues.length }} 项配置错误，请修正后保存。</p>

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
            <button v-if="embedTimedOut || previewIssueError" class="btn outline" type="button" @click="retryEmbedPreview">重试连接</button>
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
          <button v-if="previewLive" class="glass-btn" type="button" :disabled="!!issues.length" @click="refreshLivePreview(true)">重新应用</button>
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
      :title="isGalleryPublished ? '同步到访客端' : '发布展厅'"
      :message="publishConfirmMessage"
      :confirm-text="isGalleryPublished ? '确认同步' : '确认发布'"
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
      title="恢复当前预设"
      message="恢复当前预设的布局与效果？画质上限和下载设置会保留。"
      confirm-text="确认重置"
      danger
      @confirm="confirmReset"
      @cancel="showResetConfirm = false"
    />
  </div>
</template>

<style scoped>
.config-side :deep(.side-block) { padding: 16px 12px; border: 1px solid #e6ece8; border-radius: 14px; background: #fff; }
.config-side :deep(.side-block h2) { font-size: .9375rem; margin: 0 0 .75rem; }
.config-side :deep(.side-block + .side-block) { margin-top: 14px; }
.config-side button:focus-visible, .config-side :deep(button:focus-visible),
.config-side select:focus-visible, .config-side :deep(select:focus-visible),
.config-side input:focus-visible, .config-side :deep(input:focus-visible) { outline: 2px solid #19815c; outline-offset: 3px; }
.config-side :deep(button:disabled) { cursor: not-allowed; opacity: .65; }
.config-errors { color: #b91c1c; padding: 1rem; }

.config-page {
  position: relative;
  min-height: 100dvh;
  color: #111827;
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

.nav-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.status-chips-gap { display: none; }
.nav-actions { gap: 10px; }
.status-chip { display: inline-flex; align-items: center; min-height: 30px; margin: 0; padding: 4px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.status-chip.is-ok { background: #e7f4ee; color: #14624a; }
.status-chip.is-warn { background: #fdf3e2; color: #92600a; }
.status-chip.is-busy { background: #e8f0fb; color: #2b5cab; }
.status-chip.is-idle { background: #eef1f4; color: #5b6b78; }

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

.side-heading { display: flex; flex-direction: column; gap: 5px; padding: 0 4px; }
.side-eyebrow { color: #27805b; font-size: 10px; font-weight: 700; letter-spacing: 2px; }
.side-heading strong { color: #18372a; font-size: 17px; font-weight: 700; letter-spacing: -.4px; }
.side-heading > span:last-child { color: #6a7c71; font-size: 11px; }

.config-side {
  overflow: auto;
  padding: 22px 16px;
  background: #f7f9f8;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  scrollbar-width: thin;
  scrollbar-color: #bccdc4 transparent;
  box-shadow: 0 12px 36px rgba(15, 40, 28, 0.09);
}

.side-tabs {
  position: sticky;
  top: -22px;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 3px;
  padding: 5px;
  margin: 18px 0;
  border: 1px solid #e3eae6;
  border-radius: 13px;
  background: #edf2ef;
}

.side-tab {
  min-height: 36px;
  padding: 8px 4px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 12px;
  font-weight: 650;
  color: #5b6b63;
  transition: background .15s, color .15s;
}

.side-tab.active {
  color: #126547;
  border-color: #dde7e1;
  background: #fff;
  box-shadow: 0 2px 6px rgba(23, 62, 36, 0.06);
}

.side-block h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  color: #18372a;
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
  align-items: center;
  gap: 8px;
}

.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.swatch.active {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #00b88f;
}

.swatch:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.swatch-picker {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  cursor: pointer;
}

.swatch-picker:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.swatch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.swatch-label {
  flex-shrink: 0;
  color: #6b7280;
  font-size: 12px;
  font-weight: 650;
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
  margin: 0;
  padding: 0;
  list-style: none;
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
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: calc(100% - 32px);
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
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  grid-template-columns: 1fr !important;
  z-index: 9999;
}

.config-page.is-full .preview-pane {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  border-radius: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

.config-page.is-full .live-preview {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  inset: 0 !important;
}

@media (max-width: 980px) {
  .config-nav { grid-template-columns: 1fr; }
  .config-tabs { flex-wrap: wrap; justify-self: start; }
  .nav-actions { gap: .5rem; }
  .config-side { overflow: visible; }
  .config-split {
    grid-template-columns: 1fr;
    height: auto;
  }
  .preview-pane {
    height: 60dvh;
  }
}

/* 帮助提示图标 */
.help-tip {
  display: inline-block;
  margin-left: 4px;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  font-size: 11px;
  color: #64748b;
  border: 1px solid #64748b;
  border-radius: 50%;
  cursor: help;
  opacity: 0.6;
  font-style: normal;
}

.help-tip:hover {
  opacity: 1;
  color: #10b981;
  border-color: #10b981;
}

.atmosphere-hint { margin: 10px 2px 0; color: #6a7c71; font-size: .8125rem; }
</style>
