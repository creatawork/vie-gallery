<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ShareLinkStatus, ViewerConfigVersion } from '@vie/gallery-contracts'
import { RECOMMENDED_SCENE_PRESET, SCENE_PRESETS } from '@vie/gallery-contracts'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import { useGalleryWorkspace, type WorkspacePhoto } from '../composables/useGalleryWorkspace'
import { useUploadTasks, type UploadTask } from '../composables/useUploadTasks'
import { usePublishCenter } from '../composables/usePublishCenter'
import { useConfigVersionMetadata } from '../composables/useConfigVersionMetadata'
import { useModalFocus } from '../composables/useModalFocus'
import { apiFetch } from '../api'
import { openCreatorPreview } from '../lib/preview'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'
import QuickStylePicker from '../components/gallery-workspace/QuickStylePicker.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import LightboxModal from '../components/LightboxModal.vue'
import GalleryUploadDropzone from '../components/gallery-workspace/GalleryUploadDropzone.vue'
import GalleryPhotoGrid from '../components/gallery-workspace/GalleryPhotoGrid.vue'
import GalleryPhotoCard from '../components/gallery-workspace/GalleryPhotoCard.vue'
import GalleryPhotoList from '../components/gallery-workspace/GalleryPhotoList.vue'
import UploadTaskCenter from '../components/gallery-workspace/UploadTaskCenter.vue'
import PublishCenterPanel from '../components/gallery-workspace/PublishCenterPanel.vue'
import ShareDeliveryPanel from '../components/gallery-workspace/ShareDeliveryPanel.vue'
import VersionMetadataFields from '../components/gallery-config/VersionMetadataFields.vue'

type LightboxPhoto = Omit<WorkspacePhoto, 'title'> & { title?: string }

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser, loading: authLoading, can, userDisplayName, userInitial, isOwner, logout, clearUser } = useAuth()
const canPhotoWrite = can('PHOTO_WRITE')
const canPublish = can('PUBLISH')
const canShareManage = can('SHARE_MANAGE')
const canConfig = can('CONFIG_WRITE')
const galleryId = computed(() => String(route.params.id || ''))
const workspace = useGalleryWorkspace(galleryId, computed(() => !!currentUser.value && !authLoading.value))
const taskCenter = useUploadTasks(
  galleryId,
  computed(() => !!currentUser.value && !authLoading.value && !!workspace.gallery.value),
  { onIdle: () => workspace.reload() }
)
const publishCenter = usePublishCenter(
  galleryId,
  computed(() => !!currentUser.value && !authLoading.value && !!workspace.gallery.value)
)
const versionMetadata = useConfigVersionMetadata()
const showPublishMetadata = ref(false)
const styleSaving = ref(true)
const styleLoaded = ref(false)
const publishingFlow = ref(false)

const photoViewMode = ref<'grid' | 'list'>('grid')
const photoGridRef = ref<{ clearSelection: () => void } | null>(null)
const photoListRef = ref<{ clearSelection: () => void } | null>(null)
const dropzoneRef = ref<{ chooseFiles: () => void } | null>(null)
const failedUploadFiles = ref<File[]>([])
const userMenuOpen = ref(false)
const showLightbox = ref(false)
const lightboxPhotoId = ref<string | null>(null)
const photoToDelete = ref<Pick<WorkspacePhoto, 'id'> | null>(null)
const batchPhotoIdsToDelete = ref<string[]>([])
const showBatchDeleteModal = ref(false)
const deletingBatch = ref(false)
const showShortcutsModal = ref(false)
const showUnpublishModal = ref(false)
const showShareModal = ref(false)
const visitorAllowDownload = ref(false)
const previewOpening = ref(false)
const { root: shortcutsModalRoot } = useModalFocus(showShortcutsModal, {
  onEscape: () => { showShortcutsModal.value = false }
})

const lightboxPhotos = computed<LightboxPhoto[]>(() => workspace.photos.value.map(photo => ({
  ...photo,
  title: photo.title || undefined
})))
const lightboxIndex = computed(() => Math.max(0, lightboxPhotos.value.findIndex(photo => photo.id === lightboxPhotoId.value)))

function selectLightboxPhoto(index: number) {
  const photo = lightboxPhotos.value[index]
  if (photo) lightboxPhotoId.value = photo.id
}

const hallDescription = computed(() => {
  const gallery = workspace.gallery.value
  if (!gallery) return ''
  return gallery.status === 'PUBLISHED'
    ? '展厅已上线。上传照片、调整配置后，可通过分享链接邀请访客。'
    : '展厅尚未上线。按下方步骤上传照片、选择风格，再发布展厅。'
})

const workflowStep = computed(() => {
  const gallery = workspace.gallery.value
  if (!gallery) return 1
  if (gallery.status === 'PUBLISHED') return 4
  if (workspace.photos.value.length > 0 && !styleLoaded.value) return 2
  if (workspace.photos.value.length > 0) return 3
  return 1
})

const recommendedSceneLabel = SCENE_PRESETS.find(item => item.name === RECOMMENDED_SCENE_PRESET)?.label ?? '星空夜曲'
const DISMISS_KEY = computed(() => `vie-publish-nudge-dismissed:${galleryId.value}`)
const dismissedPublishNudge = ref(false)
try { dismissedPublishNudge.value = !!sessionStorage.getItem(DISMISS_KEY.value) } catch { dismissedPublishNudge.value = false }

function dismissPublishNudge() {
  dismissedPublishNudge.value = true
  try { sessionStorage.setItem(DISMISS_KEY.value, '1') } catch { /* Storage is optional. */ }
}

type PublishNudge =
  | { kind: 'processing' }
  | { kind: 'failed'; count: number }
  | { kind: 'ready' }

const publishNudge = computed<PublishNudge | null>(() => {
  const gallery = workspace.gallery.value
  if (!gallery || gallery.status === 'PUBLISHED' || !canPublish.value || dismissedPublishNudge.value) return null
  if (gallery.photoCount === 0) return null
  if ((gallery.processingCount ?? 0) > 0) return { kind: 'processing' }
  if ((gallery.failedPhotoCount ?? 0) > 0) return { kind: 'failed', count: gallery.failedPhotoCount ?? 0 }
  return { kind: 'ready' }
})

