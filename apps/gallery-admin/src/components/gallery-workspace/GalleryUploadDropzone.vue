<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../Icon.vue'

defineProps<{
  uploading: boolean
  progress?: number
  statusText?: string
}>()

const emit = defineEmits<{
  (event: 'files', files: FileList | File[]): void
  (event: 'invalid', message: string): void
}>()

const isDragOver = ref(false)
const input = ref<HTMLInputElement | null>(null)
const MAX_FILES = 50
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function chooseFiles() {
  input.value?.click()
}

function validateFiles(files: FileList | File[]): File[] {
  const selected = Array.from(files)
  if (selected.length > MAX_FILES) {
    emit('invalid', `单次最多选择 ${MAX_FILES} 张照片。`)
    return []
  }
  const invalidType = selected.find(file => !ACCEPTED_TYPES.has(file.type))
  if (invalidType) {
    emit('invalid', `${invalidType.name} 不是支持的 JPG、PNG 或 WebP 图片。`)
    return []
  }
  const oversized = selected.find(file => file.size > MAX_FILE_SIZE)
  if (oversized) {
    emit('invalid', `${oversized.name} 超过 50MB 大小限制。`)
    return []
  }
  return selected
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    const files = validateFiles(target.files)
    if (files.length) emit('files', files)
  }
  target.value = ''
}

function handleDrop(event: DragEvent) {
  isDragOver.value = false
  if (event.dataTransfer?.files?.length) {
    const files = validateFiles(event.dataTransfer.files)
    if (files.length) emit('files', files)
  }
}
</script>

<template>
  <section
    class="upload-tile"
    :class="{ 'drag-over': isDragOver, 'is-uploading': uploading }"
    role="button"
    tabindex="0"
    aria-label="上传照片"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="handleDrop"
    @click="!uploading && chooseFiles()"
    @keydown.enter.prevent="!uploading && chooseFiles()"
    @keydown.space.prevent="!uploading && chooseFiles()"
  >
    <template v-if="!uploading">
      <span class="upload-icon">
        <Icon name="upload" :size="28" />
      </span>
      <strong>拖拽上传照片</strong>
      <small>JPG / PNG / WebP</small>
      <small>单张不超过 50MB</small>
    </template>
    <div v-else class="upload-progress" role="status" @click.stop>
      <span class="upload-icon spinning-icon">
        <Icon name="refresh" :size="24" />
      </span>
      <strong>{{ statusText || '已加入队列，正在上传…' }}</strong>
      <small>处理进度请查看右侧任务中心</small>
    </div>
    <input ref="input" type="file" multiple accept="image/jpeg,image/png,image/webp" hidden @change="handleInput" />
  </section>
</template>

<style scoped>
.upload-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 248px;
  padding: 20px 16px;
  border-radius: 14px;
  border: 1.5px dashed #7dd3b5;
  background: rgba(236, 253, 245, 0.55);
  color: #00b88f;
  cursor: pointer;
  text-align: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

/* 拖拽波纹背景 */
.upload-tile::before {
  content: '';
  position: absolute;
  inset: -50%;
  background: radial-gradient(circle, rgba(0, 184, 143, 0.1) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.upload-tile:hover,
.upload-tile:focus-visible {
  background: rgba(220, 252, 231, 0.75);
  border-color: #00b88f;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 184, 143, 0.15);
}

.upload-tile:hover::before {
  opacity: 1;
  animation: upload-ripple-pulse 2s ease-in-out infinite;
}

@keyframes upload-ripple-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.3;
  }
  50% {
    transform: scale(1.5);
    opacity: 0.6;
  }
}

/* 拖拽悬浮状态 */
.upload-tile.drag-over {
  background: rgba(220, 252, 231, 0.95);
  border-color: #00b88f;
  border-width: 2.5px;
  border-style: solid;
  transform: scale(1.02);
  box-shadow: 0 12px 32px rgba(0, 184, 143, 0.25),
              inset 0 0 40px rgba(0, 184, 143, 0.1);
  animation: upload-drag-bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
}

@keyframes upload-drag-bounce {
  0%, 100% {
    transform: scale(1.02);
  }
  50% {
    transform: scale(1.05);
  }
}

.upload-tile.drag-over::before {
  opacity: 1;
  animation: upload-drag-ripple 1s ease-in-out infinite;
}

@keyframes upload-drag-ripple {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* 上传中状态 */
.upload-tile.is-uploading {
  pointer-events: none;
  background: rgba(236, 253, 245, 0.85);
  border-style: solid;
}

.upload-tile:focus-visible {
  outline: 2px solid #00b88f;
  outline-offset: 4px;
}

.upload-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 184, 143, 0.12);
  margin-bottom: 4px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.upload-tile:hover .upload-icon,
.upload-tile.drag-over .upload-icon {
  background: rgba(0, 184, 143, 0.2);
  transform: scale(1.1) rotate(5deg);
  box-shadow: 0 4px 16px rgba(0, 184, 143, 0.3);
}

.upload-tile.drag-over .upload-icon {
  animation: upload-icon-bounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
}

@keyframes upload-icon-bounce {
  0%, 100% {
    transform: scale(1.1) rotate(5deg) translateY(0);
  }
  50% {
    transform: scale(1.2) rotate(-5deg) translateY(-8px);
  }
}

.spinning-icon {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.upload-tile strong {
  font-size: 15px;
  font-weight: 750;
  transition: all 0.2s ease;
}

.upload-tile:hover strong,
.upload-tile.drag-over strong {
  transform: translateY(-2px);
}

.upload-tile small {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  color: #9ca3af;
  transition: color 0.2s ease;
}

.upload-tile:hover small,
.upload-tile.drag-over small {
  color: #047857;
}

.upload-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #047857;
  animation: upload-progress-fade-in 0.3s ease;
}

@keyframes upload-progress-fade-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 上传成功标记 */
@keyframes upload-success-mark {
  0% {
    opacity: 0;
    transform: scale(0) rotate(-180deg);
  }
  50% {
    transform: scale(1.2) rotate(10deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

/* 焦点流光效果 */
.upload-tile:focus-visible::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    transparent 0%,
    rgba(0, 184, 143, 0.1) 50%,
    transparent 100%
  );
  animation: upload-focus-shimmer 2s ease-in-out infinite;
}

@keyframes upload-focus-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/* 移动端优化 */
@media (max-width: 640px) {
  .upload-tile {
    min-height: 200px;
  }
  
  .upload-icon {
    width: 44px;
    height: 44px;
  }
}

/* 无障碍 */
@media (prefers-reduced-motion: reduce) {
  .upload-tile,
  .upload-tile::before,
  .upload-tile::after,
  .upload-icon,
  .upload-progress {
    animation: none !important;
    transition: none !important;
  }
}
</style>
