<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'
import UploadTaskRow from './UploadTaskRow.vue'
import type { UploadTask, TaskFilter } from '../../composables/useUploadTasks'

const props = withDefaults(defineProps<{
  tasks: UploadTask[]
  summary: { queued: number; processing: number; succeeded: number; failed: number; cancelRequested: number; cancelled: number }
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

const total = computed(() => props.summary.queued + props.summary.processing + props.summary.cancelRequested + props.summary.succeeded + props.summary.failed + props.summary.cancelled)
const activeCount = computed(() => props.summary.queued + props.summary.processing + props.summary.cancelRequested)
const filterOptions = computed<Array<{ value: TaskFilter; label: string; count?: number }>>(() => [
  { value: 'ALL', label: '全部任务', count: total.value },
  { value: 'ACTIVE', label: '进行中', count: activeCount.value },
  { value: 'FAILED', label: '失败需处理', count: props.summary.failed },
  { value: 'COMPLETED', label: '已完成', count: props.summary.succeeded + props.summary.cancelled }
])
</script>

<template>
  <section class="task-center-container" aria-labelledby="task-center-title">
    <div class="task-center-header">
      <div class="task-center-title-group">
        <div class="title-with-badge">
          <Icon name="upload" :size="18" class="header-icon" />
          <h2 id="task-center-title">上传与切片任务中心</h2>
          <span v-if="activeCount" class="live-pulse-badge">
            <span class="live-dot"></span>
            {{ activeCount }} 个任务进行中
          </span>
        </div>
        <p class="task-center-subtitle">实时查看大图切片与 WebGL 纹理转换队列，失败任务可快速重试</p>
      </div>

      <div class="task-center-actions">
        <button
          class="btn btn-secondary btn-sm refresh-btn"
          type="button"
          :disabled="loading || refreshing"
          title="刷新任务状态"
          @click="emit('refresh')"
        >
          <Icon name="refresh" :size="14" :class="{ spin: loading || refreshing }" />
          <span>{{ refreshing ? '刷新中…' : '刷新' }}</span>
        </button>
      </div>
    </div>

    <!-- Summary Stats Chips -->
    <div class="task-summary-chips" aria-label="任务概览">
      <div class="summary-chip" :class="{ 'has-active': activeCount > 0 }">
        <span class="chip-dot dot-active"></span>
        <span class="chip-label">处理中</span>
        <strong class="chip-val">{{ activeCount }}</strong>
      </div>
      <div class="summary-chip" :class="{ 'has-failed': summary.failed > 0 }">
        <span class="chip-dot dot-failed"></span>
        <span class="chip-label">失败</span>
        <strong class="chip-val">{{ summary.failed }}</strong>
      </div>
      <div class="summary-chip">
        <span class="chip-dot dot-success"></span>
        <span class="chip-label">已完成</span>
        <strong class="chip-val">{{ summary.succeeded }}</strong>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="task-filter-pills" role="tablist">
      <button
        v-for="option in filterOptions"
        :key="option.value"
        class="task-filter-btn"
        :class="{ active: filter === option.value }"
        type="button"
        role="tab"
        :aria-selected="filter === option.value"
        @click="emit('update:filter', option.value)"
      >
        <span>{{ option.label }}</span>
        <span class="filter-count-bubble">{{ option.count }}</span>
      </button>
    </div>

    <!-- States: Loading / Error / Empty / List -->
    <div v-if="loading" class="task-center-state" role="status">
      <Icon name="refresh" :size="20" class="spin spin-emerald" />
      <span>正在同步任务队列…</span>
    </div>

    <div v-else-if="error" class="task-center-state state-error" role="alert">
      <Icon name="alert-circle" :size="20" />
      <span>{{ error.message }}</span>
      <button class="btn btn-secondary btn-sm" type="button" @click="emit('refresh')">重新加载</button>
    </div>

    <div v-else-if="!tasks.length" class="task-center-state state-empty">
      <div class="empty-icon-wrap">
        <Icon name="check" :size="18" />
      </div>
      <strong>暂无上传任务</strong>
      <p>上传新的照片素材后，切片与处理进度将在此处实时更新。</p>
    </div>

    <div v-else class="task-items-list">
      <UploadTaskRow
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :can-write="canWrite"
        @retry="emit('retry', $event)"
        @cancel="emit('cancel', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.task-center-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 28px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.task-center-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-icon {
  color: #059669;
}

.title-with-badge h2 {
  font-size: 18px;
  font-weight: 750;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.live-pulse-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 700;
  color: #047857;
  background: #ecfdf5;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.task-center-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
}

.refresh-btn {
  border-radius: 9px;
}

/* Summary Chips */
.task-summary-chips {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.summary-chip.has-active {
  background: #ecfdf5;
  border-color: rgba(16, 185, 129, 0.25);
  color: #047857;
}

.summary-chip.has-failed {
  background: #fef2f2;
  border-color: rgba(239, 68, 68, 0.25);
  color: #dc2626;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.dot-active { background: #10b981; }
.dot-failed { background: #ef4444; }
.dot-success { background: #059669; }

.chip-val {
  font-weight: 800;
}

/* Filter Tabs */
.task-filter-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
  align-self: flex-start;
}

.task-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: #64748b;
  background: transparent;
  transition: all 0.2s ease;
}

.task-filter-btn.active {
  background: #ffffff;
  color: #047857;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.filter-count-bubble {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.16);
}

.task-filter-btn.active .filter-count-bubble {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

/* States */
.task-center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 36px 20px;
  border-radius: 14px;
  background: #f8fafc;
  color: #64748b;
  text-align: center;
}

.spin-emerald {
  color: #059669;
}

.empty-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #ecfdf5;
  color: #059669;
  display: grid;
  place-items: center;
}

.state-empty strong {
  font-size: 14px;
  color: #0f172a;
}

.state-empty p {
  font-size: 12.5px;
  color: #64748b;
}

.task-items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