function formatCreatedAt(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

watch(() => workspace.error.value, (err) => {
  if (err?.kind === 'unauthorized') {
    clearUser()
    router.push({ name: 'overview' })
  }
})

// 切换视图时清空多选，避免把网格的选中状态带进列表。
watch(photoViewMode, () => {
  photoGridRef.value?.clearSelection()
  photoListRef.value?.clearSelection()
})

// 上传进行中关闭/刷新页面时给出浏览器级提醒。
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!workspace.uploading.value) return
  event.preventDefault()
  event.returnValue = '照片正在上传，离开将中断上传。'
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleWorkspaceKeydown)
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleWorkspaceKeydown)
})

// ---- 键盘快捷键（输入框聚焦或弹窗打开时跳过） ----
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
}

function handleWorkspaceKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || isTypingTarget(event.target) || showShareModal.value || showBatchDeleteModal.value || showUnpublishModal.value || showPublishMetadata.value) return
  if (event.metaKey || event.ctrlKey || event.altKey) return

  if (event.key === 'Escape') {
    showShortcutsModal.value = false
    userMenuOpen.value = false
    return
  }
  if (showLightbox.value || photoToDelete.value || showShortcutsModal.value) return

  const key = event.key.toLowerCase()
  if (key === 'u' && canPhotoWrite.value) {
    event.preventDefault()
    dropzoneRef.value?.chooseFiles()
  } else if (key === 'g') {
    photoViewMode.value = 'grid'
  } else if (key === 'l') {
    photoViewMode.value = 'list'
  } else if (key === '?') {
    event.preventDefault()
    showShortcutsModal.value = !showShortcutsModal.value
  }
}

function goToOverview() {
  router.push({ name: 'overview' })
}

function goToConfig() {
  router.push({ name: 'gallery-config', params: { id: galleryId.value } })
}

function focusWorkflowSection(id: string) {
  const section = document.getElementById(id)
  section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  section?.focus({ preventScroll: true })
}

async function openViewer() {
  const gallery = workspace.gallery.value
  if (!gallery || previewOpening.value) return
  previewOpening.value = true
  try {
    await openCreatorPreview(gallery.id, gallery.slug)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '暂时无法打开内部预览，请稍后重试。')
  } finally {
    previewOpening.value = false
  }
}

function openLightbox(index: number) {
  selectLightboxPhoto(index)
  showLightbox.value = true
}

async function handleLogout() {
  await logout()
  toast.info('已安全退出登录')
  router.push('/')
}

async function handlePublish() {
  if (!canPublish.value) return
  await handlePublishAll()
}

function openPublishMetadata() {
  if (!canPublish.value || styleSaving.value || !styleLoaded.value || workspace.uploading.value || publishCenter.publishing.value) return
  versionMetadata.reset()
  showPublishMetadata.value = true
}

async function handlePublishAll() {
  if (!canPublish.value || styleSaving.value || publishingFlow.value || publishCenter.publishing.value) return
  publishingFlow.value = true
  try {
    await publishCenter.loadReadiness()
    if (publishCenter.error.value) {
      toast.error(publishCenter.error.value)
      return
    }
    if (!publishCenter.readiness.value || publishCenter.readiness.value.blockers.length) {
      toast.warning(publishCenter.readiness.value?.blockers[0]?.message || '发布状态尚未确认，请刷新后重试。')
      return
    }
    versionMetadata.reset()
    await confirmPublishAll()
  } finally {
    publishingFlow.value = false
  }
}

async function confirmPublishAll() {
  if (!canPublish.value || !versionMetadata.valid.value) return
  try {
    await publishCenter.publishAll(versionMetadata.toRequest())
    await workspace.reload()
    showPublishMetadata.value = false
    versionMetadata.reset()
    toast.success('展厅已发布，把这一刻分享出去。')
    if (canShareManage.value) await openShareModal()
  } catch (error) {
    if (publishCenter.appliedConfigVersion.value) {
      showPublishMetadata.value = false
      versionMetadata.reset()
    }
    toast.error(error instanceof Error ? error.message : '发布失败，请重试。')
  }
}

function promptUnpublish() {
  if (!isOwner.value) return
  showUnpublishModal.value = true
}

