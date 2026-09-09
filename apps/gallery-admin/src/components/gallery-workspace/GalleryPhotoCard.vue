<script setup lang="ts">
import { ref } from 'vue'
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import Icon from '../Icon.vue'

defineProps<{
  photo: WorkspacePhoto
  canWrite?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  (event: 'open'): void
  (event: 'set-cover'): void
  (event: 'delete'): void
  (event: 'toggle-select'): void
}>()

const menuOpen = ref(false)

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toggleMenu(event: Event) {
  event.stopPropagation()
  menuOpen.value = !menuOpen.value
}
</script>

<template>
  <article
    class="photo-card"
    :class="{ 'is-selected': selected }"
    tabindex="0"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
  >
    <div class="photo-img-box">
      <img
        v-if="photo.thumbnailUrl"
        :src="photo.thumbnailUrl"
        :alt="photo.title || '照片'"
        loading="lazy"
        class="photo-image"
      />
      <div v-else class="empty-thumb">
        <Icon name="photo" :size="28" />
      </div>
      <span v-if="photo.status === 'READY'" class="ready-mark" aria-label="已就绪">
        <Icon name="check" :size="12" stroke-width="3" />
      </span>
    </div>
    <div class="photo-info">
      <h3>{{ photo.title || '未命名照片' }}</h3>
      <div class="photo-meta">
        <span v-if="formatBytes(photo.byteSize)">{{ formatBytes(photo.byteSize) }}</span>
        <div class="meta-actions" @click.stop>
          <button class="ghost-btn" type="button" aria-label="更多操作" @click="toggleMenu">
            <Icon name="more" :size="16" />
          </button>
          <div v-if="menuOpen" class="card-menu">
            <button type="button" @click="$emit('open'); menuOpen = false">查看大图</button>
            <button v-if="canWrite" type="button" @click="$emit('set-cover'); menuOpen = false">设为封面</button>
            <button v-if="canWrite" type="button" class="danger" @click="$emit('delete'); menuOpen = false">删除</button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.photo-card {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(15, 40, 28, 0.06);
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(15, 40, 28, 0.1);
}

.photo-img-box {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #e8f5ef;
  overflow: hidden;
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.empty-thumb {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: #86efac;
}

.ready-mark {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #00b88f;
  color: #fff;
}

.photo-info {
  padding: 10px 12px 12px;
}

.photo-info h3 {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.photo-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}

.meta-actions {
  position: relative;
  display: flex;
  gap: 2px;
}

.ghost-btn {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: #9ca3af;
  border-radius: 6px;
}

.ghost-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.card-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  min-width: 120px;
  padding: 6px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
  z-index: 3;
}

.card-menu button {
  width: 100%;
  text-align: left;
  padding: 7px 8px;
  border-radius: 7px;
  font-size: 12px;
  color: #374151;
}

.card-menu button:hover {
  background: #ecfdf5;
}

.card-menu .danger {
  color: #dc2626;
}
</style>
