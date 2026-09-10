<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Gallery, ShareLink } from '@vie/gallery-contracts'
import Icon from '../Icon.vue'
import ConfirmModal from '../ConfirmModal.vue'
import {
  useShareDelivery,
  formatRemaining,
  formatLastAccessed,
  formatShareDate
} from '../../composables/useShareDelivery'
import { useToast } from '../../composables/useToast'
import { useModalFocus } from '../../composables/useModalFocus'

const props = defineProps<{
  show: boolean
  gallery: Gallery | null
  isOwner?: boolean
  canManage?: boolean
  visitorAllowDownload?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-config'): void
  (e: 'gallery-updated'): void
}>()

const toast = useToast()
const galleryId = computed(() => props.gallery?.id || '')
const {
  shareLinks,
  loading,
  generating,
  revoking,
  savingPassword,
  latestCreatedLink,
  error,
  loadShareLinks,
  createShareLink,
  revokeShareLink,
  setGalleryPassword,
  clearGalleryPassword
} = useShareDelivery(galleryId, computed(() => props.gallery))

const showModal = computed(() => props.show)
const { root: modalRoot } = useModalFocus(showModal, { onEscape: () => emit('close') })

const shareExpiryDays = ref(30)
const copied = ref(false)
const linkToRevoke = ref<ShareLink | null>(null)

// Gallery password management
const editingPassword = ref(false)
const newPasswordInput = ref('')

watch(() => props.show, (isShown) => {
  if (isShown && props.gallery) {
    editingPassword.value = false
    newPasswordInput.value = ''
    copied.value = false
    void loadShareLinks()
  }
})

async function handleGenerateLink() {
  if (!props.gallery || generating.value) return
  try {
    const url = await createShareLink(shareExpiryDays.value)
    toast.success('分享链接已生成！')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '生成分享链接失败。')
  }
}

async function copyUrl(url: string) {
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    toast.success('链接已复制到剪贴板！')
    window.setTimeout(() => { copied.value = false }, 2500)
  } catch {
    toast.error('复制失败，请手动选择复制。')
  }
}

function promptRevoke(link: ShareLink) {
  linkToRevoke.value = link
}

async function confirmRevoke() {
  if (!linkToRevoke.value || revoking.value) return
  const id = linkToRevoke.value.id
  try {
    await revokeShareLink(id)
    toast.success('分享链接已成功撤销。')
    linkToRevoke.value = null
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '撤销分享链接失败。')
  }
}

async function handleSavePassword() {
  const pwd = newPasswordInput.value.trim()
  if (pwd.length < 6) {
    toast.warning('相册密码长度至少需要 6 个字符。')
    return
  }
  try {
    await setGalleryPassword(pwd)
    editingPassword.value = false
    newPasswordInput.value = ''
    toast.success('相册访问密码已设置。')
    emit('gallery-updated')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '设置密码失败。')
  }
}

async function handleClearPassword() {
  try {
    await clearGalleryPassword()
    editingPassword.value = false
    newPasswordInput.value = ''
    toast.success('相册访问密码已清除。')
    emit('gallery-updated')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '清除密码失败。')
  }
}

