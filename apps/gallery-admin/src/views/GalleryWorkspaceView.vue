<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ShareLinkStatus } from '@vie/gallery-contracts'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import { useGalleryWorkspace, type WorkspacePhoto } from '../composables/useGalleryWorkspace'
import { useUploadTasks, type UploadTask } from '../composables/useUploadTasks'
import { usePublishCenter } from '../composables/usePublishCenter'
import { apiFetch } from '../api'
import { openCreatorPreview } from '../lib/preview'
import Icon from '../components/Icon.vue'
import BrandMark from '../components/BrandMark.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import LightboxModal from '../components/LightboxModal.vue'
import GalleryUploadDropzone from '../components/gallery-workspace/GalleryUploadDropzone.vue'
import GalleryPhotoGrid from '../components/gallery-workspace/GalleryPhotoGrid.vue'
import GalleryPhotoCard from '../components/gallery-workspace/GalleryPhotoCard.vue'
import GalleryPhotoList from '../components/gallery-workspace/GalleryPhotoList.vue'
import UploadTaskCenter from '../components/gallery-workspace/UploadTaskCenter.vue'
import PublishCenterPanel from '../components/gallery-workspace/PublishCenterPanel.vue'
import ShareDeliveryPanel from '../components/gallery-workspace/ShareDeliveryPanel.vue'

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

const photoViewMode = ref<'grid' | 'list'>('grid')
const photoGridRef = ref<{ clearSelection: () => void } | null>(null)
const photoListRef = ref<{ clearSelection: () => void } | null>(null)
const dropzoneRef = ref<{ chooseFiles: () => void } | null>(null)
const failedUploadFiles = ref<File[]>([])
const userMenuOpen = ref(false)
const showLightbox = ref(false)
const lightboxIndex = ref(0)
const photoToDelete = ref<Pick<WorkspacePhoto, 'id'> | null>(null)
const batchPhotoIdsToDelete = ref<string[]>([])
const showBatchDeleteModal = ref(false)
const deletingBatch = ref(false)
const showShortcutsModal = ref(false)
const showUnpublishModal = ref(false)
const showShareModal = ref(false)
const visitorAllowDownload = ref(false)
const previewOpening = ref(false)

const lightboxPhotos = computed<LightboxPhoto[]>(() => workspace.photos.value.map(photo => ({
  ...photo,
  title: photo.title || undefined
})))

const hallDescription = computed(() => {
  const gallery = workspace.gallery.value
  if (!gallery) return ''
  return gallery.status === 'PUBLISHED'
    ? '展厅已上线。上传照片、调整配置后，可通过分享链接邀请访客。'
    : '展厅尚未上线。按下方步骤上传照片、配置氛围，再发布展厅。'
})

