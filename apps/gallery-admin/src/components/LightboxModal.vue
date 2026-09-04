<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

interface PhotoItem {
  id: string
  title?: string
  thumbnailUrl?: string
  byteSize?: number
  width?: number
  height?: number
  cover?: boolean
  status?: string
  createdAt?: string
}

interface Props {
  show: boolean
  photos: PhotoItem[]
  currentIndex: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', index: number): void
  (e: 'set-cover', photo: PhotoItem): void
  (e: 'delete', photo: PhotoItem): void
}>()

function handleKeyDown(e: KeyboardEvent) {
  if (!props.show) return
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft' && props.currentIndex > 0) {
    emit('select', props.currentIndex - 1)
  }
  if (e.key === 'ArrowRight' && props.currentIndex < props.photos.length - 1) {
    emit('select', props.currentIndex + 1)
  }
}

onMounted(() => window.addEventListener('keydown', handleKeyDown))
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown))

function formatBytes(bytes?: number) {
  if (!bytes) return '未知大小'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show && photos[currentIndex]" class="lightbox-overlay" @click.self="emit('close')">
      <!-- Top Navigation Bar -->
      <div class="lightbox-topbar">
        <div class="photo-indicator">
          <span class="index-current">{{ currentIndex + 1 }}</span>
          <span class="index-divider">/</span>
          <span class="index-total">{{ photos.length }}</span>
        </div>

        <div class="topbar-actions">
          <button
            v-if="!photos[currentIndex].cover"
            class="action-btn"
            title="设为相册封面"
            @click="emit('set-cover', photos[currentIndex])"
          >
            <Icon name="star" :size="16" />
            <span>设为封面</span>
          </button>
          <span v-else class="cover-badge">
            <Icon name="check" :size="14" />
            <span>当前封面</span>
          </span>

          <button
            class="action-btn action-danger"
            title="删除照片"
            @click="emit('delete', photos[currentIndex])"
          >
            <Icon name="trash" :size="16" />
            <span>删除</span>
          </button>

          <button class="action-btn close-btn" title="关闭 (Esc)" @click="emit('close')">
            <Icon name="x" :size="20" />
          </button>
        </div>
      </div>

      <!-- Main Stage -->
      <div class="lightbox-stage">
        <!-- Prev Button -->
        <button
          v-if="currentIndex > 0"
          class="nav-btn prev-btn"
          aria-label="上一张"
          @click="emit('select', currentIndex - 1)"
        >
          <Icon name="arrow-left" :size="24" />
        </button>

        <!-- Current Image Display -->
        <div class="image-wrapper">
          <img
            :src="photos[currentIndex].thumbnailUrl"
            :alt="photos[currentIndex].title || 'Photo'"
            class="main-image"
          />
        </div>

        <!-- Next Button -->
        <button
          v-if="currentIndex < photos.length - 1"
          class="nav-btn next-btn"
          aria-label="下一张"
          @click="emit('select', currentIndex + 1)"
        >
          <Icon name="arrow-right" :size="24" />
        </button>
      </div>

      <!-- Bottom Info Bar -->
      <div class="lightbox-bottombar">
        <div class="photo-info">
          <h3 class="photo-title">{{ photos[currentIndex].title || '未命名照片' }}</h3>
          <div class="photo-meta-tags">
            <span v-if="photos[currentIndex].width && photos[currentIndex].height" class="meta-tag">
              {{ photos[currentIndex].width }} × {{ photos[currentIndex].height }} px
            </span>
            <span class="meta-tag">{{ formatBytes(photos[currentIndex].byteSize) }}</span>
            <span class="meta-tag status-tag" :class="`status-${photos[currentIndex].status?.toLowerCase()}`">
              {{ photos[currentIndex].status || 'READY' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 15, 20, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  color: #ffffff;
  user-select: none;
}

.lightbox-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%);
  z-index: 10;
}

.photo-indicator {
  font-family: 'Inter', monospace, sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #94a3b8;
}

.index-current {
  color: #f8fafc;
  font-weight: 600;
}

.index-divider {
  margin: 0 4px;
  opacity: 0.5;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.action-danger {
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.2);
  border-color: rgba(220, 38, 38, 0.3);
}

.action-danger:hover {
  background: rgba(220, 38, 38, 0.35);
  border-color: rgba(220, 38, 38, 0.5);
}

.cover-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.close-btn {
  padding: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.lightbox-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 20px;
}

.image-wrapper {
  max-width: 90vw;
  max-height: 75vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-image {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes zoomIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: all 0.2s ease;
  z-index: 5;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-50%) scale(1.08);
}

.prev-btn {
  left: 24px;
}

.next-btn {
  right: 24px;
}

.lightbox-bottombar {
  padding: 16px 24px 24px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-info {
  text-align: center;
}

.photo-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 500;
  color: #f8fafc;
}

.photo-meta-tags {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.meta-tag {
  font-size: 12px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 4px;
}

.status-tag {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}

.status-ready {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.15);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