async function confirmUnpublish() {
  showUnpublishModal.value = false
  try {
    await publishCenter.unpublish()
    await workspace.reload()
    toast.success('已撤回发布，展厅已恢复为草稿状态。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '撤回发布失败。')
  }
}

async function handleUpload(files: FileList | File[]) {
  if (!canPhotoWrite.value) return
  const selected = Array.from(files)
  const batchId = taskCenter.rememberLocal(selected)
  try {
    const summary = await workspace.uploadFiles(files, {
      batchId,
      onQueued: () => taskCenter.load(true)
    })
    await taskCenter.load(true)
    const failedFiles = summary.results.filter(result => !result.ok)
    if (failedFiles.length) {
      failedUploadFiles.value = failedFiles.map(result => result.file)
      toast.actionable({
        type: 'warning',
        message: `已加入队列 ${summary.succeeded} 张，${failedFiles.length} 张上传失败（${failedFiles[0]?.message || '网络异常'}）。`,
        duration: 10000,
        action: { label: '重试失败项', handler: () => void handleRetryFailedUploads() }
      })
    } else if (summary.succeeded > 0) {
      toast.success(`已加入队列 ${summary.succeeded} 张照片，正在后台处理。`)
    }
  } catch (error) {
    taskCenter.forgetLocalBatch(batchId)
    await taskCenter.load(true)
    toast.error(error instanceof Error ? error.message : '照片上传失败，请重试。')
  }
}

async function handleRetryFailedUploads() {
  if (!canPhotoWrite.value || !failedUploadFiles.value.length) return
  const retrying = failedUploadFiles.value
  failedUploadFiles.value = []
  await handleUpload(retrying)
}

function handleInvalidSelection(detail: { message: string; count: number }) {
  toast.warning(`${detail.message}。`)
}

async function handleRetryTask(task: UploadTask) {
  if (!canPhotoWrite.value) return
  try {
    await taskCenter.retry(task)
    await workspace.reload()
    toast.success('任务已重新排队。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '任务重试失败。')
  }
}

async function handleCancelTask(task: UploadTask) {
  if (!canPhotoWrite.value) return
  try {
    await taskCenter.cancel(task)
    toast.success('已取消任务。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '取消任务失败。')
  }
}

async function handleSetCover(photo: Pick<WorkspacePhoto, 'id'>) {
  if (!canPhotoWrite.value) return
  try {
    await workspace.setCover(photo)
    toast.success('已设为封面。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '设置封面失败。')
  }
}

function promptDeletePhoto(photo: Pick<WorkspacePhoto, 'id'>) {
  if (!canPhotoWrite.value) return
  photoToDelete.value = photo
}

function promptBatchDelete(ids: string[]) {
  if (!canPhotoWrite.value || !ids.length) return
  batchPhotoIdsToDelete.value = ids
  showBatchDeleteModal.value = true
}

async function confirmBatchDelete() {
  if (!batchPhotoIdsToDelete.value.length || deletingBatch.value) return
  deletingBatch.value = true
  try {
    const { succeeded, failed } = await workspace.deletePhotos(batchPhotoIdsToDelete.value)
    showBatchDeleteModal.value = false
    photoGridRef.value?.clearSelection()
    if (failed === 0) {
      toast.success(`成功从展厅移除 ${succeeded} 张照片。`)
    } else {
      toast.warning(`已移除 ${succeeded} 张照片，${failed} 张操作失败。`)
    }
    batchPhotoIdsToDelete.value = []
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '批量删除失败。')
  } finally {
    deletingBatch.value = false
  }
}

async function handleUpdatePhotoTitle(payload: { photo: { id: string }; title: string }) {
  if (!canPhotoWrite.value) return
  try {
    await workspace.updatePhotoTitle(payload.photo.id, payload.title)
    toast.success('照片标题已更新。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '更新照片标题失败。')
  }
}

async function handleMovePhoto(payload: { id: string; direction: 'up' | 'down' }) {
  if (!canPhotoWrite.value) return
  try {
    await workspace.movePhoto(payload.id, payload.direction)
    toast.success('照片排序已更新。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '调整照片排序失败。')
  }
}

function handleListOpen(photo: WorkspacePhoto) {
  const index = workspace.photos.value.findIndex(item => item.id === photo.id)
  if (index !== -1) openLightbox(index)
}

async function handleReorder(payload: { fromIndex: number; toIndex: number }) {
  if (!canPhotoWrite.value) return
  const ids = workspace.photos.value.map(photo => photo.id)
  const { fromIndex, toIndex } = payload
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) return
  const [moved] = ids.splice(fromIndex, 1)
  if (moved === undefined) return
  ids.splice(toIndex, 0, moved)
  try {
    await workspace.reorderPhotos(ids)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '调整照片排序失败。')
  }
}

async function handleRetryFailedGrid() {
  if (!canPhotoWrite.value) return
  // Find failed tasks or retryable tasks in taskCenter
  const failedTasks = taskCenter.tasks.value.filter(t => t.status === 'FAILED' && t.retryable)
  if (!failedTasks.length) {
    toast.info('暂无可重试的后台处理任务。')
    return
  }
  let successCount = 0
  for (const task of failedTasks) {
    try {
      await taskCenter.retry(task)
      successCount++
    } catch {
      // Continue retrying others
    }
  }
  if (successCount > 0) {
    await workspace.reload()
    toast.success(`已为 ${successCount} 个失败项重新排队。`)
  } else {
    toast.error('重试失败项失败，请检查网络后重试。')
  }
}

interface PendingPhotoDeletion {
  photo: WorkspacePhoto
  index: number
  timer: number
}

let pendingPhotoDeletion: PendingPhotoDeletion | null = null

function flushPendingPhotoDeletion() {
  const pending = pendingPhotoDeletion
  if (!pending) return
  window.clearTimeout(pending.timer)
  pendingPhotoDeletion = null
  workspace.deletePhoto(pending.photo.id).catch(() => {
    toast.error('删除照片失败，请刷新后重试。')
    workspace.reload()
  })
}

function undoPhotoDeletion() {
  const pending = pendingPhotoDeletion
  if (!pending) return
  window.clearTimeout(pending.timer)
  pendingPhotoDeletion = null
  workspace.restorePhotoLocally(pending.photo, pending.index)
  toast.success('已撤销删除。')
}

async function confirmDeletePhoto() {
  const target = photoToDelete.value
  if (!target) return
  const index = workspace.photos.value.findIndex(photo => photo.id === target.id)
  const photo = index === -1 ? undefined : workspace.photos.value[index]
  if (!photo) {
    photoToDelete.value = null
    return
  }
  photoToDelete.value = null
  showLightbox.value = false

  // 已有等待中的删除先立即执行，避免多次确认互相覆盖。
  flushPendingPhotoDeletion()

  // 乐观移除 + 8 秒撤销窗口，超时才真正调用删除接口（防误删安全网）。
  workspace.removePhotoLocally(target.id)
  const timer = window.setTimeout(() => {
    pendingPhotoDeletion = null
    workspace.deletePhoto(target.id).catch(() => {
      toast.error('删除照片失败，请刷新后重试。')
      workspace.reload()
    })
  }, 8000)
  pendingPhotoDeletion = { photo, index, timer }
  toast.actionable({
    type: 'info',
    message: `已删除「${photo.title || '未命名照片'}」，8 秒内可撤销。`,
    duration: 8000,
    action: { label: '撤销', handler: undoPhotoDeletion }
  })
}

async function loadGalleryConfig() {
  const gId = galleryId.value
  if (!gId) return
  visitorAllowDownload.value = false
  try {
    const res = await apiFetch(`/api/galleries/${gId}/viewer-config`)
    if (!res.ok) return
    const data = await res.json() as {
      configJson?: string
      publishedVersionId?: string | null
      publishedConfigJson?: string | null
    }
    // Prefer published snapshot so share panel matches what visitors see
    if (data.publishedConfigJson) {
      const parsed = JSON.parse(data.publishedConfigJson) as { visitorAllowDownload?: boolean }
      visitorAllowDownload.value = !!parsed.visitorAllowDownload
      return
    }
    if (data.publishedVersionId) {
      const versionRes = await apiFetch(`/api/galleries/${gId}/viewer-config/versions/${data.publishedVersionId}`)
      if (!versionRes.ok) return
      const published = await versionRes.json() as ViewerConfigVersion
      if (published?.configJson) {
        const parsed = JSON.parse(published.configJson) as { visitorAllowDownload?: boolean }
        visitorAllowDownload.value = !!parsed.visitorAllowDownload
      }
      return
    }
    // No published config yet — visitors do not get download
    visitorAllowDownload.value = false
  } catch {
    visitorAllowDownload.value = false
  }
}

async function openShareModal() {
  if (!canShareManage.value) return
  const gallery = workspace.gallery.value
  if (!gallery) return
  await loadGalleryConfig()
  showShareModal.value = true
}

async function reloadGalleryAccess() {
  await workspace.reload()
  await publishCenter.loadReadiness()
}
</script>

<template>
  <div class="hall-page">
    <div class="hall-scene" aria-hidden="true"></div>

    <div v-if="authLoading" class="hall-state">正在验证登录状态…</div>
    <div v-else-if="!currentUser" class="hall-state">
      <h1>请先登录</h1>
      <button class="btn btn-primary" type="button" @click="goToOverview">返回登录</button>
    </div>

    <template v-else>
      <header class="hall-nav">
        <RouterLink to="/" class="brand">
          <BrandMark :size="28" />
          <span>阳光明媚</span>
        </RouterLink>

        <nav class="hall-tabs">
          <RouterLink to="/" class="hall-tab">
            <Icon name="layout" :size="15" />
            <span>我的空间</span>
          </RouterLink>
          <span class="hall-tab is-active">
            <Icon name="gallery" :size="15" />
            <span>展厅工作区</span>
          </span>
          <RouterLink v-if="isOwner" to="/members" class="hall-tab">
            <Icon name="users" :size="15" />
            <span>成员管理</span>
          </RouterLink>
        </nav>

        <div class="hall-user">
          <button class="user-chip" type="button" @click="userMenuOpen = !userMenuOpen">
            <span class="avatar">{{ userInitial }}</span>
            <span class="user-meta">
              <strong>{{ userDisplayName }}</strong>
              <em>{{ isOwner ? '创作者' : '成员' }}</em>
            </span>
            <Icon name="chevron-down" :size="14" />
          </button>
          <div v-if="userMenuOpen" class="user-menu">
            <RouterLink v-if="isOwner" to="/members">成员管理</RouterLink>
            <button type="button" @click="handleLogout">退出登录</button>
          </div>
        </div>
      </header>

      <div v-if="workspace.loading.value" class="hall-state">正在加载展厅…</div>
      <div v-else-if="workspace.error.value" class="hall-state">
        <h1>加载展厅失败</h1>
        <p>{{ workspace.error.value.message }}</p>
        <div class="state-actions">
          <button class="btn btn-secondary" type="button" @click="goToOverview">返回空间列表</button>
          <button class="btn btn-primary" type="button" @click="workspace.reload">重新加载</button>
        </div>
      </div>

      <div v-else-if="workspace.gallery.value" class="hall-body">
        <section class="hall-hero">
          <div class="hero-left">
            <button class="back-btn" type="button" aria-label="返回" @click="goToOverview">
              <Icon name="arrow-left" :size="16" />
            </button>
            <div>
              <div class="title-row">
                <h1>{{ workspace.gallery.value.name }}</h1>
                <span class="vis-pill" :class="workspace.gallery.value.visibility === 'PUBLIC' ? 'is-public' : 'is-private'">
                  {{ workspace.gallery.value.visibility === 'PUBLIC' ? '公开' : workspace.gallery.value.visibility === 'PASSWORD' ? '密码保护' : '私密' }}
                </span>
                <span class="vis-pill" :class="workspace.gallery.value.status === 'PUBLISHED' ? 'is-public' : 'is-private'">
                  {{ workspace.gallery.value.status === 'PUBLISHED' ? '已发布' : '草稿' }}
                </span>
              </div>
              <p>{{ hallDescription }}</p>
              <ol class="workflow-steps" aria-label="展厅上线步骤">
                <li :class="{ done: workspace.photos.value.length > 0, current: workflowStep === 1 }">
                  <button type="button" @click="focusWorkflowSection('workspace-photos')" :aria-current="workflowStep === 1 ? 'step' : undefined"><span>1</span><div><strong>整理作品</strong><small>上传与排序</small></div></button>
                </li>
                <li :class="{ done: styleLoaded, current: workflowStep === 2 }">
                  <button type="button" @click="focusWorkflowSection('workspace-style')" :aria-current="workflowStep === 2 ? 'step' : undefined"><span>2</span><div><strong>选择风格</strong><small>塑造展示空间</small></div></button>
                </li>
                <li :class="{ done: workspace.gallery.value.status === 'PUBLISHED', current: workflowStep === 3 }">
                  <button type="button" @click="focusWorkflowSection('workspace-publish')" :aria-current="workflowStep === 3 ? 'step' : undefined"><span>3</span><div><strong>发布分享</strong><small>邀请访客进入</small></div></button>
                </li>
              </ol>
              <div class="meta-row">
                <span>创建于 {{ formatCreatedAt(workspace.gallery.value.createdAt) }}</span>
                <span>{{ workspace.photos.value.length }} 张照片</span>
              </div>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn outline" type="button" :disabled="previewOpening" @click="openViewer">
              <Icon name="eye" :size="15" />
              <span>{{ previewOpening ? '正在打开…' : '预览展厅' }}</span>
            </button>
            <button v-if="canConfig" class="btn outline" type="button" @click="goToConfig">
              <Icon name="settings" :size="15" />
              <span>展示设计</span>
            </button>
            <button
              v-if="canPublish && workspace.gallery.value.status !== 'PUBLISHED'"
              class="btn outline"
              type="button"
              @click="focusWorkflowSection('workspace-publish')"
            >
              <Icon name="send" :size="15" />
              <span>前往发布</span>
            </button>
            <button
              v-else-if="canShareManage && workspace.gallery.value.status === 'PUBLISHED'"
              class="btn solid"
              type="button"
              @click="openShareModal"
            >
              <Icon name="send" :size="15" />
              <span>分享</span>
            </button>
          </div>
        </section>

        <section v-if="publishNudge" class="publish-nudge" :class="`is-${publishNudge.kind}`" role="status">
          <template v-if="publishNudge.kind === 'processing'">
            <span>照片处理中，全部就绪后即可发布展厅。</span>
          </template>
          <template v-else-if="publishNudge.kind === 'failed'">
            <span>有 {{ publishNudge.count }} 张照片处理失败，重试成功后即可发布。可在下方任务中心重试。</span>
          </template>
          <template v-else>
            <div class="nudge-copy">
              <strong>照片已就绪</strong>
              <span>选择展示风格，预览满意后即可发布。</span>
            </div>
            <div class="nudge-actions">
              <button class="btn ghost" type="button" @click="focusWorkflowSection('workspace-publish')">查看发布检查 <Icon name="arrow-right" :size="14" /></button>
              <button class="btn outline" type="button" :disabled="previewOpening" @click="openViewer">先预览</button>
              <button v-if="canConfig" class="btn ghost" type="button" @click="goToConfig">调整场景</button>
            </div>
          </template>
          <button class="nudge-close" type="button" aria-label="暂不发布，关闭提示" @click="dismissPublishNudge">×</button>
        </section>

        <div class="hall-split">
          <div class="workspace-main">
          <section id="workspace-photos" class="photo-panel" tabindex="-1">
            <div class="photo-toolbar">
              <div><h2>照片管理 <span class="photo-total">{{ workspace.photos.value.length }}</span></h2><p class="section-description">拖动排序，选择封面。</p></div>
              <div class="photo-tools">
                <button v-if="canPhotoWrite" class="btn solid" type="button" :disabled="workspace.uploading.value" @click="dropzoneRef?.chooseFiles()"><Icon name="upload" :size="15" /><span>{{ workspace.uploading.value ? '正在上传…' : '上传照片' }}</span></button>
                <div class="view-toggle">
                  <button class="view-btn" :class="{ active: photoViewMode === 'grid' }" type="button" aria-label="网格视图" title="网格视图（G）" @click="photoViewMode = 'grid'">
                    <Icon name="grid" :size="14" />
                  </button>
                  <button class="view-btn" :class="{ active: photoViewMode === 'list' }" type="button" aria-label="列表视图" title="列表视图（L）" @click="photoViewMode = 'list'">
                    <Icon name="list" :size="14" />
                  </button>
                  <button class="view-btn" type="button" aria-label="键盘快捷键" title="键盘快捷键（?）" @click="showShortcutsModal = true">
                    <span class="shortcut-mark">?</span>
                  </button>
                </div>
              </div>
            </div>

            <div v-if="photoViewMode === 'grid'" class="photo-grid-wrapper">
              <GalleryPhotoGrid
                ref="photoGridRef"
                :photos="workspace.photos.value"
                :can-write="canPhotoWrite"
                @reorder="handleReorder"
                @open="openLightbox"
                @set-cover="handleSetCover"
                @delete="promptDeletePhoto"
                @batch-delete="promptBatchDelete"
                @move-photo="handleMovePhoto"
                @retry-failed="handleRetryFailedGrid"
              >
                <template #dropzone>
                  <GalleryUploadDropzone
                    v-if="canPhotoWrite"
                    ref="dropzoneRef"
                    :uploading="workspace.uploading.value"
                    :progress="workspace.uploadProgress.value"
                    :status-text="workspace.uploadStatusText.value"
                    @files="handleUpload"
                    @invalid="handleInvalidSelection"
                  />
                </template>
              </GalleryPhotoGrid>
            </div>
            <div v-else class="photo-list">
              <GalleryUploadDropzone
                v-if="canPhotoWrite"
                ref="dropzoneRef"
                class="list-dropzone"
                :uploading="workspace.uploading.value"
                :progress="workspace.uploadProgress.value"
                :status-text="workspace.uploadStatusText.value"
                @files="handleUpload"
                @invalid="handleInvalidSelection"
              />
              <GalleryPhotoList
                ref="photoListRef"
                :photos="workspace.photos.value"
                :can-write="canPhotoWrite"
                @open="handleListOpen"
                @set-cover="handleSetCover"
                @delete="promptDeletePhoto"
                @batch-delete="promptBatchDelete"
                @move-photo="handleMovePhoto"
                @reorder="handleReorder"
                @update-title="handleUpdatePhotoTitle"
                @retry-failed="handleRetryFailedGrid"
              />
              <p v-if="!workspace.photos.value.length && !canPhotoWrite" class="list-empty">还没有照片。</p>
            </div>
          </section>
          <div id="workspace-style" tabindex="-1"><QuickStylePicker :key="galleryId" :gallery-id="galleryId" :can-write="canConfig && !publishingFlow" :photos="workspace.photos.value" @busy="styleSaving = $event" @ready="styleLoaded = $event" @saved="publishCenter.loadReadiness" /></div>
          </div>

          <div class="workspace-sidebar">
            <section id="workspace-publish" class="publish-section" tabindex="-1">
            <PublishCenterPanel
              :gallery="workspace.gallery.value"
              :readiness="publishCenter.readiness.value"
              :loading="publishCenter.loading.value"
              :publishing="publishCenter.publishing.value || publishingFlow"
              :busy="styleSaving || !styleLoaded || workspace.uploading.value"
              :error="publishCenter.error.value"
              :unpublishing="publishCenter.unpublishing.value"
              :can-publish="canPublish"
              :can-config="canConfig"
              :can-share="canShareManage"
              :is-owner="isOwner"
              @publish="handlePublishAll"
              @unpublish="promptUnpublish"
              @preview="openViewer"
              @open-config="goToConfig"
              @refresh="publishCenter.loadReadiness"
              @open-share="openShareModal"
              @edit-metadata="openPublishMetadata"
            />
            </section>

            <details class="publishing-details" :open="workspace.uploading.value || taskCenter.summary.value.queued > 0 || taskCenter.summary.value.processing > 0 || taskCenter.summary.value.failed > 0">
            <summary>上传进度与记录</summary>
            <UploadTaskCenter
              :tasks="taskCenter.tasks.value"
              :summary="taskCenter.summary.value"
              :loading="taskCenter.loading.value"
              :refreshing="taskCenter.refreshing.value"
              :error="taskCenter.error.value"
              :can-write="canPhotoWrite"
              :filter="taskCenter.filter.value"
              @update:filter="taskCenter.filter.value = $event"
              @refresh="taskCenter.load(true)"
              @retry="handleRetryTask"
              @cancel="handleCancelTask"
            />
            </details>
          </div>
        </div>

        <footer class="hall-footer">© 2026 阳光明媚</footer>
      </div>
    </template>

    <ShareDeliveryPanel
      :show="showShareModal"
      :gallery="workspace.gallery.value"
      :is-owner="isOwner"
      :can-manage="canShareManage"
      :visitor-allow-download="visitorAllowDownload"
      @close="showShareModal = false"
      @open-config="goToConfig"
      @gallery-updated="reloadGalleryAccess"
    />

    <ConfirmModal
      :show="showPublishMetadata"
      title="发布展厅配置"
      message="系统会自动分配配置版本编号。名称和备注仅用于管理，不会影响访客看到的照片。"
      confirm-text="确认发布"
      :loading="publishCenter.publishing.value"
      @confirm="confirmPublishAll"
      @cancel="showPublishMetadata = false; versionMetadata.reset()"
    >
      <VersionMetadataFields
        v-model:title="versionMetadata.title.value"
        v-model:note="versionMetadata.note.value"
        :disabled="publishCenter.publishing.value"
        :error="versionMetadata.error.value"
      />
    </ConfirmModal>

    <ConfirmModal
      :show="showUnpublishModal"
      title="确认撤回展厅发布？"
      message="撤回后，访客将无法再公开访问此展厅，已生成的公开链接将暂时失效。"
      confirm-text="确认撤回"
      danger
      :loading="publishCenter.unpublishing.value"
      @confirm="confirmUnpublish"
      @cancel="showUnpublishModal = false"
    />

    <ConfirmModal
      :show="!!photoToDelete"
      title="确认删除此照片？"
      message="删除后该照片将从展厅中移除，此操作不可撤销。"
      confirm-text="确认删除"
      danger
      @confirm="confirmDeletePhoto"
      @cancel="photoToDelete = null"
    />

    <ConfirmModal
      :show="showBatchDeleteModal"
      title="确认批量删除选中的照片？"
      :message="`将从展厅移除选中的 ${batchPhotoIdsToDelete.length} 张照片，此操作不可撤销。`"
      confirm-text="确认删除"
      danger
      :loading="deletingBatch"
      @confirm="confirmBatchDelete"
      @cancel="showBatchDeleteModal = false"
    />

    <LightboxModal
      :show="showLightbox"
      :photos="lightboxPhotos"
      :current-index="lightboxIndex"
      :can-write="canPhotoWrite"
      @close="showLightbox = false"
      @select="selectLightboxPhoto"
      @set-cover="handleSetCover"
      @delete="promptDeletePhoto"
      @update-title="handleUpdatePhotoTitle"
      @move-up="handleMovePhoto({ id: $event.id, direction: 'up' })"
      @move-down="handleMovePhoto({ id: $event.id, direction: 'down' })"
    />

    <Transition name="modal-fade">
      <div v-if="showShortcutsModal" class="shortcuts-backdrop" @click.self="showShortcutsModal = false">
        <div ref="shortcutsModalRoot" class="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabindex="-1">
          <div class="shortcuts-head">
            <h2 id="shortcuts-title">键盘快捷键</h2>
            <button class="shortcuts-close" type="button" aria-label="关闭" @click="showShortcutsModal = false">
              <Icon name="x" :size="16" />
            </button>
          </div>
          <ul class="shortcut-list">
            <li><kbd>U</kbd><span>打开文件选择上传照片</span></li>
            <li><kbd>Ctrl</kbd> + <kbd>V</kbd><span>粘贴剪贴板图片直接上传</span></li>
            <li><kbd>G</kbd><span>切换到网格视图</span></li>
            <li><kbd>L</kbd><span>切换到列表视图</span></li>
            <li><kbd>←</kbd> <kbd>→</kbd><span>灯箱中切换上一张 / 下一张</span></li>
            <li><kbd>Esc</kbd><span>关闭菜单 / 灯箱 / 弹窗</span></li>
            <li><kbd>?</kbd><span>显示本帮助</span></li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hall-page {
  min-height:100dvh;
  color:var(--text-primary);
  background:var(--bg-app)
}

.hall-scene {
  display:none
}

.hall-nav {
  display:grid;
  grid-template-columns:auto 1fr auto;
  align-items:center;
  gap:24px;
  width:min(1400px,calc(100% - 80px));
  margin:auto;
  min-height:84px;
  border-bottom:1px solid var(--border-strong)
}

.brand {
  display:inline-flex;
  align-items:center;
  gap:10px;
  font-size:14px;
  font-weight:750;
  letter-spacing:.04em
}

.hall-tabs {
  display:flex;
  justify-content:center;
  gap:8px
}

.hall-tab {
  display:inline-flex;
  align-items:center;
  gap:7px;
  padding:12px 16px;
  border-radius:8px;
  color:var(--text-secondary);
  font-size:13px
}

.hall-tab.is-active {
  color:var(--brand-deep);
  background:var(--mint-soft)
}

.hall-user {
  position:relative
}

.user-chip {
  display:flex;
  align-items:center;
  gap:9px;
  min-height:44px;
  border-radius:8px
}

.avatar {
  display:grid;
  place-items:center;
  width:34px;
  height:34px;
  border-radius:50%;
  background:var(--brand-accent);
  color:white;
  font-size:12px;
  font-weight:700
}

.user-meta {
  display:grid;
  gap:2px;
  text-align:left
}

.user-meta strong {
  font-size:13px
}

.user-meta em {
  font-size:11px;
  font-style:normal;
  color:var(--text-secondary)
}

.user-menu {
  position:absolute;
  top:calc(100% + 8px);
  right:0;
  z-index:20;
  min-width:150px;
  padding:6px;
  border:1px solid var(--border-strong);
  border-radius:10px;
  background:var(--bg-surface);
  box-shadow:var(--shadow-lg)
}

.user-menu a,.user-menu button {
  display:block;
  width:100%;
  min-height:40px;
  padding:10px;
  text-align:left;
  font-size:13px;
  border-radius:6px
}

.user-menu a:hover,.user-menu button:hover {
  background:var(--mint-soft)
}

.hall-body {
  width:min(1400px,calc(100% - 80px));
  margin:auto;
  padding:24px 0
}

.hall-hero {
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  gap:16px;
  padding-bottom:20px
}

.hero-left {
  display:flex;
  flex:1;
  min-width:300px;
  gap:14px
}

.hero-left>div {
  min-width:0;
  flex:1
}

.back-btn {
  width:36px;
  min-width:36px;
  height:36px;
  display:grid;
  place-items:center;
  border:1px solid var(--border-strong);
  border-radius:8px;
  color:var(--text-secondary);
  background:var(--bg-surface)
}

.title-row {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px
}

.title-row h1 {
  max-width:100%;
  margin-right:4px;
  font-size:clamp(25px,3vw,34px);
  font-weight:650;
  line-height:1.3;
  letter-spacing:-.04em;
  overflow-wrap:anywhere
}

.vis-pill {
  display:inline-flex;
  align-items:center;
  min-height:24px;
  padding:3px 8px;
  font-size:11px;
  font-weight:600;
  border:1px solid var(--border-strong);
  border-radius:5px;
  background:var(--bg-surface);
  color:var(--text-secondary)
}

.vis-pill.is-public {
  background:var(--mint-soft);
  color:var(--brand-deep);
  border-color:transparent
}

.hero-left p {
  margin-top:10px;
  color:var(--text-secondary);
  font-size:13px;
  line-height:1.7
}

.meta-row {
  display:flex;
  flex-wrap:wrap;
  gap:14px;
  margin-top:14px;
  font-size:11px;
  color:var(--text-tertiary);
  font-variant-numeric:tabular-nums
}

.hero-actions {
  display:flex;
  flex-wrap:wrap;
  align-content:flex-start;
  gap:8px;
  padding-top:2px
}

.btn {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  min-height:40px;
  padding:9px 14px;
  border-radius:8px;
  font-size:13px;
  font-weight:600;
  box-shadow:none;
  transition:background .18s,color .18s,border-color .18s
}

.btn.outline,.btn.btn-secondary {
  border:1px solid var(--border-strong);
  color:var(--text-primary);
  background:var(--bg-surface)
}

.btn.ghost {
  color:var(--text-secondary);
  background:transparent
}

.btn.solid,.btn.btn-primary {
  color:white;
  background:var(--brand-accent)
}

.btn:hover:not(:disabled) {
  transform:none;
  box-shadow:none
}

.btn.outline:hover:not(:disabled),.btn.ghost:hover:not(:disabled) {
  background:var(--mint-soft);
  color:var(--brand-deep)
}

.btn.solid:hover:not(:disabled) {
  background:var(--brand-deep)
}

.btn:disabled {
  cursor:not-allowed;
  opacity:.55
}

.workflow-steps {
  display:flex;
  gap:0;
  margin:12px 0 0;
  padding:0;
  list-style:none
}

.workflow-steps li {
  position:relative;
  flex:1;
  min-width:145px;
  padding:0;
  animation:none;
  background:none;
  box-shadow:none
}

.workflow-steps li::before,.workflow-steps li::after,.workflow-steps::before {
  display:none
}

.workflow-steps button {
  display:flex;
  align-items:center;
  gap:10px;
  width:100%;
  min-height:44px;
  padding:4px 18px 4px 0;
  color:var(--text-secondary);
  text-align:left;
  border-radius:8px
}

.workflow-steps button:hover {
  color:var(--brand-deep)
}

.workflow-steps button>span {
  display:grid;
  place-items:center;
  min-width:30px;
  height:30px;
  border:1px solid var(--border-strong);
  border-radius:50%;
  background:var(--bg-app);
  font-size:12px;
  font-variant-numeric:tabular-nums;
  box-shadow:none;
  animation:none
}

.workflow-steps button>span::after,.workflow-steps button>span::before {
  display:none
}

.workflow-steps button>div {
  display:grid;
  gap:3px
}

.workflow-steps strong {
  font-size:13px;
  font-weight:600
}

.workflow-steps small {
  font-size:11px;
  color:var(--text-tertiary)
}

.workflow-steps li.done button>span {
  color:var(--brand-deep);
  border-color:var(--brand-accent);
  background:var(--mint-soft)
}

.workflow-steps li.current button>span {
  background:var(--brand-accent);
  border-color:var(--brand-accent);
  color:white
}

.workflow-steps li.current strong {
  color:var(--brand-deep)
}

.publish-nudge {
  display:flex;
  flex-wrap:wrap;
  justify-content:space-between;
  align-items:center;
  position:relative;
  gap:14px;
  margin:0 0 24px;
  padding:16px 42px 16px 20px;
  border:1px solid var(--border-strong);
  border-left:3px solid var(--brand-accent);
  border-radius:10px;
  background:var(--bg-surface);
  color:var(--text-secondary);
  font-size:13px
}

.publish-nudge.is-processing {
  border-left-color:#9b701f
}

.publish-nudge.is-failed {
  border-left-color:#b7443d
}

.nudge-copy {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:6px 14px
}

.nudge-copy strong {
  color:var(--text-primary);
  font-weight:600
}

.nudge-actions {
  display:flex;
  flex-wrap:wrap;
  gap:6px
}

.nudge-close {
  position:absolute;
  right:4px;
  top:7px;
  width:36px;
  height:36px;
  color:var(--text-secondary);
  font-size:22px;
  border-radius:6px
}

.hall-split {
  display:grid;
  grid-template-columns:minmax(0,1fr) 312px;
  gap:24px;
  align-items:start
}

.workspace-main {
  display:grid;
  min-width:0;
  gap:24px
}

.photo-panel {
  padding:24px;
  min-width:0;
  border:1px solid var(--border-strong);
  border-radius:12px;
  background:var(--bg-surface)
}

.photo-toolbar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  margin-bottom:22px
}

.photo-tools { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px }

.photo-toolbar h2 {
  display:flex;
  align-items:center;
  gap:10px;
  margin:0;
  font-size:21px;
  font-weight:650;
  letter-spacing:-.03em
}

.photo-total {
  font-size:13px;
  color:var(--text-secondary);
  font-weight:500
}

.section-kicker {
  font-size:10px;
  letter-spacing:.12em;
  color:var(--brand-deep)
}

.section-description {
  color:var(--text-secondary);
  font-size:12px;
  margin-top:7px;
  line-height:1.6
}

.view-toggle {
  display:flex;
  border:1px solid var(--border-strong);
  padding:3px;
  border-radius:8px;
  background:var(--bg-app)
}

.view-btn {
  display:grid;
  place-items:center;
  width:34px;
  height:34px;
  color:var(--text-secondary);
  border-radius:5px
}

.view-btn.active {
  background:var(--bg-surface);
  color:var(--brand-deep);
  box-shadow:var(--shadow-xs)
}

.shortcut-mark {
  font-size:14px
}

.photo-grid-wrapper,.photo-list {
  min-width:0
}

.list-dropzone {
  margin-bottom:20px
}

.list-empty {
  padding:40px;
  text-align:center;
  color:var(--text-secondary);
  font-size:14px
}

.workspace-sidebar {
  display:grid;
  gap:20px;
  min-width:0;
  position:sticky;
  top:24px
}

.publishing-details {
  border:1px solid var(--border-strong);
  border-radius:12px;
  background:var(--bg-surface)
}

.publishing-details summary {
  padding:16px;
  cursor:pointer;
  font-size:13px;
  font-weight:600;
  color:var(--text-secondary)
}

.publishing-details[open] summary {
  border-bottom:1px solid var(--border-strong)
}

.publish-section,#workspace-style,.photo-panel {
  scroll-margin-top:24px;
  outline:none
}

.publish-section:focus-visible,#workspace-style:focus-visible,.photo-panel:focus-visible {
  outline:2px solid var(--brand-accent);
  outline-offset:5px
}

