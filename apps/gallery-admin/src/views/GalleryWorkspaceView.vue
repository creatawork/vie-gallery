<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'
import { useGalleryWorkspace, type WorkspacePhoto } from '../composables/useGalleryWorkspace'

type LightboxPhoto = Omit<WorkspacePhoto, 'title'> & { title?: string }
import { apiFetch } from '../api'
import Icon from '../components/Icon.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import LightboxModal from '../components/LightboxModal.vue'
import GalleryWorkspaceHeader from '../components/gallery-workspace/GalleryWorkspaceHeader.vue'
import GalleryUploadDropzone from '../components/gallery-workspace/GalleryUploadDropzone.vue'
import GalleryPhotoGrid from '../components/gallery-workspace/GalleryPhotoGrid.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currentUser, loading: authLoading } = useAuth()
const galleryId = computed(() => String(route.params.id || ''))
const workspace = useGalleryWorkspace(galleryId, computed(() => !!currentUser.value && !authLoading.value))

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
const copied = ref(false)

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

function openViewer() {
  if (!workspace.gallery.value) return
  window.open(viewerUrl(workspace.gallery.value.slug), '_blank', 'noopener,noreferrer')
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  showLightbox.value = true
}

async function handleUpload(files: FileList | File[]) {
  try {
    const summary = await workspace.uploadFiles(files)
    if (summary.failed || summary.timedOut) {
      toast.warning(`已上传 ${summary.succeeded} 张，${summary.failed + summary.timedOut} 张照片仍需检查。`)
    } else {
      toast.success(`成功上传并处理 ${summary.succeeded} 张照片！`)
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '照片上传失败，请重试。')
  }
}

async function handleSetCover(photo: Pick<WorkspacePhoto, 'id'>) {
  try {
    await workspace.setCover(photo)
    toast.success('已成功设为相册封面！')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '设置封面失败。')
  }
}

function promptDeletePhoto(photo: Pick<WorkspacePhoto, 'id'>) {
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

async function openShareModal() {
  if (!workspace.gallery.value) return
  showShareModal.value = true
  generatingShare.value = true
  shareLinkData.value = null
  copied.value = false
  try {
    const response = await apiFetch(`/api/galleries/${workspace.gallery.value.id}/share-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (!response.ok) throw new Error('生成分享链接失败，请稍后重试。')
    const data = await response.json() as { rawToken?: string; expiresAt?: string }
    if (!data.rawToken) throw new Error('分享凭证生成失败，请稍后重试。')
    shareLinkData.value = {
      shareUrl: `${viewerUrl(workspace.gallery.value.slug)}?t=${data.rawToken}`,
      expiresAt: data.expiresAt
    }
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
          @config="goToConfig"
          @share="openShareModal"
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
            :uploading="workspace.uploading.value"
            :progress="workspace.uploadProgress.value"
            :status-text="workspace.uploadStatusText.value"
            @files="handleUpload"
          />
          <GalleryPhotoGrid
            :photos="workspace.photos.value"
            @open="openLightbox"
            @set-cover="handleSetCover"
            @delete="promptDeletePhoto"
          />
        </section>
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

          <div v-if="generatingShare" class="generating-box" role="status">
            <Icon name="refresh" :size="24" class="spin" />
            <p>正在生成加密分享凭证…</p>
          </div>
          <div v-else-if="shareLinkData" class="share-content">
            <div class="link-display-group">
              <input :value="shareLinkData.shareUrl" readonly aria-label="分享链接" class="form-input share-url-input" />
              <button class="btn btn-primary copy-btn" type="button" @click="copyShareUrl">
                <Icon :name="copied ? 'check' : 'copy'" :size="16" />
                <span>{{ copied ? '已复制' : '复制链接' }}</span>
              </button>
            </div>
            <p class="share-tips"><Icon name="lock" :size="14" />任何拥有此链接的用户都可以打开访客预览。</p>
          </div>
        </div>
      </div>
    </Transition>

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

.share-content { margin-top: 26px; }
.link-display-group { align-items: stretch; gap: 8px; }
.share-url-input { min-width: 0; font-family: var(--font-mono); font-size: 12px; }
.copy-btn { flex-shrink: 0; }
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
  .link-display-group { flex-direction: column; }
  .copy-btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-spinner { animation: none; }
}
</style>
