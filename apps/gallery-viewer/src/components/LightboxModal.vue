<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import Icon from './Icon.vue'

interface PhotoItem {
  title?: string | null
  thumbnailUrl?: string | null
  width?: number | null
  height?: number | null
  sortOrder?: number | null
  mediumUrl?: string | null
  textureUrl?: string | null
}

interface Props {
  show: boolean
  photos: PhotoItem[]
  currentIndex: number
  allowDownload?: boolean
  thumbnailRect?: { x: number; y: number; width: number; height: number } | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', index: number): void
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const mainImage = ref<HTMLImageElement | null>(null)
const photo = computed(() => props.photos[props.currentIndex])
const isOpen = computed(() => props.show && !!photo.value)
const titleId = useId()
const helpId = useId()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const sourceIndex = ref(0)
const imageKey = ref(0)

function imageSources(item?: PhotoItem): string[] {
  return [...new Set([item?.textureUrl, item?.mediumUrl, item?.thumbnailUrl]
    .filter((url): url is string => typeof url === 'string' && url.trim().length > 0))]
}

const sources = computed(() => imageSources(photo.value))
const imageUrl = computed(() => sources.value[sourceIndex.value])
const thumbnails = computed(() => {
  const start = Math.max(0, Math.min(props.currentIndex - 2, props.photos.length - 5))
  return props.photos.slice(start, start + 5).map((item, offset) => ({ item, index: start + offset }))
})

// Retain only the two current neighbours, and avoid speculative transfers on constrained connections.
const preloads = new Map<string, HTMLImageElement>()
function clearPreloads() {
  for (const image of preloads.values()) image.removeAttribute('src')
  preloads.clear()
}
function preloadNeighbours() {
  if (!isOpen.value) return
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) {
    clearPreloads()
    return
  }
  const urls = new Set([props.currentIndex - 1, props.currentIndex + 1]
    .map(index => imageSources(props.photos[index])[0])
    .filter((url): url is string => !!url && url !== imageUrl.value))
  for (const [url, image] of preloads) {
    if (!urls.has(url)) {
      image.removeAttribute('src')
      preloads.delete(url)
    }
  }
  for (const url of urls) {
    if (preloads.has(url)) continue
    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = 'low'
    image.src = url
    preloads.set(url, image)
  }
}

function resetImage() {
  sourceIndex.value = 0
  imageKey.value++
  status.value = sources.value.length ? 'loading' : 'error'
}
// 手势状态需先于下方 immediate watch 声明，否则 setup 阶段触发 TDZ 错误
let gesture: { id: number; x: number; y: number; axis: 'x' | 'y' | null } | null = null
watch(() => [isOpen.value, props.currentIndex, ...sources.value], () => {
  clearPreloads()
  resetImage()
  gesture = null
}, { immediate: true })

function onImageLoad(event: Event) {
  if (!isOpen.value || event.currentTarget !== mainImage.value) return
  status.value = 'ready'
  preloadNeighbours()
}
function onImageError(event: Event) {
  // Ignore events from an image replaced by rapid navigation or retry.
  if (!isOpen.value || event.currentTarget !== mainImage.value) return
  if (sourceIndex.value + 1 < sources.value.length) {
    sourceIndex.value++
    imageKey.value++
  } else {
    status.value = 'error'
  }
}
function retry() {
  closeButton.value?.focus({ preventScroll: true })
  resetImage()
}
function select(index: number) {
  if (index >= 0 && index < props.photos.length && index !== props.currentIndex) emit('select', index)
}

function focusableElements() {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
  ) || []).filter(element => element.getClientRects().length > 0)
}
function handleKeyDown(event: KeyboardEvent) {
  if (!isOpen.value || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.key === 'Tab') {
    const elements = focusableElements()
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (!first) {
      event.preventDefault()
      dialog.value?.focus()
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
      event.preventDefault()
      first.focus()
    }
    return
  }
  const actions: Record<string, () => void> = {
    Escape: () => emit('close'),
    ArrowLeft: () => select(props.currentIndex - 1),
    ArrowRight: () => select(props.currentIndex + 1),
    Home: () => select(0),
    End: () => select(props.photos.length - 1),
  }
  if (actions[event.key]) {
    event.preventDefault()
    event.stopPropagation()
    actions[event.key]()
  }
}

