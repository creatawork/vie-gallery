<script setup lang="ts">
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import Icon from '../Icon.vue'

defineProps<{
  photo: WorkspacePhoto
  canWrite?: boolean
  selected?: boolean
}>()

defineEmits<{
  (event: 'open'): void
  (event: 'set-cover'): void
  (event: 'delete'): void
  (event: 'toggle-select'): void
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
  if (!bytes) return '未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
</script>

<template>
  <article
    class="photo-card"
    :class="{ 'is-selected': selected, 'is-cover': photo.cover }"
    tabindex="0"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
  >
    <!-- Visual Image Box -->
    <div class="photo-img-box">
      <img
        v-if="photo.thumbnailUrl"
        :src="photo.thumbnailUrl"
        :alt="photo.title || '照片'"
        loading="lazy"
        class="photo-image"
      />
      <div v-else class="empty-thumb-pattern">
        <Icon name="photo" :size="28" />
      </div>

      <!-- Cover Tag Pill -->
      <div v-if="photo.cover" class="photo-cover-tag">
        <Icon name="star" :size="12" />
        <span>封面</span>
      </div>

      <!-- Selection Checkbox (Top Left) -->
      <button
        v-if="canWrite"
        class="select-checkbox-btn"
        :class="{ checked: selected }"
        type="button"
        title="勾选照片"
        @click.stop="$emit('toggle-select')"
      >
        <Icon v-if="selected" name="check" :size="12" stroke-width="3" />
      </button>

      <!-- Glassmorphic Hover Overlay -->
      <div class="photo-hover-overlay" @click.stop>
        <div class="overlay-top-tools">
          <button
            v-if="canWrite"
            class="photo-action-btn"
            :class="{ 'is-active-cover': photo.cover }"
            :title="photo.cover ? '当前相册封面' : '设为相册封面'"
            type="button"
            @click="$emit('set-cover')"
          >
            <Icon name="star" :size="14" />
          </button>
          <button
            class="photo-action-btn"
            title="查看大图"
            type="button"
            @click="$emit('open')"
          >
            <Icon name="eye" :size="14" />
          </button>
          <button
            v-if="canWrite"
            class="photo-action-btn btn-danger-action"
            title="删除照片"
            type="button"
            @click="$emit('delete')"
          >
            <Icon name="trash" :size="14" />
          </button>
        </div>

        <div class="overlay-bottom-info">
          <span class="file-size-tag">{{ formatBytes(photo.byteSize) }}</span>
        </div>
      </div>
    </div>

    <!-- Info Bar -->
    <div class="photo-info-bar">
      <span class="photo-name" :title="photo.title || '未命名素材'">
        {{ photo.title || '未命名素材' }}
      </span>
      <span class="photo-status" :class="`status-${photo.status.toLowerCase()}`">
        <span class="status-dot" aria-hidden="true"></span>
        <span>{{ statusLabel(photo.status) }}</span>
      </span>
    </div>
  </article>
</template>

<style scoped>
.photo-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.photo-card:hover {
  transform: translateY(-3px);
  border-color: rgba(16, 185, 129, 0.35);
  box-shadow: 0 10px 24px rgba(16, 185, 129, 0.1);
}

.photo-card.is-selected {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25), 0 8px 20px rgba(16, 185, 129, 0.12);
}

.photo-card.is-cover {
  border-color: rgba(245, 158, 11, 0.4);
}

.photo-img-box {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}

.photo-card:hover .photo-image {
  transform: scale(1.05);
}

.empty-thumb-pattern {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(5, 150, 105, 0.3);
}

.photo-cover-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #b45309;
  background: rgba(254, 243, 199, 0.95);
  border: 1px solid rgba(245, 158, 11, 0.3);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.select-checkbox-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 4;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  border: 1.5px solid rgba(148, 163, 184, 0.6);
  display: grid;
  place-items: center;
  color: #ffffff;
  transition: all 0.2s ease;
  backdrop-filter: blur(4px);
}

.select-checkbox-btn:hover {
  border-color: #10b981;
  background: #ffffff;
}

.select-checkbox-btn.checked {
  background: #10b981;
  border-color: #10b981;
}

/* Glassmorphic Hover Overlay */
.photo-hover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.3) 0%, rgba(15, 23, 42, 0.65) 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 3;
}

.photo-card:hover .photo-hover-overlay {
  opacity: 1;
}

.overlay-top-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.photo-action-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.15s ease;
}

.photo-action-btn:hover {
  background: #ffffff;
  color: #059669;
  transform: scale(1.06);
}

.photo-action-btn.is-active-cover {
  background: #fef3c7;
  color: #d97706;
  border-color: #fde68a;
}

.photo-action-btn.btn-danger-action:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
}

.overlay-bottom-info {
  display: flex;
  justify-content: flex-end;
}

.file-size-tag {
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Info Bar */
.photo-info-bar {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #ffffff;
}

.photo-name {
  font-size: 12.5px;
  font-weight: 650;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-ready { color: #059669; }
.status-ready .status-dot { background: #10b981; }

.status-processing { color: #d97706; }
.status-processing .status-dot { background: #f59e0b; }

.status-failed { color: #dc2626; }
.status-failed .status-dot { background: #ef4444; }
</style>
