<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { apiFetch } from '../api'
import { useToast } from '../composables/useToast'

/**
 * 社交平台快捷分享按钮组
 *
 * - 微信：桌面端无网页分享协议，采用「二维码扫码」模式（二维码由后端基于短链接生成）；
 *   朋友圈无法直接发送网页链接，同样通过扫码或海报引导
 * - QQ 好友 / QQ空间：官方一键分享弹窗
 * - 移动端：优先使用系统原生分享（Web Share API）
 */
const props = withDefaults(defineProps<{
  shareUrl: string
  galleryName: string
  shareLinkId?: string
  coverUrl?: string | null
  compact?: boolean
}>(), {
  shareLinkId: '',
  coverUrl: null,
  compact: false
})

const toast = useToast()

const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

const shareText = computed(() =>
  `「${props.galleryName}」沉浸式照片展厅，点击进入浏览`
)

// ---- 微信二维码面板 ----
const qrPanelVisible = ref(false)
const qrChannel = ref<'wechat' | 'moments'>('wechat')
const qrLoading = ref(false)
const qrUrl = ref<string | null>(null)

async function openQrPanel(channel: 'wechat' | 'moments') {
  qrChannel.value = channel
  qrPanelVisible.value = true
  if (!props.shareLinkId) {
    // 无链接 ID 时无法取后端二维码，降级为复制链接引导
    await copyLink(true)
    qrPanelVisible.value = false
    return
  }
  if (!qrUrl.value) {
    await loadQrCode()
  }
}

async function loadQrCode() {
  qrLoading.value = true
  try {
    const response = await apiFetch(`/api/share-links/${props.shareLinkId}/qrcode`)
    if (!response.ok) throw new Error('二维码生成失败')
    const blob = await response.blob()
    if (qrUrl.value) URL.revokeObjectURL(qrUrl.value)
    qrUrl.value = URL.createObjectURL(blob)
  } catch {
    qrUrl.value = null
    toast.error('二维码生成失败，可复制链接后在微信中打开。')
  } finally {
    qrLoading.value = false
  }
}

// ---- QQ 分享 ----
function buildSocialUrl(baseUrl: string) {
  const params = new URLSearchParams({
    url: props.shareUrl,
    title: props.galleryName,
    summary: shareText.value
  })
  if (props.coverUrl) params.set('pics', props.coverUrl)
  return `${baseUrl}?${params.toString()}`
}

function shareToQq() {
  window.open(
    buildSocialUrl('https://connect.qq.com/widget/shareqq/index.html'),
    '_blank',
    'width=680,height=540,noopener'
  )
}

function shareToQzone() {
  window.open(
    buildSocialUrl('https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey'),
    '_blank',
    'width=680,height=560,noopener'
  )
}

// ---- 原生分享 / 复制 ----
async function nativeShare() {
  try {
    await navigator.share({ title: props.galleryName, text: shareText.value, url: props.shareUrl })
  } catch {
    // 用户取消分享时静默忽略
  }
}

async function copyLink(withGuide = false) {
  try {
    await navigator.clipboard.writeText(props.shareUrl)
    toast.success(withGuide ? '链接已复制，可粘贴到微信发送给好友。' : '链接已复制到剪贴板。')
  } catch {
    toast.error('复制失败，请手动选择链接复制。')
  }
}
</script>

