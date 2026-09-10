<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '../Icon.vue'
import type { UploadTask, UploadTaskSummary, TaskFilter } from '@vie/gallery-contracts'

const props = withDefaults(defineProps<{
  tasks: UploadTask[]
  summary: UploadTaskSummary
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

const completedOpen = ref(true)
const copiedRequestId = ref<string | null>(null)

watch(() => props.filter, (val) => {
  if (val === 'COMPLETED' || val === 'FAILED') {
    completedOpen.value = true
  }
})

const readyTasks = computed(() => props.tasks.filter(t => t.status === 'QUEUED'))
const processingTasks = computed(() => props.tasks.filter(t => t.status === 'PROCESSING' || t.status === 'CANCEL_REQUESTED'))
const failedTasks = computed(() => props.tasks.filter(t => t.status === 'FAILED'))
const succeededOrCancelledTasks = computed(() => props.tasks.filter(t => t.status === 'SUCCEEDED' || t.status === 'CANCELLED'))
const completedTasks = computed(() => props.tasks.filter(t => t.status === 'SUCCEEDED' || t.status === 'CANCELLED' || t.status === 'FAILED'))

const showReady = computed(() => props.filter === 'ALL' || props.filter === 'ACTIVE')
const showProcessing = computed(() => props.filter === 'ALL' || props.filter === 'ACTIVE')
const showCompleted = computed(() => props.filter === 'ALL' || props.filter === 'COMPLETED')
const showFailedOnly = computed(() => props.filter === 'FAILED')

function fileLabel(task: UploadTask) {
  return task.filename || '未命名文件'
}

function statusCopy(task: UploadTask) {
  if (task.status === 'QUEUED') return '排队中'
  if (task.status === 'CANCEL_REQUESTED') return '正在取消…'
  if (task.status === 'PROCESSING') return task.stage ? `处理中 · ${task.stage}` : '处理中'
  if (task.status === 'FAILED') return task.errorMessage || '处理失败'
  if (task.status === 'CANCELLED') return '已取消'
  return '已完成'
}

async function copyRequestId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    copiedRequestId.value = id
    setTimeout(() => {
      if (copiedRequestId.value === id) copiedRequestId.value = null
    }, 2000)
  } catch {
    // Ignore clipboard failure
  }
}
</script>

