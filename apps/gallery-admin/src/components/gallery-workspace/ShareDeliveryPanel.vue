<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Gallery, ShareLink } from '@vie/gallery-contracts'
import Icon from '../Icon.vue'
import ConfirmModal from '../ConfirmModal.vue'
import ShareButtons from '../ShareButtons.vue'
import PosterStudio from './PosterStudio.vue'
import {
  useShareDelivery,
  formatRemaining,
  formatLastAccessed,
  formatShareDate
} from '../../composables/useShareDelivery'
import { useToast } from '../../composables/useToast'
import { useModalFocus } from '../../composables/useModalFocus'
import { viewerOrigin } from '../../lib/preview'

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
  shortUrls,
  error,
  loadShareLinks,
  createShareLink,
  ensureShortLink,
  revokeShareLink,
  setGalleryPassword,
  clearGalleryPassword,
  updateGalleryVisibility
} = useShareDelivery(galleryId, computed(() => props.gallery))

const showModal = computed(() => props.show)
const publicUrl = computed(() => props.gallery?.visibility === 'PUBLIC' && props.gallery.status === 'PUBLISHED'
  ? `${viewerOrigin()}/g/${encodeURIComponent(props.gallery.slug)}` : '')
const { root: modalRoot } = useModalFocus(showModal, { onEscape: () => emit('close') })

const shareExpiryDays = ref(30)
const copied = ref(false)
const linkToRevoke = ref<ShareLink | null>(null)
const switchingVisibility = ref(false)

const activeShareTab = ref<'link' | 'poster'>('link')
function handleShareTabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  activeShareTab.value = event.key === 'Home' ? 'link' : event.key === 'End' ? 'poster'
    : activeShareTab.value === 'link' ? 'poster' : 'link'
  document.getElementById(activeShareTab.value === 'link' ? 'share-link-tab' : 'share-poster-tab')?.focus()
}
const generatingShortFor = ref<string | null>(null)

// 列表中展开分享按钮的链接（存当前可分享的短链接）
const sharingLink = ref<{ id: string; url: string } | null>(null)

// 点击列表行的「分享」：确保短链接后展开快捷分享按钮
async function toggleShareRow(link: ShareLink) {
  if (sharingLink.value?.id === link.id) {
    sharingLink.value = null
    return
  }
  const url = shortUrls.value[link.id] || await ensureShortLink(link.id)
  if (!url) {
    toast.error('短链接生成失败，无法分享，请稍后重试。')
    return
  }
  sharingLink.value = { id: link.id, url }
}

// 为列表中的已有链接补生成短链接并直接复制
async function handleGenerateShortLink(link: ShareLink) {
  if (generatingShortFor.value) return
  generatingShortFor.value = link.id
  try {
    const url = await ensureShortLink(link.id)
    if (url) {
      await copyUrl(url)
    } else {
      toast.error('短链接生成失败，请稍后重试。')
    }
  } finally {
    generatingShortFor.value = null
  }
}

async function handleVisibilityChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const newVis = target.value as 'PUBLIC' | 'PRIVATE' | 'PASSWORD'
  if (!props.gallery || newVis === props.gallery.visibility || switchingVisibility.value) return
  switchingVisibility.value = true
  try {
    await updateGalleryVisibility(newVis)
    if (newVis === 'PASSWORD') {
      editingPassword.value = true
      toast.info(props.gallery.status === 'PUBLISHED' ? '展厅已撤回，请设置访问密码后重新发布。' : '已切换为密码保护，请设置访问密码后再发布。')
    } else {
      toast.success(`访问模式已更新为「${newVis === 'PUBLIC' ? '公开' : '私密'}」`)
    }
    emit('gallery-updated')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '更新访问模式失败。')
    target.value = props.gallery.visibility
  } finally {
    switchingVisibility.value = false
  }
}

// Gallery password management
const editingPassword = ref(false)
const newPasswordInput = ref('')

