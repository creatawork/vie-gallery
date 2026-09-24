<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'

/**
 * 访客端分享面板
 *
 * 微信/QQ 内置浏览器没有「···」之外的网页分享协议（微信 JS-SDK 需要公众号配置），
 * 因此这里只做三类引导：内置浏览器引导用户点右上角「···」菜单、
 * 支持时调用系统原生分享（Web Share API）、以及复制链接兜底。
 */
const props = defineProps<{
  show: boolean
  galleryTitle: string
  photoCount: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const shareUrl = ref('')
const copied = ref(false)
const copyFailed = ref(false)

const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isWeChat = /MicroMessenger/i.test(userAgent)
const isQq = /QQ\/[\d.]+|MQQBrowser/i.test(userAgent)
const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

const shareText = computed(() =>
  `「${props.galleryTitle}」沉浸式照片展厅，一起来看这 ${props.photoCount} 张照片。`
)

watch(() => props.show, (isShown) => {
  if (isShown) {
    shareUrl.value = window.location.href
    copied.value = false
    copyFailed.value = false
  }
})

async function nativeShare() {
  try {
    await navigator.share({ title: props.galleryTitle, text: shareText.value, url: shareUrl.value })
  } catch {
    // 用户取消分享时静默忽略
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    copyFailed.value = false
    window.setTimeout(() => { copied.value = false }, 2500)
  } catch {
    copyFailed.value = true
  }
}

const inAppGuideText = computed(() => {
  if (isWeChat) return { first: '点击右上角「···」', second: '发送给朋友 / 分享到朋友圈' }
  if (isQq) return { first: '点击右上角「···」', second: '分享给 QQ 好友 / QQ 空间' }
  return null
})
</script>

<template>
  <Transition name="share-sheet-fade">
    <div v-if="show" class="share-sheet-backdrop" @click.self="emit('close')">
      <div class="share-sheet" role="dialog" aria-modal="true" aria-label="分享给朋友">
        <header class="sheet-header">
          <h3>分享给朋友</h3>
          <button class="sheet-close" type="button" aria-label="关闭" @click="emit('close')">
            <Icon name="x" :size="16" />
          </button>
        </header>

        <!-- 内置浏览器引导：微信 / QQ 的转发入口都在右上角「···」 -->
        <div v-if="inAppGuideText" class="app-guide">
          <span class="dots-badge">···</span>
          <div class="guide-steps">
            <p>{{ inAppGuideText.first }}</p>
            <p class="guide-strong">{{ inAppGuideText.second }}</p>
          </div>
        </div>

        <div class="sheet-actions">
          <button v-if="canNativeShare" class="sheet-action native" type="button" @click="nativeShare">
            <Icon name="share" :size="16" />
            <span>系统分享</span>
          </button>
          <button class="sheet-action copy" :class="{ done: copied, failed: copyFailed }" type="button" @click="copyLink">
            <Icon :name="copied ? 'check' : 'share'" :size="16" />
            <span>{{ copied ? '已复制，去粘贴发送' : copyFailed ? '复制失败，请长按地址栏复制' : '复制展厅链接' }}</span>
          </button>
        </div>

        <p class="sheet-note">{{ galleryTitle }} · {{ photoCount }} 张照片</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.share-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(4, 8, 18, 0.6);
  backdrop-filter: blur(6px);
}

.share-sheet {
  width: min(420px, calc(100% - 24px));
  margin-bottom: max(16px, env(safe-area-inset-bottom));
  padding: 18px 18px 14px;
  border-radius: 18px;
  background: rgba(17, 24, 39, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  color: #f8fafc;
  backdrop-filter: blur(14px);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sheet-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.sheet-close {
  display: grid;
  place-items: center;
  padding: 5px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  cursor: pointer;
}

.sheet-close:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.app-guide {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.dots-badge {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
}

.guide-steps p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: #d1fae5;
}

.guide-steps .guide-strong {
  font-weight: 700;
  color: #fff;
}

.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sheet-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  font-size: 13.5px;
  font-weight: 650;
  cursor: pointer;
}

.sheet-action.native {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.4);
}

.sheet-action.native:hover {
  background: rgba(59, 130, 246, 0.28);
}

.sheet-action.copy:hover {
  background: rgba(255, 255, 255, 0.12);
}

.sheet-action.copy.done {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.5);
}

.sheet-action.copy.failed {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.45);
}

.sheet-note {
  margin: 12px 0 0;
  text-align: center;
  font-size: 11.5px;
  color: #94a3b8;
}

.share-sheet-fade-enter-active,
.share-sheet-fade-leave-active {
  transition: opacity 0.18s ease;
}

.share-sheet-fade-enter-from,
.share-sheet-fade-leave-to {
  opacity: 0;
}
</style>
