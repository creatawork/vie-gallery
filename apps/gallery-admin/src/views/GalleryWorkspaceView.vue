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
    <div v-if="authLoading" class="workspace-state loading-state" role="status">
      <div class="workspace-spinner"></div>
      <h1>正在验证登录状态…</h1>
      <p>请稍候，正在准备你的空间。</p>
    </div>

    <div v-else-if="!currentUser" class="workspace-state error-state">
      <div class="workspace-state-icon"><Icon name="lock" :size="28" /></div>
      <h1>请先登录创作者工作区</h1>
      <p>登录后才能管理照片、分享链接和 3D 视觉配置。</p>
      <button class="btn btn-primary" type="button" @click="goToOverview">返回登录</button>
    </div>

    <template v-else>
      <nav class="workspace-breadcrumb" aria-label="面包屑导航">
        <button type="button" class="back-link" @click="goToOverview">
          <Icon name="arrow-left" :size="16" />
          <span>我的空间</span>
        </button>
        <span aria-hidden="true">/</span>
        <span>{{ workspace.gallery.value?.name || '空间工作台' }}</span>
      </nav>

      <div v-if="workspace.loading.value" class="workspace-state loading-state" role="status">
        <div class="workspace-spinner"></div>
        <h1>正在加载空间…</h1>
        <p>正在准备照片工作区。</p>
      </div>

      <div v-else-if="workspace.error.value" class="workspace-state error-state">
        <div class="workspace-state-icon">
          <Icon :name="workspace.error.value.kind === 'network' ? 'refresh' : 'alert-circle'" :size="28" />
        </div>
        <h1>{{ workspace.error.value.kind === 'not-found' ? '空间不存在' : workspace.error.value.kind === 'forbidden' ? '暂时无法访问' : workspace.error.value.kind === 'unauthorized' ? '登录已失效' : workspace.error.value.kind === 'network' ? '网络连接异常' : '加载空间失败' }}</h1>
        <p>{{ workspace.error.value.message }}</p>
        <div class="state-actions">
          <button class="btn btn-secondary" type="button" @click="goToOverview">返回我的空间</button>
          <button class="btn btn-primary" type="button" @click="workspace.reload">重新加载</button>
        </div>
      </div>

      <template v-else-if="workspace.gallery.value">
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

        <section class="photo-workspace-panel" aria-labelledby="photos-title">
          <div class="photo-toolbar">
            <div>
              <span class="section-kicker">PHOTO LIBRARY</span>
              <h2 id="photos-title">照片素材</h2>
              <p>管理空间中的照片，并选择一张作为访客看到的封面。</p>
            </div>
            <div class="processing-summary" v-if="processingCount || failedCount" aria-live="polite">
              <span v-if="processingCount"><i class="summary-dot is-processing"></i>{{ processingCount }} 张处理中</span>
              <span v-if="failedCount"><i class="summary-dot is-failed"></i>{{ failedCount }} 张处理失败</span>
            </div>
          </div>

            <GalleryUploadDropzone
            v-if="canPhotoWrite"
            :uploading="workspace.uploading.value"
            :progress="workspace.uploadProgress.value"
            :status-text="workspace.uploadStatusText.value"
            @files="handleUpload"
            @invalid="toast.warning($event)"
          />
          <GalleryPhotoGrid
            :photos="workspace.photos.value"
            :can-write="canPhotoWrite"
            @open="openLightbox"
            @set-cover="handleSetCover"
            @delete="promptDeletePhoto"
          />
        </section>

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

    <Transition name="modal-fade">
      <div v-if="showShareModal" class="modal-backdrop" @click.self="closeShareModal">
        <div class="modal-card workspace-share-modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
          <div class="modal-header-row">
            <div class="modal-title-box">
              <div class="modal-icon-bubble share-bubble"><Icon name="share" :size="20" /></div>
              <div>
                <h2 id="share-title">分享相册空间</h2>
                <p>生成专属链接，与他人分享你的沉浸式相册。</p>
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
                  <option :value="7">7 天</option>
                  <option :value="30">30 天</option>
                  <option :value="0">永久有效</option>
                </select>
              </label>
              <button class="btn btn-primary" type="button" :disabled="generatingShare" @click="createShareLink">
                <Icon v-if="generatingShare" name="refresh" :size="16" class="spin" />
                <Icon v-else name="plus" :size="16" />
                <span>{{ generatingShare ? '创建中…' : '创建分享链接' }}</span>
              </button>
            </div>
            <p class="share-tips"><Icon name="lock" :size="14" />任何拥有有效链接的用户都可以打开访客预览。</p>
          </div>
          <div v-if="generatingShare" class="generating-box" role="status">
            <Icon name="refresh" :size="24" class="spin" />
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
          <div v-else-if="!shareLinks.length" class="share-empty">暂无分享链接，创建一个链接开始分享。</div>
          <ul v-else class="share-link-list" aria-label="分享链接列表">
            <li v-for="link in shareLinks" :key="link.id" class="share-link-row">
              <div class="share-link-info">
                <span class="share-status" :class="`share-status-${link.status.toLowerCase()}`">{{ shareStatusLabel(link.status) }}</span>
                <span>创建于 {{ formatShareDate(link.createdAt) }}</span>
                <span>到期 {{ formatShareDate(link.expiresAt) }}</span>
                <span v-if="link.lastAccessedAt">最近访问 {{ formatShareDate(link.lastAccessedAt) }}</span>
              </div>
              <button v-if="link.status === 'ACTIVE'" class="icon-action-btn revoke-share-btn" type="button" aria-label="撤销分享链接" title="撤销分享链接" @click="promptRevokeShareLink(link)">
                <Icon name="trash" :size="15" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>

    <ConfirmModal
      :show="!!shareLinkToRevoke"
      title="撤销分享链接"
      message="确定要撤销这个分享链接吗？撤销后，持有该链接的访客将无法继续访问。"
      confirm-text="确认撤销"
      :danger="true"
      :loading="revokingShareLink"
      @confirm="confirmRevokeShareLink"
      @cancel="shareLinkToRevoke = null"
    />

    <ConfirmModal
      :show="!!photoToDelete"
      title="删除照片"
      message="确定要删除这张照片吗？删除后将无法在空间中恢复。"
      confirm-text="确认删除"
      :danger="true"
      :loading="deletingPhoto"
      @confirm="confirmDeletePhoto"
      @cancel="photoToDelete = null"
    />

    <LightboxModal
      :show="showLightbox"
      :photos="lightboxPhotos"
      :current-index="lightboxIndex"
      :can-write="canPhotoWrite"
      @close="showLightbox = false"
      @select="index => lightboxIndex = index"
      @set-cover="handleSetCover"
      @delete="promptDeletePhoto"
    />
  </div>
