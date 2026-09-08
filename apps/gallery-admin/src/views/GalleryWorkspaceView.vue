<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ShareLinkStatus } from '@vie/gallery-contracts'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import { useGalleryWorkspace, type WorkspacePhoto } from '../composables/useGalleryWorkspace'
import { useUploadTasks, type UploadTask } from '../composables/useUploadTasks'

type LightboxPhoto = Omit<WorkspacePhoto, 'title'> & { title?: string }
import { apiFetch } from '../api'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import LightboxModal from '../components/LightboxModal.vue'
import GalleryWorkspaceHeader from '../components/gallery-workspace/GalleryWorkspaceHeader.vue'
import GalleryUploadDropzone from '../components/gallery-workspace/GalleryUploadDropzone.vue'
import GalleryPhotoGrid from '../components/gallery-workspace/GalleryPhotoGrid.vue'
import UploadTaskCenter from '../components/gallery-workspace/UploadTaskCenter.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser, loading: authLoading, can } = useAuth()
const canPhotoWrite = can('PHOTO_WRITE')
const canPublish = can('PUBLISH')
const canShareManage = can('SHARE_MANAGE')
const galleryId = computed(() => String(route.params.id || ''))
const workspace = useGalleryWorkspace(galleryId, computed(() => !!currentUser.value && !authLoading.value))
const taskCenter = useUploadTasks(galleryId, computed(() => !!currentUser.value && !authLoading.value && !!workspace.gallery.value))

const showLightbox = ref(false)
const lightboxIndex = ref(0)
const photoToDelete = ref<Pick<WorkspacePhoto, 'id'> | null>(null)
const batchPhotosToDelete = ref<string[]>([])
const showBatchDeleteModal = ref(false)
const deletingBatch = ref(false)

const lightboxPhotos = computed<LightboxPhoto[]>(() => workspace.photos.value.map(photo => ({
  ...photo,
  title: photo.title || undefined
})))
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

const processingCount = computed(() => workspace.photos.value.filter(photo => photo.status === 'PROCESSING').length)
const failedCount = computed(() => workspace.photos.value.filter(photo => photo.status === 'FAILED').length)

function goToOverview() {
  router.push({ name: 'overview' })
}

function goToConfig() {
  router.push({ name: 'gallery-config', params: { id: galleryId.value } })
}

function viewerUrl(slug: string) {
  return `${window.location.protocol}//${window.location.hostname}:5174/g/${slug}`
}

