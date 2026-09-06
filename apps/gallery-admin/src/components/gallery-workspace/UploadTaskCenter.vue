<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'
import UploadTaskRow from './UploadTaskRow.vue'
import type { UploadTask, TaskFilter } from '../../composables/useUploadTasks'

const props = withDefaults(defineProps<{
  tasks: UploadTask[]
  summary: { queued: number; processing: number; succeeded: number; failed: number; cancelled: number }
  loading: boolean
  refreshing?: boolean
  error?: Error | null
  canWrite?: boolean
  filter: TaskFilter
}>(), { refreshing: false, error: null, canWrite: false })

const emit = defineEmits<{
  (event: 'update:filter', value: TaskFilter): void
  (event: 'refresh'): void
  (event: 'retry', task: UploadTask): void
  (event: 'cancel', task: UploadTask): void
}>()

const total = computed(() => props.summary.queued + props.summary.processing + props.summary.succeeded + props.summary.failed + props.summary.cancelled)
const filterOptions = computed<Array<{ value: TaskFilter; label: string; count?: number }>>(() => [
  { value: 'ALL', label: '全部', count: total.value },
  { value: 'ACTIVE', label: '进行中', count: props.summary.queued + props.summary.processing },
  { value: 'FAILED', label: '失败', count: props.summary.failed },
  { value: 'COMPLETED', label: '已完成', count: props.summary.succeeded + props.summary.cancelled }
])
</script>

<template>
  <section class="task-center" aria-labelledby="task-center-title">
    <div class="task-center-header">
      <div class="task-center-heading">
        <span class="section-kicker">UPLOAD ACTIVITY</span>
        <div class="title-line">
          <h2 id="task-center-title">任务中心</h2>
          <span v-if="summary.queued + summary.processing" class="activity-indicator"><i></i>{{ summary.queued + summary.processing }} 个活动任务</span>
        </div>
        <p>实时查看照片处理进度，失败任务可以安全重试。</p>
      </div>
      <button class="refresh-button" type="button" :disabled="loading || refreshing" aria-label="刷新任务列表" title="刷新任务列表" @click="emit('refresh')">
        <Icon name="refresh" :size="16" :class="{ spin: loading || refreshing }" />
        <span>{{ refreshing ? '刷新中…' : '刷新' }}</span>
      </button>
    </div>

    <div class="task-summary" aria-label="任务摘要">
      <div class="summary-item summary-active"><strong>{{ summary.queued + summary.processing }}</strong><span>处理中</span></div>
      <div class="summary-item summary-failed"><strong>{{ summary.failed }}</strong><span>需处理</span></div>
      <div class="summary-item summary-done"><strong>{{ summary.succeeded }}</strong><span>已完成</span></div>
      <div class="summary-item summary-cancelled"><strong>{{ summary.cancelled }}</strong><span>已取消</span></div>
    </div>

    <div class="task-filters" role="tablist" aria-label="任务筛选">
      <button v-for="option in filterOptions" :key="option.value" class="filter-button" :class="{ active: filter === option.value }" type="button" role="tab" :aria-selected="filter === option.value" @click="emit('update:filter', option.value)">
        {{ option.label }}<span>{{ option.count }}</span>
      </button>
    </div>

    <div v-if="loading" class="task-state" role="status">
      <Icon name="refresh" :size="20" class="spin" />
      <span>正在加载任务…</span>
    </div>
    <div v-else-if="error" class="task-state task-state-error" role="alert">
      <Icon name="alert-circle" :size="20" />
      <span>{{ error.message }}</span>
      <button class="btn btn-secondary" type="button" @click="emit('refresh')">重试</button>
    </div>
    <div v-else-if="!tasks.length" class="task-state task-state-empty">
      <div class="empty-icon"><Icon name="check" :size="20" /></div>
      <strong>还没有上传任务</strong>
      <span>上传照片后，处理进度会显示在这里。</span>
    </div>
    <div v-else class="task-list">
      <UploadTaskRow v-for="task in tasks" :key="task.id" :task="task" :can-write="canWrite" @retry="emit('retry', $event)" @cancel="emit('cancel', $event)" />
    </div>
  </section>
