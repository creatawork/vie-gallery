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
}>()

const isDragOver = ref(false)
const input = ref<HTMLInputElement | null>(null)

function chooseFiles() {
  input.value?.click()
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) emit('files', target.files)
  target.value = ''
}

function handleDrop(event: DragEvent) {
  isDragOver.value = false
  if (event.dataTransfer?.files?.length) emit('files', event.dataTransfer.files)
}
</script>

<template>
  <section
    class="upload-dropzone"
    :class="{ 'drag-over': isDragOver, 'is-uploading': uploading }"
    aria-label="上传照片"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="handleDrop"
  >
    <template v-if="!uploading">
      <div class="upload-icon-circle">
        <Icon name="upload" :size="24" />
      </div>
      <div class="dropzone-copy">
        <h2>上传第一组照片</h2>
        <p>拖拽照片至此处，或选择设备中的图片开始创作</p>
        <button class="btn btn-secondary" type="button" @click="chooseFiles">
          <Icon name="upload" :size="15" />
          <span>选择照片</span>
        </button>
        <small>支持 JPG、PNG、WebP，单次最多 50 张</small>
      </div>
    </template>

    <div v-else class="upload-progress-box" role="status" aria-live="polite">
      <div class="upload-progress-icon"><Icon name="refresh" :size="22" class="spin" /></div>
      <div class="progress-copy">
        <strong>{{ statusText || '正在处理照片…' }}</strong>
        <div class="progress-bar-track" aria-hidden="true">
          <div class="progress-bar-fill" :style="{ width: `${progress}%` }"></div>
        </div>
      </div>
      <span class="progress-percentage">{{ progress }}%</span>
    </div>

    <input ref="input" type="file" multiple accept="image/jpeg,image/png,image/webp" hidden @change="handleInput" />
  </section>
</template>

<style scoped>
.upload-dropzone {
  display: flex;
  min-height: 190px;
  align-items: center;
  justify-content: center;
  gap: 22px;
  margin-top: 22px;
  padding: 28px;
  border: 1px dashed rgba(16, 185, 129, 0.34);
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.75), rgba(255, 255, 255, 0.92));
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.upload-dropzone:focus-within,
.upload-dropzone.drag-over {
  border-color: var(--brand-accent);
  background: var(--brand-accent-subtle);
  transform: translateY(-1px);
}

.upload-icon-circle,
.upload-progress-icon {
  display: grid;
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 18px;
  color: #059669;
  background: #ffffff;
  box-shadow: var(--shadow-md);
}

.dropzone-copy {
  min-width: 0;
}

.dropzone-copy h2 {
  color: var(--text-primary);
  font-size: 18px;
  letter-spacing: -0.025em;
}

.dropzone-copy p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.dropzone-copy .btn {
  margin-top: 14px;
}

.dropzone-copy small {
  display: block;
  margin-top: 10px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.upload-progress-box {
  display: flex;
  width: min(620px, 100%);
  align-items: center;
  gap: 16px;
}

.progress-copy {
  min-width: 0;
  flex: 1;
}

.progress-copy strong {
  display: block;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-bar-track {
  height: 9px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: rgba(203, 213, 225, 0.55);
}

.progress-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #10b981, #059669);
  transition: width 0.35s ease;
}

.progress-percentage {
  color: var(--brand-deep, #087a5c);
  font-size: 13px;
  font-weight: 750;
}

@media (max-width: 560px) {
  .upload-dropzone {
    min-height: 180px;
    flex-direction: column;
    gap: 14px;
    padding: 24px 18px;
    text-align: center;
  }

  .dropzone-copy .btn {
    width: 100%;
  }

  .upload-progress-box {
    flex-wrap: wrap;
  }

  .progress-copy {
    width: calc(100% - 74px);
    flex: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .upload-dropzone,
  .progress-bar-fill {
    transition: none;
  }
}
</style>
