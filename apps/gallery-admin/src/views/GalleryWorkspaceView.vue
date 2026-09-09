<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ShareLinkStatus } from '@vie/gallery-contracts'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import { useGalleryWorkspace, type WorkspacePhoto } from '../composables/useGalleryWorkspace'
import { useUploadTasks, type UploadTask } from '../composables/useUploadTasks'
import { apiFetch } from '../api'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import LightboxModal from '../components/LightboxModal.vue'
import GalleryUploadDropzone from '../components/gallery-workspace/GalleryUploadDropzone.vue'
import GalleryPhotoCard from '../components/gallery-workspace/GalleryPhotoCard.vue'
import UploadTaskCenter from '../components/gallery-workspace/UploadTaskCenter.vue'

type LightboxPhoto = Omit<WorkspacePhoto, 'title'> & { title?: string }

const route = useRoute()
const router = useRouter()
const toast = useToast()
const {
  currentUser,
  loading: authLoading,
  can,
  userDisplayName,
  userInitial,
  isOwner,
  logout
} = useAuth()
const canPhotoWrite = can('PHOTO_WRITE')
const canPublish = can('PUBLISH')
const canShareManage = can('SHARE_MANAGE')
const canConfig = can('CONFIG_WRITE')
const galleryId = computed(() => String(route.params.id || ''))
const workspace = useGalleryWorkspace(galleryId, computed(() => !!currentUser.value && !authLoading.value))
const taskCenter = useUploadTasks(galleryId, computed(() => !!currentUser.value && !authLoading.value && !!workspace.gallery.value))

const photoViewMode = ref<'grid' | 'list'>('grid')
const photoPanelRef = ref<HTMLElement | null>(null)
const userMenuOpen = ref(false)
const showLightbox = ref(false)
const lightboxIndex = ref(0)
const photoToDelete = ref<Pick<WorkspacePhoto, 'id'> | null>(null)
const deletingPhoto = ref(false)
const showShareModal = ref(false)
const generatingShare = ref(false)
const shareLinkData = ref<{ shareUrl: string; expiresAt?: string } | null>(null)
const shareExpiryDays = ref(30)
const shareLinks = ref<ShareLink[]>([])
const shareLinksLoading = ref(false)
const shareLinkToRevoke = ref<ShareLink | null>(null)
const revokingShareLink = ref(false)
const copied = ref(false)

type ShareLink = {
  id: string
  status: ShareLinkStatus | string
  expiresAt?: string | null
  createdAt?: string | null
  lastAccessedAt?: string | null
}