.hall-footer {
  margin-top:40px;
  padding-top:20px;
  border-top:1px solid var(--border-strong);
  font-size:11px;
  color:var(--text-tertiary)
}

.hall-state {
  width:min(600px,calc(100% - 40px));
  margin:80px auto;
  padding:40px;
  text-align:center;
  border:1px solid var(--border-strong);
  border-radius:12px;
  background:var(--bg-surface)
}

.hall-state h1 {
  font-size:24px;
  margin-bottom:12px
}

.hall-state p {
  color:var(--text-secondary);
  font-size:14px
}

.state-actions {
  display:flex;
  justify-content:center;
  gap:10px;
  margin-top:20px
}

.shortcuts-backdrop {
  position:fixed;
  inset:0;
  z-index:1000;
  background:rgba(20,31,25,.45);
  display:grid;
  place-items:center;
  padding:20px
}

.shortcuts-modal {
  width:min(480px,100%);
  padding:24px;
  border-radius:12px;
  background:var(--bg-surface);
  box-shadow:var(--shadow-xl)
}

.shortcuts-head {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:20px
}

.shortcuts-head h2 {
  font-size:18px;
  font-weight:650
}

.shortcuts-close {
  width:40px;
  height:40px;
  display:grid;
  place-items:center;
  border-radius:8px;
  background:var(--bg-app)
}

