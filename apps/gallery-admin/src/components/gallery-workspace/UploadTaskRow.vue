<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '../Icon.vue'
import type { UploadTask } from '../../composables/useUploadTasks'

type Props = {
  task: UploadTask
  canWrite?: boolean
}

const props = withDefaults(defineProps<Props>(), { canWrite: false })
const emit = defineEmits<{
  (event: 'retry', task: UploadTask): void
  (event: 'cancel', task: UploadTask): void
}>()

const expanded = ref(false)
const busyAction = ref<'retry' | 'cancel' | null>(null)

const statusMeta = computed(() => {
  const status = props.task.status
  if (status === 'QUEUED') return { label: '排队中', className: 'queued', icon: 'refresh' }
  if (status === 'PROCESSING') return { label: '处理中', className: 'processing', icon: 'refresh' }
  if (status === 'SUCCEEDED') return { label: '已完成', className: 'succeeded', icon: 'check' }
  if (status === 'FAILED') return { label: '处理失败', className: 'failed', icon: 'alert-circle' }
  if (status === 'CANCEL_REQUESTED') return { label: '取消中', className: 'cancel-requested', icon: 'refresh' }
  if (status === 'CANCELLED') return { label: '已取消', className: 'cancelled', icon: 'x' }
  return { label: status, className: 'unknown', icon: 'alert-circle' }
})

const displayProgress = computed(() => props.task.status === 'SUCCEEDED' ? 100 : props.task.progress)
const displayError = computed(() => props.task.error?.message || props.task.errorMessage || '处理失败，请重试。')
const requestId = computed(() => props.task.error?.requestId || props.task.requestId)

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatDuration() {
  const start = props.task.startedAt || props.task.createdAt
  const end = props.task.finishedAt || props.task.updatedAt
  if (!start || !end) return '—'
  const milliseconds = Math.max(0, new Date(end).getTime() - new Date(start).getTime())
  if (!Number.isFinite(milliseconds)) return '—'
  const seconds = Math.round(milliseconds / 1000)
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function invoke(action: 'retry' | 'cancel') {
  if (busyAction.value) return
  busyAction.value = action
  if (action === 'retry') emit('retry', props.task)
  else emit('cancel', props.task)
  window.setTimeout(() => { busyAction.value = null }, 700)
}

async function copyRequestId() {
  if (!requestId.value) return
  await navigator.clipboard?.writeText(requestId.value)
}
</script>

<template>
  <article class="task-row-card" :class="`task-state-${statusMeta.className}`">
    <div class="task-row-primary">
      <div class="task-thumbnail-wrap">
        <img
          v-if="task.thumbnailUrl || task.photoThumbnailUrl"
          :src="task.thumbnailUrl || task.photoThumbnailUrl || undefined"
          :alt="task.filename || '缩略图'"
          class="task-img"
        />
        <div v-else class="task-thumb-fallback">
          <Icon name="photo" :size="18" />
        </div>
      </div>

      <div class="task-main-details">
        <div class="task-title-line">
          <span class="task-filename" :title="task.filename || '未命名文件'">
            {{ task.filename || '未命名文件' }}
          </span>
          <span class="task-status-pill" :class="`status-${statusMeta.className}`">
            <Icon :name="statusMeta.icon" :size="12" :class="{ spin: ['queued', 'processing', 'cancel-requested'].includes(statusMeta.className) }" />
            <span>{{ statusMeta.label }}</span>
          </span>
        </div>

        <!-- Progress bar in row -->
        <div class="task-progress-section">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" :style="{ width: `${displayProgress}%` }"></div>
          </div>
          <span class="progress-text">{{ displayProgress }}%</span>
        </div>

        <p v-if="task.status === 'FAILED'" class="task-error-text">{{ displayError }}</p>
      </div>

      <div class="task-actions-col">
        <button
          v-if="canWrite && task.status === 'FAILED' && task.retryable"
          class="btn btn-secondary btn-xs task-btn"
          type="button"
          :disabled="!!busyAction"
          @click="invoke('retry')"
        >
          <Icon name="refresh" :size="13" :class="{ spin: busyAction === 'retry' }" />
          <span>重试</span>
        </button>

        <button
          v-if="canWrite && ['QUEUED', 'PROCESSING'].includes(task.status)"
          class="btn btn-ghost btn-xs task-btn text-danger"
          type="button"
          :disabled="!!busyAction"
          @click="invoke('cancel')"
        >
          <Icon name="x" :size="13" />
          <span>取消</span>
        </button>

        <button
          class="expand-detail-btn"
          type="button"
          :aria-expanded="expanded"
          title="任务详情"
          @click="expanded = !expanded"
        >
          <Icon :name="expanded ? 'chevron-down' : 'chevron-right'" :size="14" />
        </button>
      </div>
    </div>

    <!-- Collapsible Detail Info -->
    <div v-if="expanded" class="task-expanded-detail">
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">创建时间</span><span class="detail-val">{{ formatDate(task.createdAt) }}</span></div>
        <div class="detail-item"><span class="detail-label">处理耗时</span><span class="detail-val">{{ formatDuration() }}</span></div>
        <div class="detail-item"><span class="detail-label">尝试次数</span><span class="detail-val">{{ task.attempts }}/{{ task.maxAttempts }}</span></div>
        <div v-if="task.errorCode || task.error?.code" class="detail-item">
          <span class="detail-label">错误代码</span><span class="detail-val text-danger">{{ task.errorCode || task.error?.code }}</span>
        </div>
      </div>
      <div v-if="requestId" class="request-id-box">
        <span class="detail-label">Trace ID:</span>
        <code>{{ requestId }}</code>
        <button type="button" class="copy-id-btn" title="复制 ID" @click="copyRequestId">
          <Icon name="copy" :size="12" />
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.task-row-card {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  transition: all 0.2s ease;
}

.task-row-card:hover {
  background: #ffffff;
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
}

.task-row-primary {
  display: flex;
  align-items: center;
  gap: 14px;
}

.task-thumbnail-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  background: #ecfdf5;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.task-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-thumb-fallback {
  color: #059669;
}

.task-main-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-filename {
  font-size: 13.5px;
  font-weight: 650;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.status-queued { color: #047857; background: #ecfdf5; }
.status-processing { color: #b45309; background: #fef3c7; }
.status-succeeded { color: #047857; background: #ecfdf5; }
.status-failed { color: #dc2626; background: #fee2e2; }
.status-cancelled { color: #64748b; background: #f1f5f9; }

.task-progress-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar-track {
  flex: 1;
  height: 5px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #34d399, #059669);
  border-radius: 9999px;
  transition: width 0.25s ease;
}

.progress-text {
  font-size: 11.5px;
  font-weight: 700;
  color: #64748b;
  min-width: 34px;
  text-align: right;
}

.task-error-text {
  font-size: 12px;
  color: #dc2626;
  margin-top: 2px;
}

.task-actions-col {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-xs {
  padding: 4px 8px;
  font-size: 11.5px;
  border-radius: 6px;
}

.text-danger {
  color: #dc2626;
}

.expand-detail-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: #94a3b8;
  background: transparent;
  transition: all 0.15s ease;
}

.expand-detail-btn:hover {
  color: #0f172a;
  background: #e2e8f0;
}

/* Expanded details */
.task-expanded-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 11px;
  color: #94a3b8;
}

.detail-val {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.request-id-box {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  background: #ffffff;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.request-id-box code {
  font-family: var(--font-mono, monospace);
  color: #475569;
}

.copy-id-btn {
  color: #94a3b8;
  padding: 2px;
}

.copy-id-btn:hover {
  color: #0f172a;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
