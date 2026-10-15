<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{ show: boolean; galleryTitle: string; photoCount: number }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const linkInput = ref<HTMLInputElement | null>(null)
const titleId = useId()
const linkId = useId()
const shareUrl = ref('')
const copied = ref(false)
const busy = ref(false)
const message = ref('')
const userAgent = navigator.userAgent
const isWeChat = /MicroMessenger/i.test(userAgent)
const isQq = /QQ\/[\d.]+|MQQBrowser/i.test(userAgent)
const canNativeShare = typeof navigator.share === 'function'
const shareText = computed(() => '邀请你欣赏「' + (props.galleryTitle || '光影之间') + '」，共 ' + props.photoCount + ' 件作品。')
let previousFocus: HTMLElement | null = null
let previousOverflow: string | null = null
let copyTimer: number | null = null
let disposed = false

function release() {
  dialog.value?.close()
  if (previousOverflow !== null) document.body.style.overflow = previousOverflow
  previousOverflow = null
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  previousFocus = null
  if (copyTimer !== null) window.clearTimeout(copyTimer)
  copyTimer = null
}
watch(() => props.show, async open => {
  if (!open) { release(); return }
  const publicUrl = new URL(window.location.href)
  publicUrl.searchParams.delete('preview')
  publicUrl.searchParams.delete('embed')
  shareUrl.value = publicUrl.href
  copied.value = false
  message.value = ''
  await nextTick()
  if (disposed || !props.show || !dialog.value || dialog.value.open) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  closeButton.value?.focus({ preventScroll: true })
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => { disposed = true; release() })

async function nativeShare() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await navigator.share({ title: props.galleryTitle || '光影之间', text: shareText.value, url: shareUrl.value })
  } catch (error) {
    if (!(error instanceof Error && error.name === 'AbortError')) message.value = '系统分享暂不可用，可以复制下方链接发送。'
  } finally { busy.value = false }
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    if (!props.show || disposed) return
    copied.value = true
    message.value = '展厅链接已复制，可以粘贴发送给朋友。'
    if (copyTimer !== null) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copied.value = false }, 3000)
  } catch {
    message.value = '未能自动复制。链接已选中，可长按或按 Ctrl / Command + C 复制。'
    linkInput.value?.focus()
    linkInput.value?.select()
  }
}
function keepFocusInDialog(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input') || [])
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <dialog v-if="show" ref="dialog" class="share-sheet" :aria-labelledby="titleId" aria-modal="true" @keydown="keepFocusInDialog" @cancel.prevent="emit('close')" @click.self="emit('close')">
      <div class="share-content">
        <header class="sheet-header">
          <h2 :id="titleId">把影展分享给朋友</h2>
          <button ref="closeButton" class="sheet-close" type="button" aria-label="关闭分享" @click="emit('close')"><Icon name="x" :size="20" /></button>
        </header>
        <p class="sheet-gallery">{{ galleryTitle || '光影之间' }}<span>{{ photoCount }} 件作品</span></p>
        <p v-if="isWeChat || isQq" class="app-guide">在{{ isWeChat ? '微信' : 'QQ' }}中，点击浏览器右上角菜单，即可转发给朋友{{ isWeChat ? '或分享到朋友圈' : '' }}。</p>
        <div class="link-field">
          <label :for="linkId">展厅链接</label>
          <input :id="linkId" ref="linkInput" :value="shareUrl" readonly type="url" spellcheck="false" @focus="linkInput?.select()" @click="linkInput?.select()" />
        </div>
        <div class="sheet-actions">
          <button class="sheet-action copy" type="button" @click="copyLink"><Icon :name="copied ? 'check' : 'share'" :size="17" /><span>{{ copied ? '链接已复制' : '复制链接' }}</span></button>
          <button v-if="canNativeShare" class="sheet-action native" type="button" :disabled="busy" @click="nativeShare"><Icon name="share" :size="17" /><span>{{ busy ? '正在打开…' : '更多分享方式' }}</span></button>
        </div>
        <p class="sheet-feedback" role="status" aria-live="polite">{{ message || '收到链接的人将按展厅的访问设置进入。' }}</p>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.share-sheet { position: fixed; inset: 0; width: min(480px, calc(100% - 40px)); max-width: none; max-height: calc(100dvh - 48px); margin: auto; padding: 0; border: 0; border-radius: 12px; overflow: auto; overscroll-behavior: contain; color: #202824; background: #fffefa; box-shadow: 0 24px 80px #101b1238; }
.share-sheet::backdrop { background: #10201899; }
.share-content { padding: 28px; }
.sheet-header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
.sheet-header h2 { padding-top: 5px; font: 400 25px/1.4 var(--font-serif); text-wrap: balance; }
.sheet-close { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; margin: -4px -8px 0 0; border-radius: 6px; color: #626c65; }.sheet-close:hover { background: #e8ede4; color: #202824; }
.sheet-gallery { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 14px; color: #202824; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }.sheet-gallery span { color: #626c65; }
.app-guide { margin-top: 20px; padding: 14px 16px; border-radius: 6px; background: #e8ede4; color: #355d49; font-size: 13px; line-height: 1.8; }
.link-field { margin-top: 28px; }.link-field label { display: block; margin-bottom: 10px; font-size: 12px; font-weight: 500; }.link-field input { width: 100%; min-height: 46px; padding: 12px; border: 1px solid #bdc7b8; border-radius: 6px; color: #626c65; background: #f4f3ef; font-size: 13px; }
.sheet-actions { display: flex; gap: 10px; margin-top: 16px; }.sheet-action { display: inline-flex; align-items: center; justify-content: center; gap: 9px; flex: 1; min-height: 46px; border-radius: 6px; font-size: 13px; font-weight: 500; }.copy { color: #fffefa; background: #26735d; }.copy:hover { background: #1b5746; }.native { color: #26735d; background: #e8ede4; }.native:hover:not(:disabled) { background: #dae4d6; }.native:disabled { opacity: .6; cursor: wait; }
.sheet-feedback { min-height: 38px; margin-top: 18px; color: #626c65; font-size: 12px; line-height: 1.7; }
@media (max-width: 600px) { .share-sheet { inset: auto 0 0; width: 100%; max-height: calc(100dvh - 40px); margin: 0; border-radius: 16px 16px 0 0; }.share-content { padding: 24px 24px max(24px, env(safe-area-inset-bottom)); }.sheet-header h2 { font-size: 23px; } }
</style>