<template>
  <section class="task-panel">
    <header class="task-head">
      <div class="task-title">
        <Icon name="check-circle" :size="18" />
        <h2>上传任务中心</h2>
      </div>
      <button
        class="refresh-btn"
        type="button"
        :title="refreshing ? '正在刷新…' : '刷新任务列表'"
        :disabled="refreshing"
        @click="emit('refresh')"
      >
        <Icon name="refresh" :size="14" :class="{ spinning: refreshing }" />
      </button>
    </header>

    <!-- 顶部汇总统计条 -->
    <div class="task-summary-bar">
      <span class="summary-chip queued">排队 <strong>{{ summary.queued }}</strong></span>
      <span class="summary-sep">·</span>
      <span class="summary-chip processing">处理中 <strong>{{ summary.processing + summary.cancelRequested }}</strong></span>
      <span class="summary-sep">·</span>
      <span class="summary-chip succeeded">已完成 <strong>{{ summary.succeeded }}</strong></span>
      <span v-if="summary.failed > 0" class="summary-sep">·</span>
      <span v-if="summary.failed > 0" class="summary-chip failed">失败 <strong>{{ summary.failed }}</strong></span>
      <span v-if="summary.cancelled > 0" class="summary-sep">·</span>
      <span v-if="summary.cancelled > 0" class="summary-chip cancelled">已取消 <strong>{{ summary.cancelled }}</strong></span>
    </div>

    <!-- 筛选过滤 Tabs -->
    <div class="task-filter-chips">
      <button
        class="filter-chip"
        :class="{ active: filter === 'ALL' }"
        type="button"
        @click="emit('update:filter', 'ALL')"
      >
        全部 ({{ tasks.length }})
      </button>
      <button
        class="filter-chip"
        :class="{ active: filter === 'ACTIVE' }"
        type="button"
        @click="emit('update:filter', 'ACTIVE')"
      >
        进行中 ({{ readyTasks.length + processingTasks.length }})
      </button>
      <button
        class="filter-chip"
        :class="{ active: filter === 'FAILED' }"
        type="button"
        @click="emit('update:filter', 'FAILED')"
      >
        失败 ({{ failedTasks.length }})
      </button>
      <button
        class="filter-chip"
        :class="{ active: filter === 'COMPLETED' }"
        type="button"
        @click="emit('update:filter', 'COMPLETED')"
      >
        已完成 ({{ succeededOrCancelledTasks.length }})
      </button>
    </div>

    <div v-if="loading && !tasks.length" class="task-empty">正在同步任务队列…</div>
    <div v-else-if="error" class="task-empty error-state">
      <p>{{ error.message }}</p>
      <button class="pause-btn" type="button" @click="emit('refresh')">重试</button>
    </div>
    <div v-else-if="!tasks.length" class="task-empty">还没有上传任务。把照片拖到左侧即可开始。</div>

    <div v-else class="task-groups">
      <!-- 排队中 -->
      <section v-if="showReady && readyTasks.length" class="task-group">
        <h3>排队中 · {{ readyTasks.length }}</h3>
        <div v-for="task in readyTasks" :key="task.id" class="task-item">
          <img v-if="task.thumbnailUrl || task.photoThumbnailUrl" :src="task.thumbnailUrl || task.photoThumbnailUrl || undefined" class="thumb" />
          <div v-else class="thumb-fallback"><Icon name="photo" :size="14" /></div>
          <div class="task-copy">
            <strong>{{ fileLabel(task) }}</strong>
            <span>{{ statusCopy(task) }}</span>
          </div>
          <span class="ready-tag">排队</span>
          <button v-if="canWrite" class="icon-x" type="button" title="取消任务" @click="emit('cancel', task)">
            <Icon name="x" :size="14" />
          </button>
        </div>
      </section>

      <!-- 处理中 -->
      <section v-if="showProcessing && processingTasks.length" class="task-group">
        <h3>处理中 · {{ processingTasks.length }}</h3>
        <div v-for="task in processingTasks" :key="task.id" class="task-item processing">
          <img v-if="task.thumbnailUrl || task.photoThumbnailUrl" :src="task.thumbnailUrl || task.photoThumbnailUrl || undefined" class="thumb" />
          <div v-else class="thumb-fallback"><Icon name="photo" :size="14" /></div>
          <div class="task-copy">
            <strong>{{ fileLabel(task) }}</strong>
            <div class="bar"><div class="fill" :style="{ width: `${task.progress || 0}%` }"></div></div>
          </div>
          <span v-if="task.status === 'CANCEL_REQUESTED'" class="cancelling-tag">正在取消</span>
          <span v-else class="pct">{{ task.progress || 0 }}%</span>
          <button
            v-if="canWrite && task.status !== 'CANCEL_REQUESTED'"
            class="icon-x"
            type="button"
            title="取消任务"
            @click="emit('cancel', task)"
          >
            <Icon name="pause" :size="14" />
          </button>
        </div>
      </section>

      <!-- 仅失败筛选视图 -->
      <section v-if="showFailedOnly" class="task-group">
        <h3 class="failed-header">失败任务 · {{ failedTasks.length }}</h3>
        <p v-if="!failedTasks.length" class="group-empty">没有失败的任务。</p>
        <div v-for="task in failedTasks" :key="task.id" class="task-item failed">
          <div class="thumb-fallback failed-thumb"><Icon name="x" :size="14" /></div>
          <div class="task-copy">
            <strong>{{ fileLabel(task) }}</strong>
            <span class="error-msg">{{ task.errorMessage || '处理失败' }}</span>
            <div v-if="task.requestId" class="request-id-row">
              <span class="req-id">ID: {{ task.requestId }}</span>
              <button class="copy-req-btn" type="button" @click="copyRequestId(task.requestId)">
                {{ copiedRequestId === task.requestId ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
          <button
            v-if="canWrite && task.retryable"
            class="retry-btn"
            type="button"
            title="重试任务"
            @click="emit('retry', task)"
          >
            <Icon name="refresh" :size="13" />
            <span>重试</span>
          </button>
        </div>
      </section>

      <!-- 已完成折叠区（在全部或已完成模式） -->
      <section v-if="showCompleted && completedTasks.length" class="task-group">
        <button class="collapse" type="button" @click="completedOpen = !completedOpen">
          <span>已结束 · {{ completedTasks.length }}</span>
          <Icon name="chevron-down" :size="14" :class="{ rotated: !completedOpen }" />
        </button>
        <div v-if="completedOpen" class="completed-list">
          <div v-for="task in (filter === 'COMPLETED' ? succeededOrCancelledTasks : completedTasks)" :key="task.id" class="task-item">
            <div v-if="task.status === 'SUCCEEDED'" class="thumb-fallback success-thumb">
              <Icon name="check" :size="14" />
            </div>
            <div v-else-if="task.status === 'CANCELLED'" class="thumb-fallback cancelled-thumb">
              <Icon name="x" :size="14" />
            </div>
            <div v-else class="thumb-fallback failed-thumb">
              <Icon name="x" :size="14" />
            </div>
            <div class="task-copy">
              <strong>{{ fileLabel(task) }}</strong>
              <span :class="{ 'error-msg': task.status === 'FAILED' }">{{ statusCopy(task) }}</span>
              <div v-if="task.status === 'FAILED' && task.requestId" class="request-id-row">
                <span class="req-id">ID: {{ task.requestId }}</span>
                <button class="copy-req-btn" type="button" @click="copyRequestId(task.requestId)">
                  {{ copiedRequestId === task.requestId ? '已复制' : '复制' }}
                </button>
              </div>
            </div>
            <button
              v-if="canWrite && task.status === 'FAILED' && task.retryable"
              class="retry-btn"
              type="button"
              title="重试任务"
              @click="emit('retry', task)"
            >
              <Icon name="refresh" :size="13" />
              <span>重试</span>
            </button>
          </div>
        </div>
      </section>
    </div>

    <aside class="tip-box">
      <Icon name="leaf" :size="16" />
      <div>
        <strong>提示</strong>
        <p>上传完成后，系统将自动优化图片质量，为您的展厅带来更好的浏览体验。</p>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #00b88f;
}

.task-title h2 {
  font-size: 15px;
  font-weight: 750;
  color: #111827;
  margin: 0;
}

.refresh-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f3f4f6;
  color: #6b7280;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: #e5e7eb;
  color: #111827;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.task-summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 11px;
  color: #64748b;
}