<template>
  <div class="share-buttons" :class="{ compact }">
    <div class="share-buttons-row">
      <button class="share-chip wechat" type="button" @click="openQrPanel('wechat')">
        <span class="chip-dot">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8.7 4C5 4 2 6.6 2 9.8c0 1.8 1 3.4 2.5 4.5l-.7 2.2 2.5-1.3c.8.2 1.6.4 2.4.4h.4A5.9 5.9 0 0 1 9 14c0-3 2.9-5.4 6.4-5.4h.3C15 6 12.1 4 8.7 4Zm-2.2 3.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.5 2.6c-3.1 0-5.6 2-5.6 4.5s2.5 4.5 5.6 4.5c.7 0 1.3-.1 1.9-.3l2 1-.6-1.8c1.3-.9 2.3-2.1 2.3-3.4 0-2.5-2.5-4.5-5.6-4.5Zm-1.8 2.4a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3.6 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z"/>
          </svg>
        </span>
        <span>微信</span>
      </button>
      <button class="share-chip qq" type="button" @click="shareToQq">
        <span class="chip-dot">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2c-3 0-5 2.2-5 5.2 0 .7 0 1.4.2 2C6.3 10.4 5.4 12 4.7 14c-.9 2.5-.9 4.4-.2 4.6.6.2 1.4-.7 2.1-2 .3.8.8 1.5 1.4 2-1.2.3-2 .9-2 1.6 0 1 1.4 1.8 3 1.8 1.4 0 2.6-.6 2.9-1.4h.2c.3.8 1.5 1.4 2.9 1.4 1.6 0 3-.8 3-1.8 0-.7-.8-1.3-2-1.6.6-.5 1.1-1.2 1.4-2 .7 1.3 1.5 2.2 2.1 2 .7-.2.7-2.1-.2-4.6-.7-2-1.6-3.6-2.5-4.8.2-.6.2-1.3.2-2C17 4.2 15 2 12 2Z"/>
          </svg>
        </span>
        <span>QQ 好友</span>
      </button>
      <button class="share-chip qzone" type="button" @click="shareToQzone">
        <span class="chip-dot">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3.5 14.3 9l6 .4-4.6 3.8 1.5 5.8L12 15.8l-5.2 3.2 1.5-5.8L3.7 9.4l6-.4L12 3.5Z"/>
          </svg>
        </span>
        <span>QQ 空间</span>
      </button>
      <button class="share-chip moments" type="button" @click="openQrPanel('moments')">
        <span class="chip-dot">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9 4 7.8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.8L15 4H9Zm3 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 1.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z"/>
          </svg>
        </span>
        <span>朋友圈</span>
      </button>
      <button v-if="canNativeShare" class="share-chip native" type="button" @click="nativeShare">
        <span class="chip-dot">
          <Icon name="share" :size="13" />
        </span>
        <span>更多</span>
      </button>
    </div>

    <!-- 微信二维码面板 -->
    <Transition name="qr-fade">
      <div v-if="qrPanelVisible" class="wechat-panel">
        <div class="wechat-panel-header">
          <span class="wechat-panel-title">
            {{ qrChannel === 'wechat' ? '微信分享' : '分享到朋友圈' }}
          </span>
          <button class="qr-close" type="button" aria-label="关闭" @click="qrPanelVisible = false">
            <Icon name="x" :size="14" />
          </button>
        </div>
        <div class="qr-body">
          <div v-if="qrLoading" class="qr-loading">二维码生成中…</div>
          <img
            v-else-if="qrUrl"
            :src="qrUrl"
            alt="展厅分享二维码"
            class="qr-image"
          />
          <div v-else class="qr-fallback">
            二维码生成失败，请
            <button class="qr-retry" type="button" @click="loadQrCode">重试</button>
          </div>
          <div class="qr-tips">
            <template v-if="qrChannel === 'wechat'">
              <p>1. 用微信「扫一扫」二维码，在手机上打开展厅</p>
              <p>2. 点手机右上角「···」→ 发送给朋友</p>
            </template>
            <template v-else>
              <p>1. 用微信「扫一扫」二维码，在手机上打开展厅</p>
              <p>2. 点手机右上角「···」→ 分享到朋友圈</p>
              <p class="qr-tip-muted">朋友圈不能直接发链接，也可在上方生成海报后配图发布</p>
            </template>
          </div>
        </div>
        <button class="qr-copy-btn" type="button" @click="copyLink()">
          <Icon name="copy" :size="13" />
          复制链接，粘贴到{{ qrChannel === 'wechat' ? '微信' : '朋友圈' }}发送
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.share-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share-buttons-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.share-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.share-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.12);
}

.chip-dot {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.chip-dot svg {
  width: 13px;
  height: 13px;
  color: #fff;
}

.share-chip.wechat {
  background: rgba(7, 193, 96, 0.1);
  color: #07c160;
  border-color: rgba(7, 193, 96, 0.35);
}

.share-chip.wechat .chip-dot svg {
  color: #fff;
}

.share-chip.wechat:hover {
  background: rgba(7, 193, 96, 0.18);
}

.share-chip.qq {
  background: rgba(18, 183, 245, 0.1);
  color: #12b7f5;
  border-color: rgba(18, 183, 245, 0.35);
}

.share-chip.qq:hover {
  background: rgba(18, 183, 245, 0.18);
}

.share-chip.qzone {
  background: rgba(251, 191, 36, 0.12);
  color: #d97706;
  border-color: rgba(251, 191, 36, 0.4);
}

.share-chip.qzone:hover {
  background: rgba(251, 191, 36, 0.2);
}

.share-chip.moments {
  background: rgba(236, 72, 153, 0.1);
  color: #ec4899;
  border-color: rgba(236, 72, 153, 0.35);
}

.share-chip.moments:hover {
  background: rgba(236, 72, 153, 0.18);
}

.share-chip.native {
  background: #f1f5f9;
  color: #475569;
  border-color: #e2e8f0;
}

.share-chip.native:hover {
  background: #e2e8f0;
}

.share-chip.native .chip-dot {
  background: transparent;
  color: inherit;
  width: auto;
  height: auto;
}

/* 微信二维码面板 */
.wechat-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #a7f3d0;
  box-shadow: 0 8px 24px rgba(7, 193, 96, 0.12);
}

.wechat-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wechat-panel-title {
  font-size: 13px;
  font-weight: 750;
  color: #065f46;
}

.qr-close {
  display: grid;
  place-items: center;
  padding: 4px;
  border: none;
  border-radius: 50%;
  background: #f1f5f9;
  color: #64748b;
  cursor: pointer;
}

.qr-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.qr-body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.qr-loading,
.qr-fallback {
  width: 128px;
  height: 128px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  padding: 8px;
}

.qr-image {
  width: 128px;
  height: 128px;
  border-radius: 10px;
  flex-shrink: 0;
  border: 1px solid #e2e8f0;
}

.qr-retry {
  background: none;
  border: none;
  color: #059669;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.qr-tips {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #334155;
}

.qr-tips p {
  margin: 0;
  line-height: 1.5;
}

.qr-tip-muted {
  color: #94a3b8;
  font-size: 11.5px;
}

.qr-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: #07c160;
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.qr-copy-btn:hover {
  background: #059f50;
}

/* 紧凑模式（列表行内） */
.share-buttons.compact .share-chip {
  padding: 4px 10px;
  font-size: 12px;
}

.qr-fade-enter-active,
.qr-fade-leave-active {
  transition: opacity 0.18s ease;
}

.qr-fade-enter-from,
.qr-fade-leave-to {
  opacity: 0;
}
</style>
