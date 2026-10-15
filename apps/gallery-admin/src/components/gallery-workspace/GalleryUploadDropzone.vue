<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from '../Icon.vue'

const props = defineProps<{
  uploading: boolean
  progress?: number
  statusText?: string
}>()

const emit = defineEmits<{
  (event: 'files', files: FileList | File[]): void
  (event: 'invalid', detail: { message: string; count: number }): void
}>()

interface InvalidEntry {
  name: string
  reason: string
}

const isDragOver = ref(false)
const input = ref<HTMLInputElement | null>(null)
const MAX_FILES = 50
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function chooseFiles() {
  if (!props.uploading) input.value?.click()
}

defineExpose({ chooseFiles })

// 逐文件校验：坏文件单独报告，不再整批拒绝。
function partitionFiles(files: FileList | File[]): { valid: File[]; invalid: InvalidEntry[] } {
  const valid: File[] = []
  const invalid: InvalidEntry[] = []
  for (const file of Array.from(files)) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      invalid.push({ name: file.name, reason: `${file.name} 不是支持的 JPG、PNG 或 WebP 图片` })
    } else if (file.size > MAX_FILE_SIZE) {
      invalid.push({ name: file.name, reason: `${file.name} 超过 50MB 大小限制` })
    } else {
      valid.push(file)
    }
  }
  return { valid, invalid }
}

function emitSelection(files: FileList | File[]) {
  const { valid, invalid } = partitionFiles(files)
  const ignored = Math.max(0, valid.length - MAX_FILES)
  const accepted = valid.slice(0, MAX_FILES)

  const parts: string[] = []
  const firstInvalid = invalid[0]
  if (invalid.length === 1 && firstInvalid) parts.push(firstInvalid.reason)
  else if (invalid.length > 1 && firstInvalid) parts.push(`${invalid.length} 张文件不符合要求（如 ${firstInvalid.name}）`)
  if (ignored > 0) parts.push(`超出单次 ${MAX_FILES} 张上限，已忽略 ${ignored} 张`)
  const message = parts.join('；')

  if (message) emit('invalid', { message, count: invalid.length + ignored })
  if (accepted.length) emit('files', accepted)
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emitSelection(target.files)
  target.value = ''
}

function handleDrop(event: DragEvent) {
  isDragOver.value = false
  if (event.dataTransfer?.files?.length) emitSelection(event.dataTransfer.files)
}

function handlePaste(event: ClipboardEvent) {
  if (props.uploading) return
  const files = event.clipboardData?.files
  if (files?.length) emitSelection(files)
}

onMounted(() => document.addEventListener('paste', handlePaste))
onUnmounted(() => document.removeEventListener('paste', handlePaste))
</script>

<template>
  <section
    class="upload-tile"
    :class="{ 'drag-over': isDragOver, 'is-uploading': uploading }"
    role="button"
    :tabindex="uploading ? -1 : 0"
    :aria-disabled="uploading"
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
      <strong>添加你的作品</strong>
      <span class="upload-instruction">拖拽到这里，或点击选择照片</span>
      <small>JPG / PNG / WebP，单张不超过 50MB</small>
    </template>
    <div v-else class="upload-progress" role="status" @click.stop>
      <span class="upload-icon spinning-icon">
        <Icon name="refresh" :size="24" />
      </span>
      <strong>{{ statusText || '已加入队列，正在上传…' }}</strong>
      <div v-if="typeof progress === 'number' && progress > 0" class="progress-track" aria-hidden="true">
        <div class="progress-bar" :style="{ width: `${Math.min(100, Math.max(2, progress))}%` }"></div>
      </div>
      <small v-if="typeof progress === 'number' && progress > 0">{{ progress }}%</small>
      <small>处理进度可在上传任务中查看</small>
    </div>
    <input ref="input" type="file" multiple accept="image/jpeg,image/png,image/webp" hidden @change="handleInput" />
  </section>
</template>

<style scoped>
.upload-tile {
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:8px;
  min-height:236px;
  padding:24px 16px;
  border:1px dashed var(--border-strong);
  border-radius:10px;
  background:var(--bg-app);
  color:var(--text-secondary);
  cursor:pointer;
  text-align:center;
  transition:background .18s,border-color .18s;
  position:relative
}

.upload-tile:hover,.upload-tile.drag-over {
  border-color:var(--brand-accent);
  background:var(--mint-soft)
}

.upload-tile:focus-visible {
  outline:2px solid var(--brand-accent);
  outline-offset:3px
}

.upload-tile.is-uploading {
  cursor:progress
}

.upload-icon {
  display:grid;
  place-items:center;
  width:44px;
  height:44px;
  margin-bottom:7px;
  color:var(--brand-accent)
}

.upload-tile strong {
  font-size:14px;
  font-weight:600;
  color:var(--text-primary);
  line-height:1.6
}

.upload-instruction {
  font-size:12px;
  line-height:1.6
}

.upload-tile small {
  font-size:11px;
  line-height:1.7;
  color:var(--text-tertiary)
}

.upload-progress {
  width:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:8px
}

.progress-track {
  width:min(220px,85%);
  height:4px;
  border-radius:4px;
  background:var(--border-strong);
  overflow:hidden
}

.progress-bar {
  height:100%;
  background:var(--brand-accent);
  border-radius:4px;
  transition:width .2s
}

.spinning-icon {
  animation:upload-spin 1.2s linear infinite
}

@keyframes upload-spin {
  to {
    transform:rotate(360deg)
  }
}

@media(max-width:640px) {
  .upload-tile {
    min-height:220px;
    padding:20px 12px
  }
  .upload-instruction {
    font-size:11px
  }
  .upload-tile small {
    font-size:10px
  }
}

@media(prefers-reduced-motion:reduce) {
  .upload-tile,.progress-bar {
    transition:none
  }
  .spinning-icon {
    animation:none
  }
}
</style>
