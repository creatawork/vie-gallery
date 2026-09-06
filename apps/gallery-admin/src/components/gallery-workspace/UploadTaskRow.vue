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
  // Parent owns the request; keeping the short busy state prevents double clicks.
  window.setTimeout(() => { busyAction.value = null }, 700)
}

async function copyRequestId() {
  if (!requestId.value) return
  await navigator.clipboard?.writeText(requestId.value)
}
</script>

<template>
  <article class="task-row" :class="`task-row-${statusMeta.className}`">
    <div class="task-main">
      <div class="task-thumb" :class="{ 'has-image': task.thumbnailUrl || task.photoThumbnailUrl }">
        <img v-if="task.thumbnailUrl || task.photoThumbnailUrl" :src="task.thumbnailUrl || task.photoThumbnailUrl || undefined" :alt="task.filename || '照片缩略图'" />
        <Icon v-else name="photo" :size="19" />
      </div>
      <div class="task-copy">
        <strong class="task-filename" :title="task.filename || '未命名文件'">{{ task.filename || '未命名文件' }}</strong>
        <div class="task-meta">
          <span>{{ task.stage || '上传处理' }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ task.attempts }}/{{ task.maxAttempts }} 次尝试</span>
        </div>
      </div>
      <div class="task-status" :class="`status-${statusMeta.className}`">
        <Icon :name="statusMeta.icon" :size="14" :class="{ spin: ['queued', 'processing', 'cancel-requested'].includes(statusMeta.className) }" />
        <span>{{ statusMeta.label }}</span>
      </div>
    </div>

    <div class="task-progress">
      <div class="progress-line">
        <div class="progress-track" role="progressbar" :aria-valuenow="displayProgress" aria-valuemin="0" aria-valuemax="100" :aria-label="`${task.filename || '任务'}进度`">
          <span :style="{ width: `${displayProgress}%` }"></span>
        </div>
        <span>{{ displayProgress }}%</span>
      </div>
      <p v-if="task.status === 'PROCESSING' || task.status === 'QUEUED'" class="progress-caption">{{ task.stage || '等待处理' }}</p>
      <p v-if="task.status === 'FAILED'" class="task-error">{{ displayError }}</p>
    </div>

    <div class="task-actions">
      <button v-if="canWrite && task.status === 'FAILED' && task.retryable" class="btn btn-secondary task-action" type="button" :disabled="!!busyAction" @click="invoke('retry')">
        <Icon name="refresh" :size="14" :class="{ spin: busyAction === 'retry' }" />
        <span>重试</span>
      </button>
      <button v-if="canWrite && ['QUEUED', 'PROCESSING'].includes(task.status)" class="btn btn-quiet task-action" type="button" :disabled="!!busyAction" @click="invoke('cancel')">
        <Icon name="x" :size="14" />
        <span>取消</span>
      </button>
      <button class="details-button" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        <span>{{ expanded ? '收起' : '详情' }}</span>
        <Icon name="arrow-right" :size="13" :class="{ rotated: expanded }" />
      </button>
    </div>

    <div v-if="expanded" class="task-details">
      <dl>
        <div><dt>创建时间</dt><dd>{{ formatDate(task.createdAt) }}</dd></div>
        <div><dt>开始时间</dt><dd>{{ formatDate(task.startedAt) }}</dd></div>
        <div><dt>完成时间</dt><dd>{{ formatDate(task.finishedAt) }}</dd></div>
        <div><dt>处理耗时</dt><dd>{{ formatDuration() }}</dd></div>
        <div v-if="task.errorCode || task.error?.code"><dt>错误代码</dt><dd>{{ task.errorCode || task.error?.code }}</dd></div>
        <div v-if="requestId" class="request-id"><dt>请求 ID</dt><dd><code>{{ requestId }}</code><button type="button" aria-label="复制请求 ID" title="复制请求 ID" @click="copyRequestId"><Icon name="copy" :size="13" /></button></dd></div>
      </dl>
    </div>
  </article>
</template>

