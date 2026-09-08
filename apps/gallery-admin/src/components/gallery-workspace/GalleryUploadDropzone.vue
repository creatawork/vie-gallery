<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../Icon.vue'

defineProps<{
  uploading: boolean
  progress: number
  statusText: string
}>()

const emit = defineEmits<{
  (event: 'files', files: FileList | File[]): void
  (event: 'invalid', message: string): void
}>()

const isDragOver = ref(false)
const input = ref<HTMLInputElement | null>(null)
const MAX_FILES = 50
const MAX_FILE_SIZE = 100 * 1024 * 1024
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
    emit('invalid', `${oversized.name} 超过 100MB 大小限制。`)
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
    class="upload-dropzone-box"
    :class="{ 'drag-over': isDragOver, 'is-uploading': uploading }"
    aria-label="上传照片"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="handleDrop"
    @click="!uploading && chooseFiles()"
  >
    <template v-if="!uploading">
      <div class="dropzone-body">
        <div class="upload-icon-circle">
          <Icon name="upload" :size="22" />
        </div>
        <div class="dropzone-text-group">
          <h3 class="dropzone-title">拖拽照片到此处上传，或 <span class="highlight-link">浏览文件</span></h3>
          <p class="dropzone-hint">支持 JPG、PNG、WebP 高清大图，系统将自动切片并生成 WebGL 3D 纹理</p>
        </div>
      </div>
    </template>

    <div v-else class="upload-progress-box" role="status" aria-live="polite" @click.stop>
      <div class="progress-top-info">
        <div class="progress-label-wrap">
          <Icon name="refresh" :size="16" class="spin spin-emerald" />
          <strong class="progress-status-title">{{ statusText || '正在分片上传并处理照片…' }}</strong>
        </div>
        <span class="progress-percentage">{{ progress }}%</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
    </div>

    <input ref="input" type="file" multiple accept="image/jpeg,image/png,image/webp" hidden @change="handleInput" />
  </section>
</template>

<style scoped>
.upload-dropzone-box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 28px;
  border-radius: 18px;
  border: 1.5px dashed rgba(16, 185, 129, 0.4);
  background: linear-gradient(145deg, rgba(236, 253, 245, 0.45) 0%, rgba(255, 255, 255, 0.9) 100%);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.upload-dropzone-box:hover,
.upload-dropzone-box.drag-over {
  border-color: #10b981;
  background: rgba(236, 253, 245, 0.8);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.12);
  transform: translateY(-1px);
}

.upload-dropzone-box.is-uploading {
  cursor: default;
  border-style: solid;
  border-color: rgba(16, 185, 129, 0.35);
  background: #ffffff;
}

.dropzone-body {
  display: flex;
  align-items: center;
  gap: 18px;
}

.upload-icon-circle {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #059669;
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  border: 1px solid rgba(16, 185, 129, 0.2);
  flex-shrink: 0;
}

.dropzone-text-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropzone-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.highlight-link {
  color: #059669;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dropzone-hint {
  font-size: 12.5px;
  color: #64748b;
}

/* Uploading Progress */
.upload-progress-box {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-top-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-label-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.spin-emerald {
  color: #059669;
}

.progress-status-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.progress-percentage {
  font-size: 14px;
  font-weight: 800;
  color: #059669;
}

.progress-track {
  width: 100%;
  height: 8px;
  background: #f1f5f9;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #34d399, #059669);
  border-radius: 9999px;
  transition: width 0.25s ease;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .dropzone-body {
    flex-direction: column;
    text-align: center;
  }
}
</style>