let previousFocus: HTMLElement | null = null
let restoreBody: (() => void) | null = null
let disposed = false
function lockBody() {
  if (restoreBody) return
  const body = document.body
  const properties = ['overflow', 'position', 'top', 'left', 'width', 'padding-right']
  const saved = properties.map(name => ({
    name, value: body.style.getPropertyValue(name), priority: body.style.getPropertyPriority(name),
  }))
  const x = window.scrollX
  const y = window.scrollY
  const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
  const padding = parseFloat(getComputedStyle(body).paddingRight) || 0
  body.style.setProperty('overflow', 'hidden')
  body.style.setProperty('position', 'fixed')
  body.style.setProperty('top', `${-y}px`)
  body.style.setProperty('left', `${-x}px`)
  body.style.setProperty('width', '100%')
  if (scrollbar) body.style.setProperty('padding-right', `${padding + scrollbar}px`)
  restoreBody = () => {
    for (const { name, value, priority } of saved) {
      if (value) body.style.setProperty(name, value, priority)
      else body.style.removeProperty(name)
    }
    window.scrollTo({ left: x, top: y, behavior: 'instant' })
  }
}
function releaseModal() {
  dialog.value?.close()
  restoreBody?.()
  restoreBody = null
  clearPreloads()
  gesture = null
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  previousFocus = null
}
watch(isOpen, async open => {
  if (!open) {
    releaseModal()
    return
  }
  await nextTick()
  if (disposed || !isOpen.value || !dialog.value || dialog.value.open) return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  lockBody()
  dialog.value.showModal()
  closeButton.value?.focus({ preventScroll: true })
}, { immediate: true, flush: 'post' })

// A moving thumbnail window or disabled boundary arrow may remove the focused control.
watch(() => props.currentIndex, async () => {
  await nextTick()
  if (isOpen.value && (!dialog.value?.contains(document.activeElement) ||
    document.activeElement?.matches(':disabled'))) closeButton.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  disposed = true
  releaseModal()
})

function startGesture(event: PointerEvent) {
  if (!event.isPrimary) {
    gesture = null
    return
  }
  if (event.pointerType !== 'touch' || (event.target as Element).closest('button, a')) return
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null }
}
function moveGesture(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return
  const x = Math.abs(event.clientX - gesture.x)
  const y = Math.abs(event.clientY - gesture.y)
  if (!gesture.axis && Math.max(x, y) > 12) gesture.axis = x > y * 1.3 ? 'x' : 'y'
}
function endGesture(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return
  moveGesture(event)
  const { x, y, axis } = gesture
  gesture = null
  const dx = event.clientX - x
  const dy = event.clientY - y
  if (axis === 'x' && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    select(props.currentIndex + (dx < 0 ? 1 : -1))
  }
}
function hideBrokenThumbnail(event: Event) {
  (event.currentTarget as HTMLImageElement).hidden = true
}
</script>