watch(() => props.show, (isShown) => {
  if (isShown && props.gallery) {
    editingPassword.value = props.gallery.visibility === 'PASSWORD' && props.gallery.status !== 'PUBLISHED'
    newPasswordInput.value = ''
    copied.value = false
    activeShareTab.value = 'link'
    sharingLink.value = null
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
  const wasPublished = props.gallery?.status === 'PUBLISHED'
  try {
    await clearGalleryPassword()
    editingPassword.value = true
    newPasswordInput.value = ''
    toast.info(wasPublished ? '展厅已撤回，请设置新密码后重新发布。' : '访问密码已清除，请设置新密码后再发布。')
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
      <div ref="modalRoot" class="share-modal-card" :class="{ 'is-poster-studio': activeShareTab === 'poster' }" role="dialog" aria-modal="true" aria-labelledby="share-delivery-title" tabindex="-1">
        <!-- Header -->
        <header class="modal-header">
          <div class="header-title">
            <div class="header-icon">
              <Icon name="share" :size="20" />
            </div>
            <div>
              <h3 id="share-delivery-title">{{ publicUrl ? '展览已就绪' : '分享展厅' }}</h3>
              <p v-if="gallery">{{ publicUrl ? `把「${gallery.name}」分享给朋友，打开就能看。` : `设置「${gallery.name}」的访问方式` }}</p>
            </div>
          </div>
          <button class="close-icon-btn" type="button" aria-label="关闭" @click="$emit('close')">
            <Icon name="x" :size="18" />
          </button>
        </header>

        <div class="share-tabs" role="tablist" aria-label="分享方式">
          <button id="share-link-tab" type="button" role="tab" :aria-selected="activeShareTab === 'link'" aria-controls="share-link-panel"
            :tabindex="activeShareTab === 'link' ? 0 : -1" @click="activeShareTab = 'link'"
            @keydown="handleShareTabKey">
            <Icon name="link" :size="15" />链接分享
          </button>
          <button id="share-poster-tab" type="button" role="tab" :aria-selected="activeShareTab === 'poster'" aria-controls="share-poster-panel"
            :tabindex="activeShareTab === 'poster' ? 0 : -1" @click="activeShareTab = 'poster'"
            @keydown="handleShareTabKey">
            <Icon name="image" :size="15" />海报创作
          </button>
        </div>
        <div id="share-poster-panel" v-show="activeShareTab === 'poster'" role="tabpanel" aria-labelledby="share-poster-tab" class="modal-body">
          <PosterStudio v-if="show && gallery" :gallery="gallery" :active="activeShareTab === 'poster'" :can-create="isOwner === true" @downloaded="loadShareLinks" />
        </div>
        <div id="share-link-panel" v-show="activeShareTab === 'link'" role="tabpanel" aria-labelledby="share-link-tab" class="modal-body">
          <section v-if="publicUrl" class="direct-share">
            <label for="public-gallery-link">展厅链接</label>
            <input id="public-gallery-link" :value="publicUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
            <div class="direct-share-actions">
              <button class="btn btn-primary" type="button" @click="copyUrl(publicUrl)">{{ copied ? '已复制' : '复制链接' }}</button>
              <a class="btn btn-secondary" :href="publicUrl" target="_blank" rel="noopener">打开展览</a>
            </div>
          </section>
          <details :open="!publicUrl" class="share-options">
          <summary>更多分享设置</summary>
          <!-- Access Mode Section -->
          <section class="delivery-section">
            <div class="section-title-row">
              <h4 class="section-title">
                <Icon name="lock" :size="14" />
                <span>访问模式</span>
              </h4>
              <div v-if="isOwner" class="mode-switch-wrapper">
                <select
                  id="delivery-visibility-select"
                  :value="gallery?.visibility"
                  aria-label="展厅访问方式"
                  :disabled="switchingVisibility"
                  class="visibility-select"
                  @change="handleVisibilityChange"
                >
                  <option value="PUBLIC">公开</option>
                  <option value="PRIVATE">私密</option>
                  <option value="PASSWORD">密码保护</option>
                </select>
              </div>
            </div>
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
                  私密展厅：只有收到专属分享链接的人才能访问。
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
                <p class="password-hint">保存至少 6 位访问密码，访客收到链接后凭密码进入。</p>
                <input
                  aria-label="相册访问密码"
                  v-model="newPasswordInput"
                  type="password"
                  autocomplete="new-password"
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
                <input
                  readonly
                  :value="latestCreatedLink.shortUrl || latestCreatedLink.shareUrl"
                  class="url-input"
                />
                <button
                  class="btn btn-copy"
                  type="button"
                  @click="copyUrl(latestCreatedLink.shortUrl || latestCreatedLink.shareUrl)"
                >
                  <Icon :name="copied ? 'check' : 'copy'" :size="14" />
                  <span>{{ copied ? '已复制' : '复制链接' }}</span>
                </button>
              </div>
              <p v-if="latestCreatedLink.shortUrl" class="delivery-note full-url-note">
                完整链接（同样有效）：<span class="full-url-text">{{ latestCreatedLink.shareUrl }}</span>
              </p>
              <p v-else class="delivery-note full-url-note">
                短链接生成失败，可使用上方完整链接。
              </p>
              <p class="delivery-note">
                将此链接直接发送给访客，访客无需注册账号即可进入展厅体验沉浸式画廊。
              </p>
              <ShareButtons
                :share-url="latestCreatedLink.shortUrl || latestCreatedLink.shareUrl"
                :gallery-name="gallery?.name || ''"
                :share-link-id="latestCreatedLink.id"
                :cover-url="gallery?.coverThumbnailUrl || null"
              />
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
                  <div v-if="link.status === 'ACTIVE' && shortUrls[link.id]" class="link-short-row">
                    <span class="link-short-url">{{ shortUrls[link.id] }}</span>
                    <button class="btn-link btn-xs-link" type="button" @click="copyUrl(shortUrls[link.id])">
                      复制
                    </button>
                  </div>
                </div>
                <div class="link-item-actions">
                  <button
                    v-if="link.status === 'ACTIVE'"
                    class="btn btn-ghost btn-xs"
                    type="button"
                    :disabled="generatingShortFor === link.id"
                    @click="toggleShareRow(link)"
                  >
                    {{ sharingLink?.id === link.id ? '收起分享' : '分享' }}
                  </button>
                  <button
                    v-if="link.status === 'ACTIVE' && !shortUrls[link.id]"
                    class="btn btn-ghost btn-xs"
                    type="button"
                    :disabled="generatingShortFor === link.id"
                    @click="handleGenerateShortLink(link)"
                  >
                    {{ generatingShortFor === link.id ? '生成中…' : '生成短链' }}
                  </button>
                  <button
                    v-if="link.status === 'ACTIVE'"
                    class="btn btn-danger-ghost btn-xs"
                    type="button"
                    @click="promptRevoke(link)"
                  >
                    撤销链接
                  </button>
                </div>
                <div v-if="link.status === 'ACTIVE' && sharingLink?.id === link.id" class="link-share-row">
                  <ShareButtons
                    compact
                    :share-url="sharingLink.url"
                    :gallery-name="gallery?.name || ''"
                    :share-link-id="link.id"
                    :cover-url="gallery?.coverThumbnailUrl || null"
                  />
                </div>
              </li>
            </ul>
          </section>
          </details>
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
.share-modal-card.is-poster-studio { width:min(980px, calc(100% - 32px)); }
.share-tabs { display:flex; gap:22px; padding:0 24px; border-bottom:1px solid var(--border-default, #e0e7e2); flex-shrink:0; }
.share-tabs button { display:flex; align-items:center; gap:7px; padding:14px 0; border:0; border-bottom:2px solid transparent; background:none; color:var(--text-secondary); font:inherit; font-size:13px; cursor:pointer; }
.share-tabs button[aria-selected=true] { border-color:var(--brand-deep); color:var(--brand-deep); font-weight:650; }
.share-tabs button:focus-visible { outline:2px solid var(--brand-deep); outline-offset:2px; }
.direct-share { display:grid; gap:14px; padding-bottom:24px; }
.direct-share label { color:var(--text-secondary); font-size:13px; }
.direct-share input { width:100%; box-sizing:border-box; border:1px solid var(--border-strong); border-radius:10px; padding:14px; background:var(--bg-app); color:var(--text-primary); font-size:14px; font-family:var(--font-sans); }
.direct-share-actions { display:flex; gap:10px; flex-wrap:wrap; }
.direct-share-actions a { text-decoration:none; }
.share-options > summary { cursor:pointer; color:var(--text-secondary); font-size:13px; padding:14px 0; }
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
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
  font-family: var(--font-sans);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--bg-app);
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
  background: var(--mint-soft);
  color: var(--brand-deep);
}

.header-title h3 {
  font-size: 17px;
  font-weight: 750;
  color: var(--text-primary);
  margin: 0;
}

.header-title p {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin: 2px 0 0;
}

.close-icon-btn {
  min-width: 40px;
  min-height: 40px;
  padding: 6px;
  border-radius: 50%;
  background: var(--bg-app);
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  display: grid;
  place-items: center;
}

.close-icon-btn:hover {
  background: var(--bg-app);
  color: var(--text-primary);
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

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.visibility-select {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background-color: var(--bg-surface);
  color: #334155;
  cursor: pointer;
  outline: none;
}

.visibility-select:focus {
  border-color: var(--brand-accent);
  box-shadow: 0 0 0 2px var(--mint-soft);
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
  background: var(--bg-app);
  border: 1px solid var(--border-strong);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-banner.is-public {
  background: var(--mint-soft);
  border-color: var(--mint-soft);
}

.mode-banner.is-password {
  background: #fffbeb;
  border-color: rgba(245, 158, 11, 0.3);
}

.mode-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.mode-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.password-box {
  margin-top: 6px;
  padding: 12px 14px;
  background: var(--bg-app);
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
  color: var(--text-secondary);
}

.download-info-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-app);
  border: 1px solid var(--border-strong);
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
  background: var(--mint-soft);
  color: var(--brand-deep);
}

.download-status-badge.is-disabled {
  background: var(--bg-app);
  color: var(--text-secondary);
}

.download-tip {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.config-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-accent);
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
  color: var(--text-secondary);
}

.expiry-select {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  background: var(--bg-surface);
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
  border-radius: 12px;
  background: linear-gradient(135deg, var(--mint-soft), var(--mint-soft));
  border: 1px solid var(--mint-soft);
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
  color: var(--brand-deep);
}

.remaining-tag {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-accent);
  background: var(--mint-soft);
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
  background: var(--bg-surface);
  font-size: 12.5px;
  color: var(--brand-deep);
}

.btn-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  background: var(--brand-accent);
  color: var(--bg-surface);
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

.btn-copy:hover {
  background: var(--brand-deep);
}

.delivery-note {
  margin: 0;
  font-size: 11.5px;
  color: var(--brand-deep);
}

.full-url-note {
  color: var(--text-secondary);
  word-break: break-all;
}

.full-url-text {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Links list */
.links-empty {
  padding: 20px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-tertiary);
  background: var(--bg-app);
  border-radius: 12px;
  border: 1px dashed var(--border-strong);
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
  background: var(--bg-app);
  border-radius: 10px;
  border: 1px solid #eef2f6;
  flex-wrap: wrap;
}

.link-share-row {
  width: 100%;
  padding-top: 8px;
  border-top: 1px dashed var(--border-strong);
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
  background: var(--mint-soft);
  color: var(--brand-deep);
}

.status-pill.is-expired {
  background: var(--bg-app);
  color: var(--text-secondary);
}

.status-pill.is-revoked {
  background: #fef2f2;
  color: #dc2626;
}

.time-pill {
  font-size: 11px;
  color: var(--text-secondary);
}

.link-meta-row {
  font-size: 11.5px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-dot {
  opacity: 0.5;
}

.link-short-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--brand-deep);
}

.link-short-url {
  font-weight: 600;
  word-break: break-all;
}

.btn-xs-link {
  font-size: 11px;
  font-weight: 600;
  padding: 0;
  flex-shrink: 0;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 14px 24px;
  border-top: 1px solid var(--bg-app);
  background: var(--bg-app);
}

.btn-link {
  background: none;
  border: none;
  color: var(--brand-accent);
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

.btn-xs {
  padding: 3px 8px;
  font-size: 11.5px;
  border-radius: 6px;
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
