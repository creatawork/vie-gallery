<script setup lang="ts">
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import GalleryPhotoCard from './GalleryPhotoCard.vue'
import Icon from '../Icon.vue'

defineProps<{
  photos: WorkspacePhoto[]
}>()

defineEmits<{
  (event: 'open', index: number): void
  (event: 'set-cover', photo: WorkspacePhoto): void
  (event: 'delete', photo: WorkspacePhoto): void
}>()
</script>

<template>
  <div v-if="photos.length" class="photo-grid" aria-live="polite">
    <GalleryPhotoCard
      v-for="(photo, index) in photos"
      :key="photo.id"
      :photo="photo"
      @open="$emit('open', index)"
      @set-cover="$emit('set-cover', photo)"
      @delete="$emit('delete', photo)"
    />
  </div>
  <div v-else class="empty-photos-panel">
    <div class="empty-photo-icon"><Icon name="photo" :size="32" /></div>
    <h2>相册内暂无照片</h2>
    <p>上传第一组照片，开始搭建你的 3D 沉浸式空间。</p>
  </div>
</template>

<style scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 18px;
  margin-top: 24px;
}

.empty-photos-panel {
  display: flex;
  min-height: 250px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  padding: 42px 24px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  color: var(--text-tertiary);
  text-align: center;
  background: linear-gradient(145deg, rgba(250, 252, 251, 0.75), rgba(248, 250, 252, 0.5));
}

.empty-photo-icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 14px;
  place-items: center;
  border-radius: 17px;
  color: rgba(5, 150, 105, 0.55);
  background: var(--brand-accent-subtle);
}

.empty-photos-panel h2 {
  color: var(--text-secondary);
  font-size: 16px;
  font-weight: 700;
}

.empty-photos-panel p {
  margin-top: 6px;
  font-size: 13px;
}

@media (max-width: 767px) {
  .photo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