<template>
  <Teleport to="body">
    <dialog
      v-if="isOpen && photo"
      ref="dialog"
      class="lightbox-overlay"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="helpId"
      tabindex="-1"
      @keydown="handleKeyDown"
      @cancel.prevent="emit('close')"
      @click.self="emit('close')"
    >
      <header class="lightbox-topbar">
        <div class="photo-indicator" aria-live="polite" aria-atomic="true">
          <span class="sr-only">第 </span><span class="index-current">{{ currentIndex + 1 }}</span>
          <span class="index-divider"> / </span>{{ photos.length }}<span class="sr-only"> 张</span>
        </div>
        <div class="topbar-actions">
          <a
            v-if="allowDownload && photo.mediumUrl"
            :href="photo.mediumUrl"
            :download="photo.title || 'photo'"
            target="_blank"
            rel="noopener noreferrer"
            class="download-action-btn"
            aria-label="下载照片"
          >
            <Icon name="download" :size="16" /><span>下载</span>
          </a>
          <button ref="closeButton" type="button" class="close-btn" aria-label="关闭大图 (Esc)" @click="emit('close')">
            <Icon name="x" :size="20" />
          </button>
        </div>
      </header>

      <div
        class="lightbox-stage"
        @pointerdown="startGesture"
        @pointermove="moveGesture"
        @pointerup="endGesture"
        @pointercancel="gesture = null"
      >
        <button type="button" class="nav-btn prev-btn" :disabled="currentIndex === 0" aria-label="上一张" @click="select(currentIndex - 1)">
          <Icon name="arrow-left" :size="24" />
        </button>
        <div class="image-wrapper" :aria-busy="status === 'loading'">
          <img
            v-if="imageUrl && status !== 'error'"
            :key="imageKey"
            ref="mainImage"
            :src="imageUrl"
            :alt="photo.title || `照片 ${currentIndex + 1}`"
            class="main-image"
            :class="{ 'is-ready': status === 'ready' }"
            decoding="async"
            fetchpriority="high"
            draggable="false"
            @load="onImageLoad"
            @error="onImageError"
          />
          <div v-if="status === 'error'" class="image-message">
            <p role="alert">照片加载失败</p>
            <p class="message-detail">请检查网络后重试，或浏览其他照片。</p>
            <button type="button" class="retry-btn" @click="retry">重新加载</button>
          </div>
        </div>
        <div class="loading-status" role="status" aria-live="polite">
          <span v-if="status === 'loading'" class="loading-label">正在加载照片…</span>
          <span v-else-if="status === 'ready'" class="sr-only">照片已加载</span>
        </div>
        <button type="button" class="nav-btn next-btn" :disabled="currentIndex === photos.length - 1" aria-label="下一张" @click="select(currentIndex + 1)">
          <Icon name="arrow-right" :size="24" />
        </button>
      </div>

      <footer class="lightbox-bottombar">
        <h2 :id="titleId" class="photo-title">{{ photo.title || 'Moment in Light' }}</h2>
        <div v-if="photo.width && photo.height" class="photo-meta">{{ photo.width }} × {{ photo.height }} px</div>
        <nav v-if="photos.length > 1" class="thumbnail-nav" aria-label="照片缩略图导航">
          <button
            v-for="entry in thumbnails"
            :key="entry.index"
            type="button"
            class="thumbnail-btn"
            :aria-label="`查看第 ${entry.index + 1} 张：${entry.item.title || '照片'}`"
            :aria-current="entry.index === currentIndex ? 'true' : undefined"
            @click="select(entry.index)"
          >
            <span aria-hidden="true">{{ entry.index + 1 }}</span>
            <img v-if="entry.item.thumbnailUrl" :src="entry.item.thumbnailUrl" alt="" loading="lazy" decoding="async" draggable="false" @error="hideBrokenThumbnail" />
          </button>
        </nav>
        <p :id="helpId" class="sr-only">左右方向键切换照片，Home 跳到首张，End 跳到末张，Esc 关闭。触屏可左右滑动切换。</p>
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  height: 100%;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgba(5, 8, 12, 0.97);
  color: #fff;
  overflow: auto;
  overscroll-behavior: contain;
  user-select: none;
}
.lightbox-overlay[open] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.lightbox-overlay::backdrop { background: rgba(5, 8, 12, 0.85); }
.lightbox-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
}
.photo-indicator { font: 14px 'Inter', monospace, sans-serif; color: #94a3b8; }
.index-current { color: #fff; font-weight: 600; }
.index-divider { margin: 0 4px; }
.topbar-actions { display: flex; align-items: center; gap: 12px; }
.close-btn, .nav-btn, .retry-btn, .download-action-btn {
  box-sizing: border-box;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  cursor: pointer;
  transition: background 0.15s ease;
}
.download-action-btn, .retry-btn { gap: 8px; padding: 8px 16px; font-size: 13px; text-decoration: none; }
.close-btn:hover, .nav-btn:hover:not(:disabled), .retry-btn:hover, .download-action-btn:hover { background: rgba(255, 255, 255, 0.22); }
button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.lightbox-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
  padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
  touch-action: pan-y pinch-zoom;
}
.image-wrapper { position: relative; width: 100%; height: 100%; min-height: 0; display: grid; place-items: center; }
.main-image { width: 100%; height: 100%; min-height: 0; object-fit: contain; opacity: 0; transition: opacity 0.18s ease; }
.main-image.is-ready { opacity: 1; }
.nav-btn { width: 44px; height: 44px; }
.nav-btn:disabled { opacity: 0.25; cursor: default; }
.loading-status { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.loading-label { padding: 12px 16px; border-radius: 8px; background: #0f172a; color: #cbd5e1; font-size: 14px; }
.image-message { max-width: 100%; padding: 12px; text-align: center; overflow-wrap: anywhere; }
.image-message p { margin: 0 0 12px; }
.message-detail { color: #94a3b8; font-size: 13px; }
.lightbox-bottombar { min-width: 0; padding: 12px 16px max(16px, env(safe-area-inset-bottom)); text-align: center; }
.photo-title { margin: 0 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 18px 'Playfair Display', Georgia, serif; color: #f8fafc; }
.photo-meta { font-size: 12px; color: #94a3b8; }
.thumbnail-nav { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 12px; }
.thumbnail-btn { flex: 0 0 44px; position: relative; display: grid; place-items: center; width: 44px; height: 44px; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 6px; background: #1e293b; color: #cbd5e1; cursor: pointer; }
.thumbnail-btn[aria-current='true'] { border-color: #fff; }
.thumbnail-btn img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.thumbnail-btn img[hidden] { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (max-width: 480px) {
  .lightbox-stage { grid-template-columns: 1fr 1fr; grid-template-rows: minmax(0, 1fr) 44px; gap: 8px; }
  .image-wrapper { grid-column: 1 / -1; grid-row: 1; }
  .prev-btn { grid-column: 1; grid-row: 2; justify-self: end; }
  .next-btn { grid-column: 2; grid-row: 2; justify-self: start; }
  .loading-status { bottom: 60px; }
  .photo-title { font-size: 16px; }
}
@media (max-height: 440px) {
  .lightbox-topbar { padding-top: 4px; padding-bottom: 4px; }
  .lightbox-bottombar { padding-top: 4px; padding-bottom: 4px; }
  .thumbnail-nav, .photo-meta { display: none; }
  .lightbox-stage { grid-template-columns: 44px minmax(0, 1fr) 44px; grid-template-rows: minmax(0, 1fr); }
  .image-wrapper { grid-column: 2; grid-row: 1; }
  .prev-btn { grid-column: 1; grid-row: 1; }
  .next-btn { grid-column: 3; grid-row: 1; }
  .loading-status { bottom: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .main-image, .close-btn, .nav-btn, .retry-btn, .download-action-btn { transition: none; }
}
</style>