function shareStatusLabel(status: string) {
  if (status === 'ACTIVE') return '有效'
  if (status === 'EXPIRED') return '已过期'
  if (status === 'REVOKED') return '已撤销'
  return status
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-backdrop" @click.self="$emit('close')">
      <div ref="modalRoot" class="share-modal-card" role="dialog" aria-modal="true" tabindex="-1">
        <!-- Header -->
        <header class="modal-header">
          <div class="header-title">
            <div class="header-icon">
              <Icon name="share" :size="20" />
            </div>
            <div>
              <h3>展厅分享与交付</h3>
              <p v-if="gallery">为「{{ gallery.name }}」配置分享链接与访客访问权限</p>
            </div>
          </div>
          <button class="close-icon-btn" type="button" aria-label="关闭" @click="$emit('close')">
            <Icon name="x" :size="18" />
          </button>
        </header>

        <div class="modal-body">
          <!-- Access Mode Section -->
          <section class="delivery-section">
            <h4 class="section-title">
              <Icon name="lock" :size="14" />
              <span>访问模式</span>
            </h4>
            <div class="mode-banner" :class="`is-${gallery?.visibility.toLowerCase()}`">
              <div class="mode-badge">
                {{ gallery?.visibility === 'PUBLIC' ? '公开展厅' : gallery?.visibility === 'PASSWORD' ? '密码展厅' : '私密展厅' }}
              </div>
              <div class="mode-desc">
                <template v-if="gallery?.visibility === 'PUBLIC'">
                  公开展厅：任何持有链接的用户均可直接进入浏览展厅。
                </template>
                <template v-else-if="gallery?.visibility === 'PASSWORD'">
                  密码展厅：访客进入时需要输入相册专属访问密码，解锁后获得 30 分钟临时浏览会话。
                </template>
                <template v-else>
                  私密展厅：必须使用携带专属安全 Token 的分享链接才能访问，未授权访客无法进入。
                </template>
              </div>
            </div>

            <!-- Password Configuration for PASSWORD Gallery -->
            <div v-if="gallery?.visibility === 'PASSWORD' && isOwner" class="password-box">
              <div class="password-header">
                <strong>相册访问密码</strong>
                <button
                  v-if="!editingPassword"
                  class="btn-link"
                  type="button"
                  @click="editingPassword = true"
                >
                  {{ gallery.status === 'PUBLISHED' ? '修改密码' : '设置密码' }}
                </button>
              </div>
              <div v-if="editingPassword" class="password-form">
                <input
                  v-model="newPasswordInput"
                  type="password"
                  class="pwd-input"
                  placeholder="输入至少 6 位访问密码"
                  maxlength="64"
                />
                <div class="pwd-actions">
                  <button class="btn btn-secondary btn-sm" type="button" @click="editingPassword = false">取消</button>
                  <button class="btn btn-primary btn-sm" type="button" :disabled="savingPassword" @click="handleSavePassword">
                    {{ savingPassword ? '保存中…' : '保存密码' }}
                  </button>
                  <button class="btn btn-ghost btn-sm text-danger" type="button" :disabled="savingPassword" @click="handleClearPassword">
                    清除密码
                  </button>
                </div>
              </div>
              <p v-else class="password-hint">
                访客进入展厅时输入密码即可解锁浏览。
              </p>
            </div>
          </section>

          <!-- Visitor Permissions Section -->
          <section class="delivery-section">
            <h4 class="section-title">
              <Icon name="download" :size="14" />
              <span>访客下载权限</span>
            </h4>
            <div class="download-info-row">
              <div class="download-status-badge" :class="visitorAllowDownload ? 'is-allowed' : 'is-disabled'">
                <Icon :name="visitorAllowDownload ? 'check' : 'x'" :size="12" />
                <span>{{ visitorAllowDownload ? '允许访客下载' : '禁止访客下载（默认）' }}</span>
              </div>
              <p class="download-tip">
                {{ visitorAllowDownload ? '访客在大图查看时可下载中等画质照片。' : '访客仅可在线浏览，无法直接下载照片。' }}
              </p>
              <button class="btn-link config-link" type="button" @click="$emit('open-config'); $emit('close')">
                前往展厅配置调整
                <Icon name="arrow-right" :size="12" />
              </button>
            </div>
          </section>

          <!-- Create Share Link Section -->
          <section class="delivery-section">
            <h4 class="section-title">
              <Icon name="link" :size="14" />
              <span>创建分享链接</span>
            </h4>
            <div class="create-link-row">
              <div class="expiry-select-group">
                <label for="share-expiry-select">有效期：</label>
                <select id="share-expiry-select" v-model="shareExpiryDays" class="expiry-select">
                  <option :value="7">7 天有效</option>
                  <option :value="30">30 天有效</option>
                  <option :value="90">90 天有效</option>
                  <option :value="0">永久有效</option>
                </select>
              </div>
              <button
                class="btn btn-primary generate-btn"
                type="button"
                :disabled="generating || gallery?.status !== 'PUBLISHED'"
                @click="handleGenerateLink"
              >
                <Icon name="sparkles" :size="14" />
                <span>{{ generating ? '生成中…' : '生成交付链接' }}</span>
              </button>
            </div>
            <p v-if="gallery?.status !== 'PUBLISHED'" class="warn-tip">
              展厅目前处于草稿状态，请先发布展厅后再生成公开分享链接。
            </p>
          </section>

          <!-- Delivery Confirmation State -->
          <Transition name="fade">
            <section v-if="latestCreatedLink" class="confirmation-box">
              <div class="confirmation-header">
                <span class="confirm-tag">
                  <Icon name="check" :size="12" stroke-width="3" />
                  已生成交付链接
                </span>
                <span class="remaining-tag">{{ formatRemaining(latestCreatedLink.expiresAt) }}</span>
              </div>
              <div class="copy-url-bar">
                <input readonly :value="latestCreatedLink.shareUrl" class="url-input" />
                <button class="btn btn-copy" type="button" @click="copyUrl(latestCreatedLink.shareUrl)">
                  <Icon :name="copied ? 'check' : 'copy'" :size="14" />
                  <span>{{ copied ? '已复制' : '复制链接' }}</span>
                </button>
              </div>
              <p class="delivery-note">
                将此链接直接发送给访客，访客无需注册账号即可进入展厅体验沉浸式画廊。
              </p>
            </section>
          </Transition>

          <!-- Existing Links List -->
          <section class="delivery-section">
            <h4 class="section-title">
              <Icon name="clock" :size="14" />
              <span>已有分享链接 ({{ shareLinks.length }})</span>
            </h4>
            <div v-if="loading" class="links-empty">加载分享链接中…</div>
            <div v-else-if="!shareLinks.length" class="links-empty">
              暂无已创建的分享链接。在上方选择有效期生成第一条链接。
            </div>
            <ul v-else class="links-list">
              <li v-for="link in shareLinks" :key="link.id" class="link-item" :class="`status-${link.status.toLowerCase()}`">
                <div class="link-item-info">
                  <div class="link-tags">
                    <span class="status-pill" :class="`is-${link.status.toLowerCase()}`">
                      {{ shareStatusLabel(String(link.status)) }}
                    </span>
                    <span class="time-pill">{{ formatRemaining(link.expiresAt) }}</span>
                  </div>
                  <div class="link-meta-row">
                    <span>创建于 {{ formatShareDate(link.createdAt) }}</span>
                    <span class="meta-dot">·</span>
                    <span>最近访问：{{ formatLastAccessed(link.lastAccessedAt) }}</span>
                  </div>
                </div>
                <div class="link-item-actions">
                  <button
                    v-if="link.status === 'ACTIVE'"
                    class="btn btn-danger-ghost btn-xs"
                    type="button"
                    @click="promptRevoke(link)"
                  >
                    撤销链接
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" type="button" @click="$emit('close')">
            完成
          </button>
        </footer>
      </div>
    </div>
  </Transition>

  <!-- Revoke Confirmation Modal -->
  <ConfirmModal
    :show="!!linkToRevoke"
    title="确认撤销此分享链接？"
    message="撤销后该链接将立即失效，已获得该链接的访客将无法再访问展厅。"
    confirm-text="确认撤销"
    danger
    :loading="revoking"
    @confirm="confirmRevoke"
    @cancel="linkToRevoke = null"
  />
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
}