</template>

<style scoped>
.gallery-workspace-page {
  width: min(100%, 1240px);
  min-height: calc(100vh - 110px);
  margin: 0 auto;
  padding: 18px 0 56px;
}

.workspace-breadcrumb {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 22px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 6px 10px 6px 0;
  color: var(--text-secondary);
  font-weight: 700;
}

.back-link:hover,
.back-link:focus-visible {
  color: var(--brand-deep, #087a5c);
  outline: none;
}

.workspace-state {
  display: flex;
  min-height: 54vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.workspace-state h1 {
  margin-top: 18px;
  color: var(--text-primary);
  font-size: clamp(22px, 4vw, 30px);
  letter-spacing: -0.035em;
}

.workspace-state p {
  max-width: 470px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.workspace-state-icon {
  display: grid;
  width: 66px;
  height: 66px;
  place-items: center;
  border-radius: 21px;
  color: #059669;
  background: var(--brand-accent-subtle);
}

.error-state .workspace-state-icon {
  color: #b45309;
  background: #fff7ed;
}

.workspace-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid rgba(16, 185, 129, 0.18);
  border-top-color: var(--brand-accent);
  border-radius: 50%;
  animation: workspace-spin 0.8s linear infinite;
}

.state-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.photo-workspace-panel {
  margin-top: 24px;
  padding: 26px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--shadow-md);
}

.photo-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 22px;
}