function normalizeViewerShareUrl(value: string) {
  const isLocalDevelopment = window.location.port === '5173' &&
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

async function handlePublish() {
  if (!canPublish.value) return
  try {
    await workspace.publish()
    toast.success('空间已发布，访客现在可以访问。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '发布空间失败，请重试。')
  }
}

async function handleUnpublish() {
  if (!canPublish.value) return
  try {
    await workspace.unpublish()
    toast.success('空间已撤回发布。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '撤回发布失败，请重试。')
  }
}

async function handleUpload(files: FileList | File[]) {
  if (!canPhotoWrite.value) return
  try {
    const summary = await workspace.uploadFiles(files)
    if (summary.failed || summary.timedOut || summary.rejected) {
      toast.warning(`已处理 ${summary.succeeded} 张，${summary.failed + summary.timedOut + summary.rejected} 张照片仍需检查。`)
    } else {
      toast.success(`成功上传并处理 ${summary.succeeded} 张照片！`)
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
    toast.error(error instanceof Error ? error.message : '任务重试失败，请稍后重试。')
  }
}

async function handleCancelTask(task: UploadTask) {
  if (!canPhotoWrite.value) return
  try {
    await taskCenter.cancel(task)
    toast.success(task.status === 'PROCESSING' ? '已请求取消任务。' : '任务已取消。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '取消任务失败，请稍后重试。')
  }
}

async function handleSetCover(photo: Pick<WorkspacePhoto, 'id'>) {
  if (!canPhotoWrite.value) return
  try {
    await workspace.setCover(photo)
    toast.success('已成功设为相册封面！')
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
    toast.success('照片已成功删除。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除照片失败。')
  } finally {
    deletingPhoto.value = false
    photoToDelete.value = null
  }
}

function promptBatchDelete(photoIds: string[]) {
  if (!canPhotoWrite.value || !photoIds.length) return
  batchPhotosToDelete.value = photoIds
  showBatchDeleteModal.value = true
}

async function confirmBatchDelete() {
  if (!batchPhotosToDelete.value.length || deletingBatch.value) return
  deletingBatch.value = true
  try {
    let successCount = 0
    for (const id of batchPhotosToDelete.value) {
      try {
        await workspace.deletePhoto(id)
        successCount++
      } catch {
        // continue deletion
      }
    }
    toast.success(`已成功删除 ${successCount} 张照片。`)
    showBatchDeleteModal.value = false
    batchPhotosToDelete.value = []
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '批量删除发生异常。')
  } finally {
    deletingBatch.value = false
  }
}

async function loadShareLinks() {
  if (!canShareManage.value) return
  const gallery = workspace.gallery.value
  if (!gallery || gallery.status !== 'PUBLISHED') return
  shareLinksLoading.value = true
  try {
    const response = await apiFetch(`/api/galleries/${gallery.id}/share-links`)
    if (!response.ok) throw new Error('分享链接加载失败，请稍后重试。')
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
    if (!response.ok) throw new Error('生成分享链接失败，请稍后重试。')
    const data = await response.json() as { id?: string; shareUrl?: string; rawToken?: string; expiresAt?: string }
    const shareUrl = data.shareUrl || (data.rawToken ? `${viewerUrl(gallery.slug)}?t=${encodeURIComponent(data.rawToken)}` : '')
    if (!shareUrl) throw new Error('分享凭证生成失败，请稍后重试。')
    shareLinkData.value = { shareUrl: normalizeViewerShareUrl(shareUrl), expiresAt: data.expiresAt }
    await loadShareLinks()
    toast.success('分享链接已创建。')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '生成分享链接失败。')
  } finally {
    generatingShare.value = false
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

function promptRevokeShareLink(link: ShareLink) {
  shareLinkToRevoke.value = link
}

async function confirmRevokeShareLink() {
  const link = shareLinkToRevoke.value
  if (!link || revokingShareLink.value) return
  revokingShareLink.value = true
  try {
    const response = await apiFetch(`/api/share-links/${link.id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('撤销分享链接失败，请稍后重试。')
    toast.success('分享链接已撤销。')
    shareLinkToRevoke.value = null
    await loadShareLinks()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '撤销分享链接失败。')
  } finally {
    revokingShareLink.value = false
  }
}

async function copyShareUrl() {
  if (!shareLinkData.value?.shareUrl) return
  try {
    await navigator.clipboard.writeText(shareLinkData.value.shareUrl)
    copied.value = true
    toast.success('分享链接已复制到剪贴板！')
    window.setTimeout(() => { copied.value = false }, 2500)
  } catch {
    toast.error('复制失败，请手动选择链接。')
  }
}

function closeShareModal() {
  if (!generatingShare.value) showShareModal.value = false
}
</script>

<template>
  <div class="gallery-workspace-page">
    <!-- Auth checking state -->
    <div v-if="authLoading" class="workspace-state loading-state" role="status">
      <div class="workspace-spinner"></div>
      <h1>正在验证登录状态…</h1>
      <p>请稍候，正在准备你的空间。</p>
    </div>

    <!-- Unauthenticated state -->
    <div v-else-if="!currentUser" class="workspace-state error-state">
      <div class="workspace-state-icon"><Icon name="lock" :size="28" /></div>
      <h1>请先登录创作者工作区</h1>
      <p>登录后才能管理照片、分享链接和 3D 视觉配置。</p>
      <button class="btn btn-primary" type="button" @click="goToOverview">返回登录</button>
    </div>

    <template v-else>
      <!-- Breadcrumb Navigation -->
      <nav class="workspace-breadcrumb-bar" aria-label="面包屑导航">
        <button type="button" class="back-link-btn" @click="goToOverview">
          <Icon name="arrow-left" :size="15" />
          <span>相册空间</span>
        </button>
        <span class="breadcrumb-separator" aria-hidden="true">/</span>
        <span class="current-crumb">{{ workspace.gallery.value?.name || '相册工作区' }}</span>
      </nav>

      <!-- Workspace Loading State -->
      <div v-if="workspace.loading.value" class="workspace-state loading-state" role="status">
        <div class="workspace-spinner"></div>
        <h1>正在加载相册工作区…</h1>
        <p>正在同步照片素材与 3D 切片状态。</p>
      </div>

      <!-- Workspace Error State -->
      <div v-else-if="workspace.error.value" class="workspace-state error-state">
        <div class="workspace-state-icon">
          <Icon :name="workspace.error.value.kind === 'network' ? 'refresh' : 'alert-circle'" :size="28" />
        </div>
        <h1>{{ workspace.error.value.kind === 'not-found' ? '空间不存在' : workspace.error.value.kind === 'forbidden' ? '暂时无法访问' : workspace.error.value.kind === 'unauthorized' ? '登录已失效' : workspace.error.value.kind === 'network' ? '网络连接异常' : '加载空间失败' }}</h1>
        <p>{{ workspace.error.value.message }}</p>
        <div class="state-actions">
          <button class="btn btn-secondary" type="button" @click="goToOverview">返回空间列表</button>
          <button class="btn btn-primary" type="button" @click="workspace.reload">重新加载</button>
        </div>
      </div>

      <!-- Loaded Workspace Main Content -->
      <template v-else-if="workspace.gallery.value">
        <!-- Workspace Header Banner -->
        <GalleryWorkspaceHeader
          :gallery="workspace.gallery.value"
          :photo-count="workspace.photos.value.length"
          :publishing="workspace.publishing.value"
          :can-config="can('CONFIG_WRITE').value"
          :can-share="canShareManage"
          :can-publish="canPublish"
          @config="goToConfig"
          @share="openShareModal"
          @publish="handlePublish"
          @unpublish="handleUnpublish"
          @preview="openViewer"
        />

        <!-- Photos Section -->
        <section class="photo-workspace-section" aria-labelledby="photos-title">
          <div class="photo-section-header">
            <div>
              <span class="section-kicker">PHOTO ASSETS</span>
              <h2 id="photos-title" class="section-main-title">照片管理与 3D 映射</h2>
              <p class="section-desc">上传高质量照片素材，系统自动优化切片并映射至 3D 展厅空间。</p>
            </div>

            <div v-if="processingCount || failedCount" class="processing-status-capsule" aria-live="polite">
              <span v-if="processingCount" class="status-capsule-item is-processing">
                <span class="capsule-dot dot-amber"></span>
                {{ processingCount }} 张处理中
              </span>
              <span v-if="failedCount" class="status-capsule-item is-failed">
                <span class="capsule-dot dot-red"></span>
                {{ failedCount }} 张处理失败
              </span>
            </div>
          </div>

          <!-- Dropzone -->
          <GalleryUploadDropzone
            v-if="canPhotoWrite"
            :uploading="workspace.uploading.value"
            :progress="workspace.uploadProgress.value"
            :status-text="workspace.uploadStatusText.value"
            @files="handleUpload"
            @invalid="toast.warning($event)"
          />

          <!-- Photos Grid with category filtering & batch tools -->
          <GalleryPhotoGrid
            :photos="workspace.photos.value"
            :can-write="canPhotoWrite"
            @open="openLightbox"
            @set-cover="handleSetCover"
            @delete="promptDeletePhoto"
            @batch-delete="promptBatchDelete"
          />
        </section>

        <!-- Upload Task Center -->
        <UploadTaskCenter
          :tasks="taskCenter.filteredTasks.value"
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
      </template>
    </template>

    <!-- Share Links Management Modal -->
    <Transition name="modal-fade">
      <div v-if="showShareModal" class="modal-backdrop" @click.self="closeShareModal">
        <div class="modal-card workspace-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble share-bubble"><Icon name="share" :size="20" /></div>
              <div>
                <h2 id="share-title">分享 3D 相册空间</h2>
                <p>生成专属加密访问链接，与他人分享你的沉浸式展厅。</p>
              </div>
            </div>
            <button class="modal-close" type="button" aria-label="关闭分享窗口" @click="closeShareModal">
              <Icon name="x" :size="18" />
            </button>
          </div>

          <div class="share-toolbar">
            <div class="share-options-row">
              <label class="share-expiry-field" for="share-expiry">
                <span>链接有效期</span>
                <select id="share-expiry" v-model="shareExpiryDays" class="select-input" :disabled="generatingShare">
                  <option :value="7">7 天有效</option>
                  <option :value="30">30 天有效</option>
                  <option :value="0">永久有效</option>
                </select>
              </label>
              <button class="btn btn-primary" type="button" :disabled="generatingShare" @click="createShareLink">
                <Icon v-if="generatingShare" name="refresh" :size="16" class="spin" />
                <Icon v-else name="plus" :size="16" />
                <span>{{ generatingShare ? '创建中…' : '生成新链接' }}</span>
              </button>
            </div>
          </div>

          <div v-if="generatingShare" class="generating-box" role="status">
            <Icon name="refresh" :size="24" class="spin spin-emerald" />
            <p>正在生成加密分享凭证…</p>
          </div>

          <div v-if="shareLinkData" class="share-content">
            <div class="link-display-group">
              <input :value="shareLinkData.shareUrl" readonly aria-label="新创建的分享链接" class="form-input share-url-input" />
              <button class="btn btn-primary copy-btn" type="button" @click="copyShareUrl">
                <Icon :name="copied ? 'check' : 'copy'" :size="16" />
                <span>{{ copied ? '已复制' : '复制链接' }}</span>
              </button>
            </div>
            <span v-if="shareLinkData.expiresAt" class="share-expiry">有效期至 {{ formatShareDate(shareLinkData.expiresAt) }}</span>
          </div>

          <div v-if="shareLinksLoading" class="share-loading" role="status">正在加载分享链接…</div>
          <div v-else-if="!shareLinks.length" class="share-empty">暂无有效分享链接，点击上方按钮创建。</div>
          <ul v-else class="share-link-list" aria-label="分享链接列表">
            <li v-for="link in shareLinks" :key="link.id" class="share-link-row">
              <div class="share-link-info">
                <span class="share-status" :class="`share-status-${link.status.toLowerCase()}`">{{ shareStatusLabel(link.status) }}</span>
                <span>创建于 {{ formatShareDate(link.createdAt) }}</span>
                <span>到期 {{ formatShareDate(link.expiresAt) }}</span>
                <span v-if="link.lastAccessedAt">最近访问 {{ formatShareDate(link.lastAccessedAt) }}</span>
              </div>
              <button v-if="link.status === 'ACTIVE'" class="icon-btn-tool-sm text-danger" type="button" aria-label="撤销分享链接" title="撤销分享链接" @click="promptRevokeShareLink(link)">
                <Icon name="x" :size="14" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>

    <!-- Confirm Modals -->
    <ConfirmModal
      :show="!!photoToDelete"
      title="确认删除照片"
      message="此操作将永久删除该照片及其切片纹理，是否继续？"
      confirm-text="确认删除"
      danger
      :loading="deletingPhoto"
      @confirm="confirmDeletePhoto"
      @cancel="photoToDelete = null"
    />

    <ConfirmModal
      :show="showBatchDeleteModal"
      title="批量删除照片"
      :message="`确认删除已选中的 ${batchPhotosToDelete.length} 张照片吗？此操作无法撤销。`"
      confirm-text="确认批量删除"
      danger
      :loading="deletingBatch"
      @confirm="confirmBatchDelete"
      @cancel="showBatchDeleteModal = false; batchPhotosToDelete = []"
    />

    <ConfirmModal
      :show="!!shareLinkToRevoke"
      title="确认撤销分享链接"
      message="撤销后，持有此链接的访客将无法再访问相册，确定撤销吗？"
      confirm-text="确认撤销"
      danger
      :loading="revokingShareLink"
      @confirm="confirmRevokeShareLink"
      @cancel="shareLinkToRevoke = null"
    />

    <!-- Lightbox Modal -->
    <LightboxModal
      :show="showLightbox"
      :photos="lightboxPhotos"
      :current-index="lightboxIndex"
      @close="showLightbox = false"
    />
  </div>
</template>

<style scoped>
.gallery-workspace-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: min(100%, 1320px);
  margin: 0 auto;
  padding: 8px 4px 64px;
}

/* Breadcrumb Navigation */
.workspace-breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: #64748b;
  padding: 4px 0;
}

.back-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #059669;
  background: transparent;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.back-link-btn:hover {
  background: #ecfdf5;
  color: #047857;
}

.breadcrumb-separator {
  color: #cbd5e1;
}

.current-crumb {
  font-weight: 650;
  color: #0f172a;
}

/* Workspace States */
.workspace-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 360px;
  padding: 48px 24px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  gap: 14px;
}

.workspace-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(16, 185, 129, 0.2);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.workspace-state h1 {
  font-size: 20px;
  font-weight: 750;
  color: #0f172a;
}

.workspace-state p {
  font-size: 14px;
  color: #64748b;
  max-width: 440px;
}

/* Photo Workspace Section */
.photo-workspace-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.photo-section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.section-kicker {
  display: inline-block;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #059669;
  margin-bottom: 4px;
}

.section-main-title {
  font-size: 20px;
  font-weight: 750;
  color: #0f172a;
}

.section-desc {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
}

.processing-status-capsule {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-capsule-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 650;
}

.status-capsule-item.is-processing {
  background: #fef3c7;
  color: #b45309;
}

.status-capsule-item.is-failed {
  background: #fee2e2;
  color: #dc2626;
}

.capsule-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.dot-amber { background: #f59e0b; }
.dot-red { background: #ef4444; }

/* Share Modal Layout */
.workspace-share-modal {
  width: min(560px, 100%);
}

.share-bubble {
  background: #eff6ff;
  color: #2563eb;
}

.share-toolbar {
  margin-bottom: 16px;
}

.share-options-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.share-expiry-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}

.share-expiry-field .select-input {
  flex: 1;
}

.generating-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
  color: #64748b;
  font-size: 13px;
}

.share-content {
  margin-bottom: 16px;
}

.link-display-group {
  display: flex;
  gap: 8px;
}

.share-url-input {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
}

.share-expiry {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}

.share-loading,
.share-empty {
  text-align: center;
  padding: 20px;
  color: #94a3b8;
  font-size: 13px;
}

.share-link-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.share-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  font-size: 12px;
}

.share-link-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #64748b;
}

.share-status {
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.share-status-active { color: #047857; background: #ecfdf5; }
.share-status-expired { color: #94a3b8; background: #f1f5f9; }
.share-status-revoked { color: #dc2626; background: #fef2f2; }

.icon-btn-tool-sm {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.icon-btn-tool-sm:hover {
  background: #fee2e2;
  color: #dc2626;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
