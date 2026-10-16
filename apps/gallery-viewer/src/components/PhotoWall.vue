<script setup lang="ts">
import { ref } from 'vue'
import type { PublicPhoto } from '../types/api'

const props = withDefaults(defineProps<{ photos: PublicPhoto[]; fit: 'contain' | 'cover'; prioritizeFirstPhotos?: boolean }>(), {
  prioritizeFirstPhotos: false
})
const emit = defineEmits<{ select: [index: number]; firstPhotoRendered: [] }>()
const failedImages = ref(new Set<string>())
const loadedImages = ref(new Set<string>())
let firstPhotoReported = false

function reportFirstPhoto() {
  if (firstPhotoReported) return
  firstPhotoReported = true
  requestAnimationFrame(() => emit('firstPhotoRendered'))
}

function markFailed(url: string) {
  failedImages.value = new Set([...failedImages.value, url])
  reportFirstPhoto()
}
function markLoaded(url: string) {
  loadedImages.value = new Set([...loadedImages.value, url])
  reportFirstPhoto()
}
</script>

<template>
  <section class="photo-wall" aria-label="照片墙" :class="{ 'is-fit': fit === 'contain' }">
    <button
      v-for="(photo, index) in photos"
      :key="`${photo.sortOrder}-${photo.thumbnailUrl}-${index}`"
      type="button"
      class="photo-card"
      :class="{ 'is-lead': index === 0 && (!photo.width || !photo.height || photo.width >= photo.height), 'is-loaded': loadedImages.has(photo.thumbnailUrl || '') }"
      :aria-label="`查看照片 ${index + 1}：${photo.title || '未命名照片'}`"
      @click="emit('select', index)"
    >
      <span class="photo-frame" :style="photo.width && photo.height ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined">
        <img
          v-if="photo.thumbnailUrl && !failedImages.has(photo.thumbnailUrl)"
          :src="photo.thumbnailUrl"
          :alt="photo.title || `照片 ${index + 1}`"
          :width="photo.width || undefined"
          :height="photo.height || undefined"
          :loading="props.prioritizeFirstPhotos && index < 2 ? 'eager' : 'lazy'"
          :fetchpriority="props.prioritizeFirstPhotos && index === 0 ? 'high' : 'auto'"
          decoding="async"
          @load="markLoaded(photo.thumbnailUrl)"
          @error="markFailed(photo.thumbnailUrl)"
        />
        <span v-else class="photo-placeholder"><span>{{ photo.title || `作品 ${index + 1}` }}</span><span>预览暂不可用，点击查看大图</span></span>
        <span class="photo-open" aria-hidden="true"><span>查看作品</span><svg viewBox="0 0 24 24"><path d="M5 19 19 5M5 5h14v14"/></svg></span>
      </span>
      <span class="photo-caption"><small>{{ String(index + 1).padStart(2, '0') }}</small><span>{{ photo.title || `作品 ${index + 1}` }}</span></span>
    </button>
  </section>
</template>

<style scoped>
.photo-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(38px, 5vw, 76px) clamp(20px, 3vw, 44px); align-items: start; }
.photo-card.is-lead { grid-column: span 2; }
.photo-card.is-lead + .photo-card { align-self: end; }
.photo-card { min-width: 0; padding: 0; text-align: left; color: var(--text-main); cursor: pointer; background: transparent; border: 0; }
.photo-frame { position: relative; display: flex; width: 100%; min-height: 150px; align-items: center; justify-content: center; overflow: hidden; background: #e8e7df; box-shadow: 0 8px 28px #20282408; }
.photo-frame::after { content: ''; position: absolute; inset: 0; border: 1px solid #2028240a; pointer-events: none; }
.photo-frame img { display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0; transform: scale(1.015); transition: opacity .6s ease, transform 1s cubic-bezier(.2,.75,.2,1); }
.is-loaded .photo-frame img { opacity: 1; transform: scale(1); }
.photo-card:hover .photo-frame img { transform: scale(1.018); }
.is-fit .photo-card:hover .photo-frame img { transform: none; }
.photo-card:focus-visible { outline: 2px solid var(--accent, #26735d); outline-offset: 5px; }
.photo-caption { display: flex; align-items: baseline; gap: 14px; padding: 17px 0 0; font-size: 13px; line-height: 1.6; }
.photo-caption > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.photo-caption small { flex-shrink: 0; color: #7a8178; font: 10px/1.6 var(--font-mono); font-variant-numeric: tabular-nums; }
.photo-open { position: absolute; display: flex; align-items: center; gap: 18px; right: 16px; bottom: 16px; padding: 11px 14px; color: #fffefa; background: #171d1ac9; backdrop-filter: blur(12px); font-size: 11px; opacity: 0; transform: translateY(5px); transition: opacity .25s, transform .25s; }
.photo-open svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.photo-card:hover .photo-open, .photo-card:focus-visible .photo-open { opacity: 1; transform: translateY(0); }
.photo-placeholder { display: grid; gap: 12px; padding: 28px 16px; color: #626c65; font-size: 12px; text-align: center; }
.photo-placeholder span:first-child { color: #202824; font: 20px/1.4 var(--font-serif); }
@media (max-width: 767px) { .photo-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 34px 18px; }.photo-frame { min-height: 100px; }.photo-caption { padding-top: 12px; font-size: 12px; gap: 9px; }.photo-open { display: none; } }
@media (max-width: 380px) { .photo-wall { grid-template-columns: minmax(0, 1fr); gap: 36px; }.photo-card.is-lead { grid-column: auto; } }
@media (prefers-reduced-motion: reduce) { .photo-frame img, .photo-open { transition: none; }.photo-frame img, .photo-card:hover .photo-frame img { transform: none; } }
</style>