.section-kicker {
  display: block;
  margin-bottom: 7px;
  color: var(--brand-deep, #087a5c);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.photo-toolbar h2 {
  color: var(--text-primary);
  font-size: 21px;
  letter-spacing: -0.03em;
}

.photo-toolbar p {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 13px;
}

.processing-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.processing-summary span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.summary-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}

.summary-dot.is-processing { background: #f59e0b; }
.summary-dot.is-failed { background: #ef4444; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  padding: 20px;
  place-items: center;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px) saturate(120%);
}

.workspace-share-modal {
  width: min(560px, 100%);
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 24px;
  background: #ffffff;
  box-shadow: var(--shadow-xl);
}

.modal-header-row,
.modal-title-box,
.link-display-group,
.share-tips {
  display: flex;
}

.modal-header-row {
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.modal-title-box {
  align-items: center;
  gap: 14px;
}

.modal-title-box h2 {
  color: var(--text-primary);
  font-size: 18px;
}

.modal-title-box p {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 13px;
}

.modal-icon-bubble {
  display: grid;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 14px;
  color: #059669;
  background: var(--brand-accent-subtle);
}

.share-bubble { color: #2563eb; background: #eff6ff; }

.modal-close {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  color: var(--text-tertiary);
}

.modal-close:hover,
.modal-close:focus-visible {
  color: var(--text-primary);
  background: var(--bg-surface-subtle);
  outline: none;
}

.generating-box {
  display: flex;
  min-height: 150px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
}

.share-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}

.share-options-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.share-expiry-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-expiry-field span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.share-expiry-field .select-input {
  width: 130px;
}
.share-content { margin-top: 18px; }
.link-display-group { align-items: stretch; gap: 8px; }
.share-url-input { min-width: 0; font-family: var(--font-mono); font-size: 12px; }
.copy-btn { flex-shrink: 0; }
.share-expiry, .share-loading, .share-empty {
  display: block;
  margin-top: 9px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.share-link-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  margin: 18px 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}
.share-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface-subtle);
}
.share-link-info {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 11px;
}
.share-status {
  padding: 3px 7px;
  border-radius: var(--radius-full);
  font-weight: 700;
}
.share-status-active { color: #047857; background: #ecfdf5; }
.share-status-expired { color: #92400e; background: #fffbeb; }
.share-status-revoked { color: #64748b; background: #f1f5f9; }
.revoke-share-btn { flex-shrink: 0; color: #b91c1c; }
.share-tips {
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: var(--bg-surface-subtle);
  font-size: 12px;
}

@keyframes workspace-spin { to { transform: rotate(360deg); } }

@media (max-width: 767px) {
  .gallery-workspace-page { width: 100%; padding: 14px 0 42px; }
  .workspace-breadcrumb { margin-bottom: 16px; }
  .photo-workspace-panel { padding: 20px 16px; }
  .photo-toolbar { display: block; }
  .processing-summary { justify-content: flex-start; margin-top: 14px; }
  .state-actions { width: 100%; flex-direction: column; }
  .state-actions .btn { width: 100%; }
  .workspace-share-modal { padding: 24px 18px; }
  .share-toolbar { align-items: stretch; flex-direction: column; }
  .share-options-row { align-items: stretch; flex-direction: column; }
  .share-options-row .btn { width: 100%; }
  .share-expiry-field .select-input { width: 100%; }
  .link-display-group { flex-direction: column; }
  .copy-btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-spinner { animation: none; }
}
</style>