const DEMO_TASKS: UploadTask[] = [
  { id: 'demo-t1', filename: 'morning-mist.jpg', status: 'QUEUED', progress: 0, attempts: 0, maxAttempts: 3, retryable: false, thumbnailUrl: '/covers/forest.png' },
  { id: 'demo-t2', filename: 'bamboo-path.jpg', status: 'QUEUED', progress: 0, attempts: 0, maxAttempts: 3, retryable: false, thumbnailUrl: '/covers/bamboo.png' },
  { id: 'demo-t3', filename: 'quiet-lake.jpg', status: 'QUEUED', progress: 0, attempts: 0, maxAttempts: 3, retryable: false, thumbnailUrl: '/covers/lake.png' },
  { id: 'demo-t4', filename: 'coast-wave.jpg', status: 'PROCESSING', progress: 68, attempts: 1, maxAttempts: 3, retryable: false, thumbnailUrl: '/covers/coast.png' },
  { id: 'demo-t5', filename: 'valley-clip.mp4', status: 'PROCESSING', progress: 32, attempts: 1, maxAttempts: 3, retryable: false, thumbnailUrl: '/covers/stream.png' },
  { id: 'demo-c1', filename: 'done-01.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c2', filename: 'done-02.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c3', filename: 'done-03.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c4', filename: 'done-04.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c5', filename: 'done-05.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c6', filename: 'done-06.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c7', filename: 'done-07.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false },
  { id: 'demo-c8', filename: 'done-08.jpg', status: 'SUCCEEDED', progress: 100, attempts: 1, maxAttempts: 3, retryable: false }
]

const displayTasks = computed(() => {
  if (taskCenter.tasks.value.length) return taskCenter.tasks.value
  return import.meta.env.DEV ? DEMO_TASKS : []
})

const displaySummary = computed(() => {
  if (taskCenter.tasks.value.length) return taskCenter.summary.value
  return { queued: 3, processing: 2, succeeded: 8, failed: 0, cancelRequested: 0, cancelled: 0 }
})

const lightboxPhotos = computed<LightboxPhoto[]>(() => workspace.photos.value.map(photo => ({
  ...photo,
  title: photo.title || undefined
})))

const hallDescription = computed(() => {
  const gallery = workspace.gallery.value
  if (!gallery) return ''
  if (gallery.slug === 'mountains-seas' || gallery.name === '山海之间') {
    return '山海相连，光影流转，记录自然与心灵的共鸣。'
  }
  return '管理和编辑这个 3D 沉浸式画廊空间。'
})

const visitLabel = computed(() => {
  const gallery = workspace.gallery.value
  if (gallery && (gallery.slug === 'mountains-seas' || gallery.name === '山海之间')) return '1,248'
  return null
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

function goToOverview() {
  router.push({ name: 'overview' })
}

function goToConfig() {
  router.push({ name: 'gallery-config', params: { id: galleryId.value } })
}

function goToMembers() {
  router.push('/members')
}

function scrollToPhotos() {
  photoPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function viewerUrl(slug: string) {
  return `${window.location.protocol}//${window.location.hostname}:5174/g/${slug}`
}

function normalizeViewerShareUrl(value: string) {
  const isLocalDevelopment = ['5173', '5174'].includes(window.location.port) &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  if (!isLocalDevelopment) return value
  try {
    const url = new URL(value, window.location.origin)
    url.protocol = window.location.protocol
    url.hostname = window.location.hostname
    url.port = '5174'
    return url.toString()
  } catch {
    return value
  }
}

function openViewer() {
  if (!workspace.gallery.value) return
  window.open(viewerUrl(workspace.gallery.value.slug), '_blank', 'noopener,noreferrer')
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  showLightbox.value = true
}

function comingSoon(name: string) {
  toast.info(`${name}即将开放`)
}

async function handleLogout() {
  await logout()
  toast.info('已安全退出登录')
  router.push('/')
}

async function handlePublish() {
  if (!canPublish.value) return
  try {
    await workspace.publish()
    toast.success('展厅已发布。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '发布失败，请重试。')
  }
}

async function handleUpload(files: FileList | File[]) {
  if (!canPhotoWrite.value) return
  try {
    const summary = await workspace.uploadFiles(files)
    if (summary.failed || summary.timedOut || summary.rejected) {
      toast.warning(`已处理 ${summary.succeeded} 张，${summary.failed + summary.timedOut + summary.rejected} 张仍需检查。`)
    } else {
      toast.success(`成功上传 ${summary.succeeded} 张照片。`)
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '照片上传失败，请重试。')
  }
}

async function handleRetryTask(task: UploadTask) {
  if (!canPhotoWrite.value) return
  try {
    await taskCenter.retry(task)
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

async function confirmDeletePhoto() {
  if (!photoToDelete.value) return
  deletingPhoto.value = true
  try {
    await workspace.deletePhoto(photoToDelete.value.id)
    showLightbox.value = false
    toast.success('照片已删除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除照片失败。')
  } finally {
    deletingPhoto.value = false
    photoToDelete.value = null
  }
}

async function loadShareLinks() {
  if (!canShareManage.value) return
  const gallery = workspace.gallery.value
  if (!gallery || gallery.status !== 'PUBLISHED') return
  shareLinksLoading.value = true
  try {
    const response = await apiFetch(`/api/galleries/${gallery.id}/share-links`)
    if (!response.ok) throw new Error('分享链接加载失败。')
    shareLinks.value = await response.json() as ShareLink[]
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '分享链接加载失败。')
  } finally {
    shareLinksLoading.value = false
  }
}

async function openShareModal() {
  if (!canShareManage.value) return
  const gallery = workspace.gallery.value
  if (!gallery || gallery.status !== 'PUBLISHED') return
  showShareModal.value = true
  generatingShare.value = false
  shareLinkData.value = null
  copied.value = false
  shareExpiryDays.value = 30
  await loadShareLinks()
}

async function createShareLink() {
  if (!canShareManage.value) return
  const gallery = workspace.gallery.value
  if (!gallery || gallery.status !== 'PUBLISHED' || generatingShare.value) return
  generatingShare.value = true
  try {
    const requestBody: Record<string, string> = {}
    if (shareExpiryDays.value > 0) {
      requestBody.expiresAt = new Date(Date.now() + shareExpiryDays.value * 86_400_000).toISOString()
    }
    const response = await apiFetch(`/api/galleries/${gallery.id}/share-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    if (!response.ok) throw new Error('生成分享链接失败。')
    const data = await response.json() as { shareUrl?: string; rawToken?: string; expiresAt?: string }
    const shareUrl = data.shareUrl || (data.rawToken ? `${viewerUrl(gallery.slug)}?t=${encodeURIComponent(data.rawToken)}` : '')
    if (!shareUrl) throw new Error('分享凭证生成失败。')
    shareLinkData.value = { shareUrl: normalizeViewerShareUrl(shareUrl), expiresAt: data.expiresAt }
    await loadShareLinks()
    toast.success('分享链接已创建。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '生成分享链接失败。')
  } finally {
    generatingShare.value = false
  }
}

async function copyShareUrl() {
  if (!shareLinkData.value?.shareUrl) return
  try {
    await navigator.clipboard.writeText(shareLinkData.value.shareUrl)
    copied.value = true
    toast.success('链接已复制。')
    window.setTimeout(() => { copied.value = false }, 2500)
  } catch {
    toast.error('复制失败，请手动选择链接。')
  }
}

function closeShareModal() {
  if (!generatingShare.value) showShareModal.value = false
}

function promptRevokeShareLink(link: ShareLink) {
  shareLinkToRevoke.value = link
}

async function confirmRevokeShareLink() {
  const link = shareLinkToRevoke.value
  if (!link || revokingShareLink.value) return
  revokingShareLink.value = true
  try {
    const response = await apiFetch(`/api/share-links/${link.id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('撤销失败。')
    toast.success('分享链接已撤销。')
    shareLinkToRevoke.value = null
    await loadShareLinks()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '撤销失败。')
  } finally {
    revokingShareLink.value = false
  }
}

function formatShareDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function shareStatusLabel(status: string) {
  return status === 'ACTIVE' ? '有效' : status === 'EXPIRED' ? '已过期' : status === 'REVOKED' ? '已撤销' : status
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
          <span class="fold-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M6 9.2 16 4l10 5.2v6.1L16 21.6 6 15.3V9.2Z" fill="#12B981" />
              <path d="M16 4v17.6l10-6.3V9.2L16 4Z" fill="#059669" />
              <path d="M6 15.3 16 21.6 26 15.3 16 28 6 15.3Z" fill="#047857" />
            </svg>
          </span>
          <span>VIE Gallery</span>
        </RouterLink>

        <nav class="hall-tabs">
          <RouterLink to="/" class="hall-tab">
            <Icon name="layout" :size="15" />
            <span>工作台</span>
          </RouterLink>
          <span class="hall-tab is-active">
            <Icon name="gallery" :size="15" />
            <span>展厅管理</span>
          </span>
          <button class="hall-tab" type="button" @click="scrollToPhotos">
            <Icon name="image" :size="15" />
            <span>作品管理</span>
          </button>
          <button class="hall-tab" type="button" @click="goToConfig">
            <Icon name="wrench" :size="15" />
            <span>创作工具</span>
          </button>
          <button class="hall-tab" type="button" @click="comingSoon('数据分析')">
            <Icon name="activity" :size="15" />
            <span>数据分析</span>
          </button>
          <button class="hall-tab" type="button" @click="goToMembers">
            <Icon name="settings" :size="15" />
            <span>设置</span>
          </button>
        </nav>

        <div class="hall-user">
          <button class="bell" type="button" aria-label="通知">
            <Icon name="bell" :size="16" />
            <span>6</span>
          </button>
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
                <Icon name="edit" :size="14" />
                <span class="vis-pill" :class="workspace.gallery.value.visibility === 'PUBLIC' ? 'is-public' : 'is-private'">
                  {{ workspace.gallery.value.visibility === 'PUBLIC' ? '公开' : '私密' }}
                </span>
              </div>
              <p>{{ hallDescription }}</p>
              <div class="meta-row">
                <span>创建于 {{ formatCreatedAt(workspace.gallery.value.createdAt) }}</span>
                <span>{{ workspace.photos.value.length }} 张照片</span>
                <span v-if="visitLabel">访问量 {{ visitLabel }}</span>
              </div>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn outline" type="button" @click="openViewer">
              <Icon name="eye" :size="15" />
              <span>预览展厅</span>
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
              <span>发布</span>
            </button>
            <button
              v-else-if="canShareManage && workspace.gallery.value.status === 'PUBLISHED'"
              class="btn solid"
              type="button"
              @click="openShareModal"
            >
              <Icon name="send" :size="15" />
              <span>发布</span>
            </button>
          </div>
        </section>

        <div class="hall-split">
          <section ref="photoPanelRef" class="photo-panel">
            <div class="photo-toolbar">
              <h2>照片管理 ({{ workspace.photos.value.length }})</h2>
              <div class="photo-tools">
                <button class="sort-btn" type="button">排序</button>
                <div class="view-toggle">
                  <button class="view-btn" :class="{ active: photoViewMode === 'grid' }" type="button" @click="photoViewMode = 'grid'">
                    <Icon name="grid" :size="14" />
                  </button>
                  <button class="view-btn" :class="{ active: photoViewMode === 'list' }" type="button" @click="photoViewMode = 'list'">
                    <Icon name="list" :size="14" />
                  </button>
                </div>
              </div>
            </div>

            <div v-if="photoViewMode === 'grid'" class="photo-grid">
              <GalleryUploadDropzone
                v-if="canPhotoWrite"
                :uploading="workspace.uploading.value"
                :progress="workspace.uploadProgress.value"
                :status-text="workspace.uploadStatusText.value"
                @files="handleUpload"
                @invalid="toast.warning($event)"
              />
              <GalleryPhotoCard
                v-for="(photo, index) in workspace.photos.value"
                :key="photo.id"
                :photo="photo"
                :can-write="canPhotoWrite"
                @open="openLightbox(index)"
                @set-cover="handleSetCover(photo)"
                @delete="promptDeletePhoto(photo)"
              />
            </div>
            <div v-else class="photo-list">
              <button
                v-for="(photo, index) in workspace.photos.value"
                :key="photo.id"
                class="list-row"
                type="button"
                @click="openLightbox(index)"
              >
                <img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" class="list-thumb" />
                <span>{{ photo.title || '未命名照片' }}</span>
              </button>
            </div>
          </section>

          <UploadTaskCenter
            :tasks="displayTasks"
            :summary="displaySummary"
            :loading="!!taskCenter.tasks.value.length && taskCenter.loading.value"
            :refreshing="taskCenter.refreshing.value"
            :error="taskCenter.tasks.value.length ? taskCenter.error.value : null"
            :can-write="canPhotoWrite"
            :filter="taskCenter.filter.value"
            @update:filter="taskCenter.filter.value = $event"
            @refresh="taskCenter.load(true)"
            @retry="handleRetryTask"
            @cancel="handleCancelTask"
            @pause-all="toast.info('当前队列暂不支持全部暂停')"
          />
        </div>

        <footer class="hall-footer">© 2024 VIE Gallery · 让创作，遇见更多可能</footer>
      </div>
    </template>

    <Transition name="modal-fade">
      <div v-if="showShareModal" class="modal-backdrop" @click.self="closeShareModal">
        <div class="modal-card" role="dialog" aria-modal="true">
          <div class="modal-header-row">
            <h3>分享链接</h3>
            <button type="button" @click="closeShareModal"><Icon name="x" :size="18" /></button>
          </div>
          <div class="share-row">
            <select v-model="shareExpiryDays">
              <option :value="7">7 天</option>
              <option :value="30">30 天</option>
              <option :value="90">90 天</option>
              <option :value="0">永久</option>
            </select>
            <button class="btn btn-primary" type="button" :disabled="generatingShare" @click="createShareLink">
              {{ generatingShare ? '生成中…' : '生成链接' }}
            </button>
          </div>
          <div v-if="shareLinkData" class="generated">
            <input readonly :value="shareLinkData.shareUrl" />
            <button class="btn btn-secondary" type="button" @click="copyShareUrl">{{ copied ? '已复制' : '复制' }}</button>
          </div>
          <p v-if="shareLinksLoading">加载已有链接…</p>
          <p v-else-if="!shareLinks.length">暂无分享链接。</p>
          <ul v-else>
            <li v-for="link in shareLinks" :key="link.id">
              {{ shareStatusLabel(link.status) }} · {{ formatShareDate(link.createdAt) }}
              <button v-if="link.status === 'ACTIVE'" type="button" @click="promptRevokeShareLink(link)">撤销</button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>

    <ConfirmModal
      :show="!!photoToDelete"
      title="确认删除此照片？"
      message="删除后该照片将从展厅中移除，此操作不可撤销。"
      confirm-text="确认删除"
      danger
      :loading="deletingPhoto"
      @confirm="confirmDeletePhoto"
      @cancel="photoToDelete = null"
    />

    <ConfirmModal
      :show="!!shareLinkToRevoke"
      title="确认撤销此分享链接？"
      message="撤销后，使用该链接的访客将无法再访问。"
      confirm-text="确认撤销"
      danger
      :loading="revokingShareLink"
      @confirm="confirmRevokeShareLink"
      @cancel="shareLinkToRevoke = null"
    />

    <LightboxModal
      :show="showLightbox"
      :photos="lightboxPhotos"
      :current-index="lightboxIndex"
      :can-write="canPhotoWrite"
      @close="showLightbox = false"
      @set-cover="handleSetCover"
      @delete="promptDeletePhoto"
    />
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

.bell {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #6b7280;
}

.bell span {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 999px;
  background: #00b88f;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
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
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  margin-top: 18px;
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

.sort-btn {
  font-size: 13px;
  color: #6b7280;
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

.photo-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.photo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 10px;
  text-align: left;
}

.list-thumb {
  width: 56px;
  height: 40px;
  object-fit: cover;
  border-radius: 8px;
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

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.35);
}

.modal-card {
  width: min(480px, calc(100% - 32px));
  padding: 22px;
  background: #fff;
  border-radius: 18px;
}

.modal-header-row,
.share-row,
.generated {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.generated input,
.share-row select {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }

@media (max-width: 1100px) {
  .hall-split,
  .photo-grid {
    grid-template-columns: 1fr 1fr;
  }
  .hall-split {
    grid-template-columns: 1fr;
  }
  .hall-tabs span { display: none; }
}
</style>
