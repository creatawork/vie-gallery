<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

interface PhotoItem {
  title?: string
  thumbnailUrl?: string
  width?: number
  height?: number
  sortOrder?: number
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

        <button class="close-btn" title="关闭 (Esc)" @click="emit('close')">
          <Icon name="x" :size="20" />
        </button>
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

        <!-- Image Display -->
        <div class="image-wrapper">
          <img
            :src="photos[currentIndex].thumbnailUrl"
            :alt="photos[currentIndex].title || 'Photograph'"
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
          <h3 class="photo-title">{{ photos[currentIndex].title || 'Moment in Light' }}</h3>
          <div v-if="photos[currentIndex].width && photos[currentIndex].height" class="photo-meta">
            {{ photos[currentIndex].width }} × {{ photos[currentIndex].height }} px
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
  background: rgba(5, 8, 12, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 3000;
  display: flex;
  flex-direction: column;
  color: #ffffff;
  user-select: none;
}

.lightbox-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  z-index: 10;
}

.photo-indicator {
  font-family: 'Inter', monospace, sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

.index-current {
  color: #ffffff;
  font-weight: 600;
}

.index-divider {
  margin: 0 4px;
  opacity: 0.4;
}

.close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px;
  border-radius: 50%;
  color: #ffffff;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
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
  max-height: 78vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-image {
  max-width: 100%;
  max-height: 78vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.7);
  animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
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
  width: 54px;
  height: 54px;
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
  left: 32px;
}

.next-btn {
  right: 32px;
}

.lightbox-bottombar {
  padding: 20px 28px 28px;
  text-align: center;
}

.photo-title {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 18px;
  font-weight: 500;
  color: #f8fafc;
  margin-bottom: 4px;
  letter-spacing: 0.02em;
}

.photo-meta {
  font-size: 12px;
  color: #94a3b8;
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