.shortcut-list {
  display:grid;
  gap:14px;
  list-style:none
}

.shortcut-list li {
  display:flex;
  align-items:center;
  gap:8px;
  font-size:13px;
  color:var(--text-secondary)
}

.shortcut-list kbd {
  min-width:26px;
  padding:4px 7px;
  text-align:center;
  border:1px solid var(--border-strong);
  border-radius:5px;
  font-size:12px
}

.shortcut-list span {
  margin-left:8px
}

.hall-page button:focus-visible,.hall-page a:focus-visible {
  outline:2px solid var(--brand-accent);
  outline-offset:3px
}

@media(max-width:1100px) {
  .hall-nav,.hall-body {
    width:calc(100% - 48px)
  }
  .hall-split {
    grid-template-columns:minmax(0,1fr) 290px;
    gap:20px
  }
  .photo-panel {
    padding:20px
  }
  .hero-actions {
    width:100%;
    padding-left:50px
  }
  .workflow-steps {
    max-width:660px
  }
}

@media(max-width:900px) {
  .hall-split {
    grid-template-columns:minmax(0,1fr)
  }
  .workspace-sidebar {
    position:static;
    grid-template-columns:minmax(0,1fr) minmax(0,1fr);
    align-items:start
  }
  .hall-nav {
    gap:14px
  }
  .hall-tab {
    padding:10px
  }
  .brand {
    font-size:12px
  }
}