.summary-chip strong {
  color: #0f172a;
  font-weight: 700;
}

.summary-chip.queued strong { color: #0284c7; }
.summary-chip.processing strong { color: #00b88f; }
.summary-chip.succeeded strong { color: #059669; }
.summary-chip.failed strong { color: #dc2626; }
.summary-chip.cancelled strong { color: #64748b; }

.summary-sep {
  color: #cbd5e1;
}

.task-filter-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.filter-chip {
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.filter-chip:hover {
  border-color: #00b88f;
  color: #00b88f;
}

.filter-chip.active {
  background: #ecfdf5;
  border-color: #00b88f;
  color: #00b88f;
  font-weight: 700;
}

.task-empty {
  font-size: 13px;
  color: #9ca3af;
  padding: 12px 0;
  text-align: center;
}

.task-empty.error-state {
  color: #dc2626;
}

.group-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px 0;
}

.task-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.task-group h3,
.collapse {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  color: #6b7280;
  margin-bottom: 8px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.task-group h3.failed-header {
  color: #dc2626;
}

.collapse .rotated {
  transform: rotate(-90deg);
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}

.task-item:last-child {
  border-bottom: none;
}

.thumb,
.thumb-fallback {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
  background: #ecfdf5;
  color: #00b88f;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.thumb-fallback.success-thumb {
  background: #ecfdf5;
  color: #00b88f;
}

.thumb-fallback.failed-thumb {
  background: #fef2f2;
  color: #dc2626;
}

.thumb-fallback.cancelled-thumb {
  background: #f3f4f6;
  color: #9ca3af;
}

.task-copy {
  flex: 1;
  min-width: 0;
}

.task-copy strong {
  display: block;
  font-size: 12px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-copy span {
  font-size: 11px;
  color: #9ca3af;
}

.task-copy span.error-msg {
  color: #dc2626;
}

.request-id-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.req-id {
  font-family: monospace;
  font-size: 10px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.copy-req-btn {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
}

.ready-tag {
  font-size: 10px;
  font-weight: 750;
  color: #00b88f;
  background: #ecfdf5;
  padding: 2px 6px;
  border-radius: 999px;
  white-space: nowrap;
}

.cancelling-tag {
  font-size: 10px;
  font-weight: 750;
  color: #f59e0b;
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 999px;
  white-space: nowrap;
}

.pct {
  font-size: 11px;
  font-weight: 700;
  color: #00b88f;
}

.bar {
  height: 5px;
  margin-top: 6px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: #00b88f;
  transition: width 0.3s ease;
}

.icon-x {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: #9ca3af;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
}

.icon-x:hover {
  background: #f3f4f6;
  color: #ef4444;
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #dc2626;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.retry-btn:hover {
  background: #fee2e2;
}

.pause-btn {
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 650;
  color: #00b88f;
  background: #ecfdf5;
  border: none;
  cursor: pointer;
}

.tip-box {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: #ecfdf5;
  color: #047857;
}

.tip-box strong {
  display: block;
  font-size: 12px;
  margin-bottom: 2px;
}

.tip-box p {
  font-size: 12px;
  line-height: 1.5;
  color: #4b5563;
  margin: 0;
}
</style>