</template>

<style scoped>
.task-center { margin-top: 24px; padding: 25px 26px 26px; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); background: rgba(255,255,255,.86); box-shadow: var(--shadow-md); }
.task-center-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.section-kicker { display: block; margin-bottom: 7px; color: var(--brand-deep, #087a5c); font-size: 10px; font-weight: 800; letter-spacing: .14em; }
.title-line { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.task-center h2 { color: var(--text-primary); font-size: 21px; letter-spacing: -.03em; }
.task-center-heading p { margin-top: 5px; color: var(--text-secondary); font-size: 13px; }
.activity-indicator { display: inline-flex; align-items: center; gap: 5px; color: #b45309; font-size: 11px; font-weight: 700; }
.activity-indicator i { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.12); }
.refresh-button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; color: var(--text-secondary); border-radius: 9px; font-size: 12px; font-weight: 650; }
.refresh-button:hover:not(:disabled), .refresh-button:focus-visible { color: var(--brand-deep, #087a5c); background: var(--brand-accent-subtle); outline: none; }
.refresh-button:disabled { cursor: wait; opacity: .65; }
.task-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 22px; }
.summary-item { display: flex; align-items: baseline; gap: 7px; padding: 12px; border-radius: var(--radius-md); background: var(--bg-surface-subtle); }
.summary-item strong { font-size: 20px; line-height: 1; letter-spacing: -.04em; }
.summary-item span { color: var(--text-tertiary); font-size: 11px; }
.summary-active strong { color: #b45309; }.summary-failed strong { color: #b91c1c; }.summary-done strong { color: #047857; }.summary-cancelled strong { color: #64748b; }
.task-filters { display: flex; gap: 4px; margin: 22px 0 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border-subtle); overflow-x: auto; scrollbar-width: thin; }
.filter-button { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; padding: 6px 9px; border-radius: 7px; color: var(--text-tertiary); font-size: 11px; font-weight: 650; }
.filter-button span { min-width: 16px; padding: 1px 4px; border-radius: var(--radius-full); color: inherit; background: var(--bg-surface-subtle); font-size: 10px; text-align: center; }
.filter-button:hover { color: var(--text-secondary); background: var(--bg-surface-subtle); }.filter-button.active { color: #047857; background: var(--brand-accent-subtle); }.filter-button.active span { color: #047857; background: #d1fae5; }
.task-list { display: flex; flex-direction: column; gap: 8px; min-width: 0; }.task-state { display: flex; min-height: 150px; align-items: center; justify-content: center; gap: 9px; color: var(--text-tertiary); font-size: 13px; }.task-state-error { flex-wrap: wrap; color: #b91c1c; text-align: center; }.task-state-error .btn { margin-left: 4px; padding: 7px 11px; font-size: 11px; }.task-state-empty { flex-direction: column; gap: 5px; }.task-state-empty strong { color: var(--text-secondary); font-size: 13px; }.empty-icon { display: grid; width: 40px; height: 40px; margin-bottom: 5px; place-items: center; border-radius: 12px; color: #059669; background: var(--brand-accent-subtle); }.task-state-empty span { color: var(--text-tertiary); font-size: 11px; }
.spin { animation: task-spin .9s linear infinite; } @keyframes task-spin { to { transform: rotate(360deg); } }
@media (max-width: 560px) { .task-center { margin-top: 18px; padding: 20px 16px; }.task-center-header { gap: 8px; }.refresh-button span { display: none; }.task-summary { gap: 5px; }.summary-item { display: block; padding: 10px 7px; text-align: center; }.summary-item strong, .summary-item span { display: block; }.summary-item span { margin-top: 4px; }.task-filters { margin-top: 18px; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