@media(max-width:640px) {
  .hall-nav,.hall-body {
    width:calc(100% - 32px)
  }
  .hall-nav {
    grid-template-columns:1fr auto;
    min-height:72px
  }
  .hall-tabs {
    grid-column:1/-1;
    grid-row:2;
    justify-content:flex-start;
    padding-bottom:12px
  }
  .hall-user {
    grid-column:2;
    grid-row:1
  }
  .hall-tab {
    min-height:40px
  }
  .user-meta,.user-chip>:last-child {
    display:none
  }
  .hall-body {
    padding-top:24px
  }
  .hero-left {
    min-width:0;
    width:100%
  }
  .hero-left p {
    font-size:12px
  }
  .title-row h1 {
    font-size:25px
  }
  .hero-actions {
    padding-left:0;
    gap:6px
  }
  .hero-actions .btn {
    flex:1;
    min-width:100px;
    font-size:12px;
    padding:9px
  }
  .workflow-steps {
    margin-left:-50px;
    margin-top:20px
  }
  .workflow-steps li {
    min-width:0
  }
  .workflow-steps button {
    gap:7px;
    padding-right:6px
  }
  .workflow-steps button>span {
    min-width:26px;
    height:26px
  }
  .workflow-steps strong {
    font-size:12px
  }
  .workflow-steps small {
    display:none
  }
  .photo-panel {
    padding:18px 14px
  }
  .photo-toolbar {
    gap:8px
  }
  .photo-toolbar h2 {
    font-size:19px
  }
  .section-description {
    max-width:210px
  }
  .view-btn {
    width:30px;
    height:34px
  }
  .workspace-sidebar {
    grid-template-columns:minmax(0,1fr)
  }
  .publish-nudge {
    padding-left:14px
  }
  .nudge-actions {
    gap:0
  }
  .nudge-actions .btn {
    min-height:36px;
    padding:7px;
    font-size:12px
  }
  .hall-footer {
    margin-top:28px
  }
}

@media(prefers-reduced-motion:reduce) {
  *,*::before,*::after {
    scroll-behavior:auto;
    transition:none!important;
    animation:none!important
  }
}
</style>
