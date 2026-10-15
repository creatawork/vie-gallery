<script setup lang="ts">
import { ref } from 'vue'
import type { PublicPhoto } from '../types/api'

const props = withDefaults(defineProps<{ photos: PublicPhoto[]; fit: 'contain' | 'cover'; prioritizeFirstPhotos?: boolean }>(), {
  prioritizeFirstPhotos: false
})
const emit = defineEmits<{ select: [index: number]; firstPhotoRendered: [] }>()
const failedImages = ref(new Set<string>())
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
</script>

<template>
  <section class="photo-wall" aria-label="照片墙" :class="{ 'is-fit': fit === 'contain' }">
    <button
      v-for="(photo, index) in photos"
      :key="`${photo.sortOrder}-${photo.thumbnailUrl}-${index}`"
      type="button"
      class="photo-card"
      :class="{ 'is-landscape': !photo.width || !photo.height || photo.width >= photo.height }"
      :aria-label="`查看照片 ${index + 1}：${photo.title || '未命名照片'}`"
      @click="emit('select', index)"
    >
      <span class="photo-frame">
        <img
          v-if="photo.thumbnailUrl && !failedImages.has(photo.thumbnailUrl)"
          :src="photo.thumbnailUrl"
          :alt="photo.title || `照片 ${index + 1}`"
          :width="photo.width || undefined"
          :height="photo.height || undefined"
          :loading="props.prioritizeFirstPhotos && index < 2 ? 'eager' : 'lazy'"
          :fetchpriority="props.prioritizeFirstPhotos && index === 0 ? 'high' : 'auto'"
          decoding="async"
          @load="reportFirstPhoto"
          @error="markFailed(photo.thumbnailUrl)"
        />
        <span v-else class="photo-placeholder"><span>{{ photo.title || `作品 ${index + 1}` }}</span><span>预览暂不可用，点击查看大图</span></span>
      </span>
      <span class="photo-caption"><span>{{ photo.title || `照片 ${index + 1}` }}</span><small>{{ String(index + 1).padStart(2, '0') }}</small></span>
    </button>
  </section>
</template>

<style scoped>
.photo-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 54px 30px; align-items: start; }
.photo-card:nth-child(7n + 1).is-landscape { grid-column: span 2; }
.photo-card:nth-child(7n + 2) { padding-top: 20%; }
.photo-card:nth-child(7n + 5) { padding-top: 12%; }
.photo-card { min-width: 0; padding: 0; text-align: left; color: var(--text-main); cursor: pointer; background: transparent; border: 0; border-radius: 2px; }
.photo-frame { display: flex; width: 100%; min-height:180px; align-items: center; justify-content: center; overflow: hidden; background: #e8e9e1; border-radius: 2px; }
.photo-frame img { display: block; width: 100%; height: auto; max-height:680px; object-fit: contain; transition: transform 600ms ease; }
.is-fit .photo-frame img { object-fit: contain; }
.photo-card:hover .photo-frame img { transform: scale(1.025); }
.is-fit .photo-card:hover .photo-frame img { transform: none; }
.photo-card:focus-visible { outline: 2px solid var(--accent, #26735d); outline-offset: 5px; }
.photo-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 0 0; font-size: 13px; }
.photo-caption > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.photo-caption small { flex-shrink: 0; color: var(--text-muted, #626c65); font-variant-numeric: tabular-nums; }
.photo-placeholder { display: grid; gap: 12px; padding: 28px 16px; color: #626c65; font-size: 12px; text-align: center; }
.photo-placeholder span:first-child { color: #202824; font: 20px/1.4 var(--font-serif); }
@media (max-width: 767px) { .photo-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 16px; } .photo-card:nth-child(7n + 2),.photo-card:nth-child(7n + 5) { padding-top:0; }.photo-frame { min-height: 120px; }.photo-caption { font-size: 12px; } }
@media (max-width: 380px) { .photo-wall { grid-template-columns: minmax(0, 1fr); } .photo-card:nth-child(7n + 1).is-landscape { grid-column:auto; } }
@media (prefers-reduced-motion: reduce) { .photo-card { animation:none; } .photo-frame img { transition: none; } .photo-card:hover .photo-frame img { transform: none; } }
</style>
