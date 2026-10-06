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
}
</script>

<template>
  <section class="photo-wall" aria-label="照片墙" :class="{ 'is-fit': fit === 'contain' }">
    <button
      v-for="(photo, index) in photos"
      :key="`${photo.sortOrder}-${photo.thumbnailUrl}-${index}`"
      type="button"
      class="photo-card"
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
          @load="reportFirstPhoto(index)"
          @error="markFailed(photo.thumbnailUrl)"
        />
        <span v-else class="photo-placeholder">预览暂不可用 · 点击查看</span>
      </span>
      <span class="photo-caption"><span>{{ photo.title || `照片 ${index + 1}` }}</span><small>{{ String(index + 1).padStart(2, '0') }}</small></span>
    </button>
  </section>
</template>

<style scoped>
.photo-wall { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px 20px; }
.photo-card { min-width: 0; padding: 0; text-align: left; color: var(--text-main); cursor: pointer; background: transparent; border: 0; border-radius: 8px; }
.photo-frame { display: flex; width: 100%; aspect-ratio: 4 / 3; align-items: center; justify-content: center; overflow: hidden; background: var(--bg-panel, #101a15); border-radius: 8px; }
.photo-frame img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform 180ms ease; }
.is-fit .photo-frame img { object-fit: contain; }
.photo-card:hover .photo-frame img { transform: scale(1.025); }
.is-fit .photo-card:hover .photo-frame img { transform: none; }
.photo-card:focus-visible { outline: 2px solid var(--accent, #10b981); outline-offset: 5px; }
.photo-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 0 0; font-size: 13px; }
.photo-caption > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.photo-caption small { flex-shrink: 0; color: var(--text-muted, #94a3b8); font-variant-numeric: tabular-nums; }
.photo-placeholder { padding: 16px; color: var(--text-muted, #94a3b8); font-size: 12px; text-align: center; }
@media (max-width: 1023px) { .photo-wall { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 767px) { .photo-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 12px; } }
@media (max-width: 380px) { .photo-wall { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .photo-frame img { transition: none; } .photo-card:hover .photo-frame img { transform: none; } }
</style>