const workflowStep = computed(() => {
  const gallery = workspace.gallery.value
  if (!gallery) return 1
  if (gallery.status === 'PUBLISHED') return 4
  if (workspace.photos.value.length > 0) return 3
  return 1
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
  if (isTypingTarget(event.target) || showShareModal.value || showBatchDeleteModal.value || showUnpublishModal.value) return
  if (event.metaKey || event.ctrlKey || event.altKey) return

  if (event.key === 'Escape') {
    showShortcutsModal.value = false
    return
  }
  if (showLightbox.value || photoToDelete.value) return

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
  lightboxIndex.value = index
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

async function handlePublishAll() {
  if (!canPublish.value) return
  try {
    await publishCenter.publishAll()
    await workspace.reload()
    toast.success('展厅及配置已成功发布至访客端！')
  } catch (error) {
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
      const versionsRes = await apiFetch(`/api/galleries/${gId}/viewer-config/versions?page=0&pageSize=50`)
      if (!versionsRes.ok) return
      const versions = await versionsRes.json() as { items?: Array<{ id: string; configJson?: string }> }
      const published = (versions.items || []).find(item => item.id === data.publishedVersionId)
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
  if (!gallery || gallery.status !== 'PUBLISHED') return
  await loadGalleryConfig()
  showShareModal.value = true
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
          <span>VIE Gallery</span>
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
                  {{ workspace.gallery.value.visibility === 'PUBLIC' ? '公开' : '私密' }}
                </span>
                <span class="vis-pill" :class="workspace.gallery.value.status === 'PUBLISHED' ? 'is-public' : 'is-private'">
                  {{ workspace.gallery.value.status === 'PUBLISHED' ? '已发布' : '草稿' }}
                </span>
              </div>
              <p>{{ hallDescription }}</p>
              <ol class="workflow-steps" aria-label="展厅上线步骤">
                <li :class="{ done: workspace.photos.value.length > 0, current: workflowStep === 1 }">
                  <span>1</span>上传照片
                </li>
                <li :class="{ done: workspace.photos.value.length > 0 }">
                  <span>2</span>配置氛围
                </li>
                <li :class="{ done: workspace.gallery.value.status === 'PUBLISHED', current: workflowStep === 3 }">
                  <span>3</span>发布展厅
                </li>
                <li :class="{ done: workspace.gallery.value.status === 'PUBLISHED', current: workflowStep === 4 }">
                  <span>4</span>分享链接
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
              <span>展厅配置</span>
            </button>
            <button
              v-if="canPublish && workspace.gallery.value.status !== 'PUBLISHED'"
              class="btn solid"
              type="button"
              :disabled="workspace.publishing.value"
              @click="handlePublish"
            >
              <Icon name="send" :size="15" />
              <span>发布展厅</span>
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

        <div class="hall-split">
          <section class="photo-panel">
            <div class="photo-toolbar">
              <h2>照片管理 ({{ workspace.photos.value.length }})</h2>
              <div class="photo-tools">
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

          <div class="workspace-sidebar">
            <PublishCenterPanel
              :gallery="workspace.gallery.value"
              :readiness="publishCenter.readiness.value"
              :loading="publishCenter.loading.value"
              :publishing="publishCenter.publishing.value"
              :unpublishing="publishCenter.unpublishing.value"
              :can-publish="canPublish"
              :can-config="canConfig"
              :is-owner="isOwner"
              @publish="handlePublishAll"
              @unpublish="promptUnpublish"
              @preview="openViewer"
              @open-config="goToConfig"
              @refresh="publishCenter.loadReadiness"
            />

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
          </div>
        </div>

        <footer class="hall-footer">© 2026 VIE Gallery</footer>
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
      @gallery-updated="workspace.reload"
    />

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
      @select="lightboxIndex = $event"
      @set-cover="handleSetCover"
      @delete="promptDeletePhoto"
      @update-title="handleUpdatePhotoTitle"
      @move-up="handleMovePhoto({ id: $event.id, direction: 'up' })"
      @move-down="handleMovePhoto({ id: $event.id, direction: 'down' })"
    />

    <Transition name="modal-fade">
      <div v-if="showShortcutsModal" class="shortcuts-backdrop" @click.self="showShortcutsModal = false">
        <div class="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
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
  position: relative;
  min-height: 100dvh;
  color: #111827;
}

.hall-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-color: #eef6f1;
  background-image: url('/hall-bg.png');
  background-size: cover;
  background-position: center;
}

.hall-nav,
.hall-body,
.hall-state {
  position: relative;
  z-index: 1;
}

.hall-nav {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  width: min(1280px, calc(100% - 40px));
  margin: 16px auto 0;
  padding: 8px 20px;
  height: 64px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.07);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 750;
}

.fold-mark svg {
  width: 28px;
  height: 28px;
}

.hall-tabs {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.hall-tab {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 650;
  background: transparent;
}

.hall-tab.is-active {
  color: #00b88f;
  box-shadow: inset 0 -3px 0 #00b88f;
}

.hall-user {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #12b981;
  color: #fff;
  font-size: 12px;
  font-weight: 750;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.user-meta strong {
  font-size: 13px;
}

.user-meta em {
  font-size: 11px;
  font-style: normal;
  color: #9ca3af;
}

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 140px;
  padding: 6px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.user-menu a,
.user-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.hall-body {
  width: min(1280px, calc(100% - 40px));
  margin: 18px auto 0;
  padding-bottom: 28px;
}

.hall-hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 24px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.hero-left {
  display: flex;
  gap: 12px;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #f3f4f6;
  display: grid;
  place-items: center;
  color: #6b7280;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-row h1 {
  font-size: 26px;
  font-weight: 800;
}

.vis-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.vis-pill.is-public {
  background: #ecfdf5;
  color: #00b88f;
}

.vis-pill.is-private {
  background: #f3f4f6;
  color: #6b7280;
}

.hero-left p {
  margin-top: 6px;
  font-size: 13px;
  color: #6b7280;
}

.workflow-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 4px;
  padding: 0;
  list-style: none;
}

.workflow-steps li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 12px;
  font-weight: 650;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 步骤连接线 */
.workflow-steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 100%;
  top: 50%;
  width: 8px;
  height: 2px;
  background: #e5e7eb;
  transform: translateY(-50%);
  transition: background 0.3s ease;
}

.workflow-steps li.done:not(:last-child)::after {
  background: #00b88f;
  animation: workflow-line-expand 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes workflow-line-expand {
  from {
    width: 0;
    opacity: 0;
  }
  to {
    width: 8px;
    opacity: 1;
  }
}

.workflow-steps li span {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #e5e7eb;
  font-size: 11px;
  font-weight: 800;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 已完成步骤 */
.workflow-steps li.done {
  color: #047857;
  background: #ecfdf5;
  animation: workflow-step-complete 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes workflow-step-complete {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

.workflow-steps li.done span {
  background: #00b88f;
  color: #fff;
  position: relative;
  overflow: hidden;
}

/* 对勾展开动画 */
.workflow-steps li.done span::before {
  content: '✓';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  animation: workflow-check-draw 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;
}

@keyframes workflow-check-draw {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-180deg);
  }
  50% {
    transform: scale(1.3) rotate(10deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

/* 当前步骤 */
.workflow-steps li.current {
  color: #111827;
  background: #fff;
  box-shadow: 0 0 0 2px #00b88f inset;
  animation: workflow-step-pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes workflow-step-pulse {
  0%, 100% {
    box-shadow: 0 0 0 2px #00b88f inset,
                0 0 0 0 rgba(0, 184, 143, 0);
  }
  50% {
    box-shadow: 0 0 0 2px #00b88f inset,
                0 0 0 6px rgba(0, 184, 143, 0.2);
  }
}

.workflow-steps li.current span {
  background: #059669;
  color: #fff;
  animation: workflow-number-bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes workflow-number-bounce {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(0.8);
  }
  60% {
    transform: scale(1.2) rotate(5deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

/* 未来步骤悬浮提示 */
.workflow-steps li:not(.done):not(.current):hover {
  background: #e5e7eb;
  transform: translateY(-1px);
}

/* 移动端适配 */
@media (max-width: 640px) {
  .workflow-steps {
    gap: 6px;
  }
  
  .workflow-steps li {
    padding: 5px 8px;
    font-size: 11px;
  }
  
  .workflow-steps li span {
    width: 16px;
    height: 16px;
    font-size: 9px;
  }
}

/* 无障碍 */
@media (prefers-reduced-motion: reduce) {
  .workflow-steps li,
  .workflow-steps li span,
  .workflow-steps li::after {
    animation: none !important;
  }
}

.meta-row {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: #9ca3af;
}

.hero-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.btn.outline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #00b88f;
  color: #00b88f;
  background: #fff;
  font-size: 13px;
  font-weight: 650;
}

.btn.solid {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  background: #00b88f;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.hall-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;
  margin-top: 18px;
}

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.photo-panel {
  padding: 18px 20px 22px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.photo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.photo-toolbar h2 {
  font-size: 16px;
  font-weight: 750;
}

.photo-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.view-toggle {
  display: flex;
  padding: 3px;
  background: #f3f4f6;
  border-radius: 10px;
}

.view-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #9ca3af;
}

.view-btn.active {
  background: #00b88f;
  color: #fff;
}

.shortcut-mark {
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.shortcuts-backdrop {
  position: fixed;
  inset: 0;
  z-index: 600;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.35);
}

.shortcuts-modal {
  width: min(380px, calc(100% - 32px));
  padding: 22px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
}

.shortcuts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.shortcuts-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
}

.shortcuts-close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}

.shortcuts-close:hover {
  background: #f3f4f6;
  color: #0f172a;
}

.shortcut-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
}

.shortcut-list kbd {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  border-bottom-width: 2px;
  background: #f8fafc;
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  color: #0f172a;
  text-align: center;
}

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }

.photo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-list :deep(.list-dropzone) {
  min-height: 120px;
}

.list-empty {
  margin: 0;
  padding: 16px;
  color: #6b7280;
  font-size: 13px;
}

.hall-footer {
  margin-top: 22px;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}

.hall-state {
  width: min(720px, calc(100% - 40px));
  margin: 80px auto;
  padding: 40px;
  text-align: center;
  background: #fff;
  border-radius: 18px;
}

.state-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
}

@media (max-width: 1100px) {
  .hall-split {
    grid-template-columns: 1fr;
  }
  .hall-tabs span { display: none; }
}
</style>
