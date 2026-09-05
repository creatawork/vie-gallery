<script setup lang="ts">
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import Icon from '../Icon.vue'

defineProps<{
  photo: WorkspacePhoto
}>()

defineEmits<{
  (event: 'open'): void
  (event: 'set-cover'): void
  (event: 'delete'): void
}>()

const statusLabels: Record<string, string> = {
  READY: '已就绪',
  PROCESSING: '处理中',
  FAILED: '处理失败',
  DELETED: '已删除'
}

function statusLabel(status: string) {
  return statusLabels[status] || status
}

function formatBytes(bytes?: number) {
  if (!bytes) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
</script>

<template>
  <article class="photo-card" tabindex="0" @click="$emit('open')" @keydown.enter="$emit('open')">
    <div class="photo-img-box">
      <img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" :alt="photo.title || '照片'" loading="lazy" />
      <div v-else class="empty-thumb-pattern"><Icon name="photo" :size="24" /></div>

      <div v-if="photo.cover" class="photo-cover-tag">
        <Icon name="star" :size="12" />
        <span>封面</span>
      </div>

      <div class="photo-hover-overlay" @click.stop>
        <div class="overlay-top">
          <button
            class="photo-action-btn"
            :class="{ active: photo.cover }"
            :aria-label="photo.cover ? '当前相册封面' : '设为相册封面'"
            :title="photo.cover ? '当前相册封面' : '设为相册封面'"
            type="button"
            @click="$emit('set-cover')"
          >
            <Icon name="star" :size="15" />
          </button>
          <button class="photo-action-btn btn-danger" aria-label="删除照片" title="删除照片" type="button" @click="$emit('delete')">
            <Icon name="trash" :size="15" />
          </button>
        </div>
        <div class="overlay-bottom"><span>{{ formatBytes(photo.byteSize) }}</span></div>
      </div>
    </div>

    <div class="photo-info-bar">
      <span class="photo-name">{{ photo.title || '未命名照片' }}</span>
      <span class="photo-status" :class="`status-${photo.status.toLowerCase()}`">
        <span class="status-dot" aria-hidden="true"></span>
        {{ statusLabel(photo.status) }}
      </span>
    </div>
  </article>
</template>

<style scoped>
.photo-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.75);
  border-radius: var(--radius-lg);
  background: #ffffff;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.25s var(--ease-spring), box-shadow 0.25s ease, border-color 0.25s ease;
}

.photo-card:hover,
.photo-card:focus-visible {
  border-color: rgba(16, 185, 129, 0.35);
  box-shadow: var(--shadow-lg);
  outline: none;
  transform: translateY(-3px);
}

.photo-img-box {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
}

.photo-img-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s var(--ease-spring);
}

.photo-card:hover .photo-img-box img {
  transform: scale(1.05);
}

.empty-thumb-pattern {
  display: grid;
  height: 100%;
  place-items: center;
  color: rgba(5, 150, 105, 0.34);
}

.photo-cover-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  color: #ffffff;
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  font-size: 11px;
  font-weight: 700;
  z-index: 2;
}

.photo-hover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.68), rgba(15, 23, 42, 0.85));
  opacity: 0;
  transition: opacity 0.25s ease;
  z-index: 3;
}

.photo-card:hover .photo-hover-overlay,
.photo-card:focus-visible .photo-hover-overlay {
  opacity: 1;
}

.overlay-top {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.photo-action-btn {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(226, 232, 240, 0.5);
  border-radius: 10px;
  color: #475569;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.photo-action-btn:hover,
.photo-action-btn:focus-visible {
  outline: none;
  transform: scale(1.06);
}

.photo-action-btn.active {
  color: #ffffff;
  background: linear-gradient(135deg, #10b981, #059669);
}

.photo-action-btn.btn-danger:hover,
.photo-action-btn.btn-danger:focus-visible {
  color: #dc2626;
  background: #fee2e2;
}

.overlay-bottom {
  color: rgba(248, 250, 252, 0.95);
  font-size: 11.5px;
}

.photo-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 13px;
}

.photo-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size: 11px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}

.status-ready { color: #047857; }
.status-ready .status-dot { background: #10b981; }
.status-processing { color: #b45309; }
.status-processing .status-dot { background: #f59e0b; }
.status-failed { color: #b91c1c; }
.status-failed .status-dot { background: #ef4444; }

@media (prefers-reduced-motion: reduce) {
  .photo-card,
  .photo-img-box img,
  .photo-hover-overlay {
    transition: none;
  }
}
</style>