<style scoped>
.task-row {
  display: grid;
  grid-template-columns: minmax(210px, 1.35fr) minmax(170px, 1fr) auto;
  gap: 16px;
  align-items: center;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-xs);
}
.task-main, .task-actions, .progress-line { display: flex; align-items: center; }
.task-main { min-width: 0; gap: 11px; }
.task-thumb { display: grid; width: 42px; height: 42px; flex: 0 0 42px; place-items: center; overflow: hidden; border-radius: 11px; color: var(--text-tertiary); background: var(--bg-surface-subtle); }
.task-thumb img { width: 100%; height: 100%; object-fit: cover; }
.task-copy { min-width: 0; }
.task-filename { display: block; overflow: hidden; color: var(--text-primary); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.task-meta { display: flex; gap: 6px; margin-top: 4px; color: var(--text-tertiary); font-size: 11px; }
.task-status { display: inline-flex; align-items: center; justify-content: center; gap: 5px; width: max-content; padding: 5px 9px; border-radius: var(--radius-full); font-size: 11px; font-weight: 700; white-space: nowrap; }
.status-queued, .status-processing, .status-cancel-requested { color: #92400e; background: #fffbeb; }
.status-succeeded { color: #047857; background: #ecfdf5; }
.status-failed { color: #b91c1c; background: #fef2f2; }
.status-cancelled, .status-unknown { color: #64748b; background: #f1f5f9; }
.progress-line { gap: 9px; color: var(--text-tertiary); font-size: 11px; }
.progress-track { height: 7px; flex: 1; overflow: hidden; border-radius: var(--radius-full); background: #e8eeeb; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--brand-accent), #059669); transition: width .3s ease; }
.progress-caption, .task-error { margin-top: 5px; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.progress-caption { color: var(--text-tertiary); }
.task-error { color: #b91c1c; }
.task-actions { justify-content: flex-end; gap: 5px; }
.task-action { padding: 7px 10px; font-size: 11px; }
.btn-quiet { color: var(--text-secondary); }
.btn-quiet:hover:not(:disabled) { color: #b91c1c; background: #fef2f2; }
.details-button { display: inline-flex; align-items: center; gap: 3px; padding: 7px 4px; color: var(--text-tertiary); font-size: 11px; white-space: nowrap; }
.details-button:hover, .details-button:focus-visible { color: var(--brand-deep, #087a5c); outline: none; }
.details-button svg { transition: transform .2s ease; }
.details-button svg.rotated { transform: rotate(90deg); }
.task-details { grid-column: 1 / -1; padding: 13px 0 0 53px; border-top: 1px solid var(--border-subtle); }
.task-details dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 18px; }
.task-details dl > div { min-width: 0; }
.task-details dt { color: var(--text-tertiary); font-size: 10px; }
.task-details dd { display: flex; align-items: center; gap: 4px; min-width: 0; margin-top: 3px; overflow: hidden; color: var(--text-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.task-details code { overflow: hidden; font-family: var(--font-mono); text-overflow: ellipsis; }
.request-id dd button { display: inline-grid; flex: 0 0 auto; place-items: center; padding: 2px; color: var(--text-tertiary); }
.request-id dd button:hover { color: var(--brand-accent); }
.spin { animation: task-spin .9s linear infinite; }
@keyframes task-spin { to { transform: rotate(360deg); } }
@media (max-width: 840px) { .task-row { grid-template-columns: minmax(0, 1fr) auto; } .task-progress { grid-column: 1 / -1; } }
@media (max-width: 560px) { .task-row { grid-template-columns: 1fr; gap: 11px; padding: 13px; } .task-status { grid-column: 1 / -1; justify-self: start; } .task-actions { justify-content: flex-start; flex-wrap: wrap; } .task-details { padding-left: 0; } .task-details dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .task-action { flex: 1; } .details-button { margin-left: auto; } }
@media (prefers-reduced-motion: reduce) { .spin, .progress-track span, .details-button svg { animation: none; transition: none; } }
</style>