.share-modal-card {
  width: min(600px, calc(100% - 32px));
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
  font-family: var(--font-family, 'Plus Jakarta Sans', system-ui, sans-serif);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.header-title h3 {
  font-size: 17px;
  font-weight: 750;
  color: #0f172a;
  margin: 0;
}

.header-title p {
  font-size: 12.5px;
  color: #64748b;
  margin: 2px 0 0;
}

.close-icon-btn {
  padding: 6px;
  border-radius: 50%;
  background: #f8fafc;
  color: #64748b;
  cursor: pointer;
  border: none;
  display: grid;
  place-items: center;
}

.close-icon-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.delivery-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  margin: 0;
}

.mode-banner {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-banner.is-public {
  background: #ecfdf5;
  border-color: rgba(16, 185, 129, 0.3);
}

.mode-banner.is-password {
  background: #fffbeb;
  border-color: rgba(245, 158, 11, 0.3);
}

.mode-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.mode-desc {
  font-size: 12.5px;
  color: #475569;
  line-height: 1.4;
}

.password-box {
  margin-top: 6px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
}

.password-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.password-form {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pwd-input {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
}

.pwd-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.password-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
}

.download-info-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.download-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  width: fit-content;
}

.download-status-badge.is-allowed {
  background: #ecfdf5;
  color: #047857;
}

.download-status-badge.is-disabled {
  background: #f1f5f9;
  color: #64748b;
}

.download-tip {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.config-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #00b88f;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  width: fit-content;
}

.create-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.expiry-select-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}

.expiry-select {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  background: #fff;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
}

.warn-tip {
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}

/* Confirmation box */
.confirmation-box {
  padding: 14px 16px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
  border: 1px solid rgba(16, 185, 129, 0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirmation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.confirm-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 750;
  color: #047857;
}

.remaining-tag {
  font-size: 11.5px;
  font-weight: 600;
  color: #059669;
  background: rgba(16, 185, 129, 0.15);
  padding: 2px 8px;
  border-radius: 9999px;
}

.copy-url-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.url-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #a7f3d0;
  background: #ffffff;
  font-size: 12.5px;
  color: #065f46;
}

.btn-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  background: #00b88f;
  color: #fff;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

.btn-copy:hover {
  background: #047857;
}

.delivery-note {
  margin: 0;
  font-size: 11.5px;
  color: #047857;
}

/* Links list */
.links-empty {
  padding: 20px;
  text-align: center;
  font-size: 12.5px;
  color: #94a3b8;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px dashed #e2e8f0;
}

.links-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #eef2f6;
}

.link-item.status-revoked,
.link-item.status-expired {
  opacity: 0.65;
}

.link-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
}

.status-pill.is-active {
  background: #ecfdf5;
  color: #047857;
}

.status-pill.is-expired {
  background: #f1f5f9;
  color: #64748b;
}

.status-pill.is-revoked {
  background: #fef2f2;
  color: #dc2626;
}

.time-pill {
  font-size: 11px;
  color: #475569;
}

.link-meta-row {
  font-size: 11.5px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-dot {
  opacity: 0.5;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 14px 24px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.btn-link {
  background: none;
  border: none;
  color: #00b88f;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.text-danger {
  color: #dc2626;
}

.btn-danger-ghost {
  background: transparent;
  border: 1px solid #fecaca;
  color: #dc2626;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11.5px;
  cursor: pointer;
}

.btn-danger-ghost:hover {
  background: #fef2f2;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
