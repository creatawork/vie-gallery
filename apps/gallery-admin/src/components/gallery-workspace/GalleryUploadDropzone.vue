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
  transition: all 0.2s ease;
}

.upload-tile:hover,
.upload-tile.drag-over,
.upload-tile:focus-visible {
  background: rgba(220, 252, 231, 0.85);
  border-color: #00b88f;
}

.upload-tile:focus-visible {
  outline: 2px solid #00b88f;
  outline-offset: 2px;
}

.upload-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 184, 143, 0.12);
  margin-bottom: 4px;
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
}

.upload-tile small {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  color: #9ca3af;
}

.upload-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #047857;
}
</style>
