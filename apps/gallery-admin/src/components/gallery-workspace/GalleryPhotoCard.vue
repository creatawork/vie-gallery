<script setup lang="ts">
import { ref } from 'vue'
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import Icon from '../Icon.vue'

const props = defineProps<{
  photo: WorkspacePhoto
  canWrite?: boolean
  selected?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
}>()

const emit = defineEmits<{
  (event: 'open'): void
  (event: 'set-cover'): void
  (event: 'delete'): void
  (event: 'toggle-select'): void
  (event: 'move-up'): void
  (event: 'move-down'): void
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

function handleSelectClick(event: Event) {
  event.stopPropagation()
  emit('toggle-select')
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

      <!-- Multi-select checkbox button -->
      <button
        v-if="canWrite"
        type="button"
        class="select-btn"
        :class="{ 'is-checked': selected }"
        :aria-label="selected ? '取消选中' : '选中照片'"
        @click="handleSelectClick"
      >
        <Icon v-if="selected" name="check" :size="12" stroke-width="3" />
      </button>

      <!-- Status badges (All Chinese) -->
      <div class="badges-row">
        <span v-if="photo.cover" class="badge-cover" title="相册封面">封面</span>
        <span v-if="photo.status === 'READY'" class="badge-status is-ready" title="已就绪">
          <Icon name="check" :size="10" stroke-width="3" />
          <span>就绪</span>
        </span>
        <span v-else-if="photo.status === 'PROCESSING'" class="badge-status is-processing" title="处理中">
          <span class="dot-pulse"></span>
          <span>处理中</span>
        </span>
        <span v-else-if="photo.status === 'FAILED'" class="badge-status is-failed" title="失败">
          <span>失败</span>
        </span>
      </div>
    </div>
    <div class="photo-info">
      <h3 :title="photo.title || '未命名照片'">{{ photo.title || '未命名照片' }}</h3>
      <div class="photo-meta">
        <span v-if="formatBytes(photo.byteSize)">{{ formatBytes(photo.byteSize) }}</span>
        <span v-else-if="photo.width && photo.height">{{ photo.width }}×{{ photo.height }}</span>
        <span v-else>—</span>
        <div class="meta-actions" @click.stop>
          <button class="ghost-btn" type="button" aria-label="更多操作" @click="toggleMenu">
            <Icon name="more" :size="16" />
          </button>
          <div v-if="menuOpen" class="card-menu">
            <button type="button" @click="$emit('open'); menuOpen = false">查看大图</button>
            <button v-if="canWrite && !photo.cover" type="button" @click="$emit('set-cover'); menuOpen = false">设为封面</button>
            <button v-if="canWrite && canMoveUp" type="button" @click="$emit('move-up'); menuOpen = false">前移</button>
            <button v-if="canWrite && canMoveDown" type="button" @click="$emit('move-down'); menuOpen = false">后移</button>
            <button v-if="canWrite" type="button" class="danger" @click="$emit('delete'); menuOpen = false">删除</button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.photo-card {
  position: relative;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 40, 28, 0.05);
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 40, 28, 0.09);
}

.photo-card.is-selected {
  border-color: var(--brand-accent, #10b981);
  box-shadow: 0 0 0 1px var(--brand-accent, #10b981), 0 8px 20px rgba(16, 185, 129, 0.18);
}

.photo-img-box {
  position: relative;
  aspect-ratio: 4 / 3;
  background: #f1f5f9;
  overflow: hidden;
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.empty-thumb {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: #94a3b8;
}

.select-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.45);
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  z-index: 2;
}

.select-btn:hover {
  background: rgba(15, 23, 42, 0.7);
}

.select-btn.is-checked {
  background: var(--brand-accent, #10b981);
  border-color: var(--brand-accent, #10b981);
}

.badges-row {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 2;
}

.badge-cover {
  padding: 2px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  background: #f59e0b;
  color: #fff;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.35);
}

.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 700;
  color: #fff;
}

.badge-status.is-ready {
  background: rgba(16, 185, 129, 0.9);
}

.badge-status.is-processing {
  background: rgba(245, 158, 11, 0.9);
}

.badge-status.is-failed {
  background: rgba(239, 68, 68, 0.9);
}

.dot-pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.photo-info {
  padding: 10px 12px 12px;
}

.photo-info h3 {
  font-size: 13.5px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.photo-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
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
  background: transparent;
}

.ghost-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.card-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  min-width: 110px;
  padding: 6px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
  z-index: 10;
}

.card-menu button {
  width: 100%;
  text-align: left;
  padding: 7px 8px;
  border-radius: 7px;
  font-size: 12px;
  color: #374151;
  background: transparent;
}

.card-menu button:hover {
  background: #ecfdf5;
}

.card-menu .danger {
  color: #dc2626;
}

.card-menu .danger:hover {
  background: #fef2f2;
}
</style>
