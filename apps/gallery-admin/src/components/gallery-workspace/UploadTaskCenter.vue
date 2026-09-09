<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '../Icon.vue'
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
  (event: 'pause-all'): void
}>()

const completedOpen = ref(false)

const readyTasks = computed(() => props.tasks.filter(t => t.status === 'QUEUED'))
const processingTasks = computed(() => props.tasks.filter(t => t.status === 'PROCESSING' || t.status === 'CANCEL_REQUESTED'))
const completedTasks = computed(() => props.tasks.filter(t => t.status === 'SUCCEEDED' || t.status === 'CANCELLED' || t.status === 'FAILED'))

function fileLabel(task: UploadTask) {
  return task.filename || '未命名文件'
}

function formatSize() {
  return 'JPG · 2.4MB'
}
</script>

<template>
  <section class="task-panel">
    <header class="task-head">
      <div class="task-title">
        <Icon name="check-circle" :size="18" />
        <h2>上传任务中心</h2>
      </div>
      <button class="pause-btn" type="button" @click="emit('pause-all')">全部暂停</button>
    </header>

    <div v-if="loading && !tasks.length" class="task-empty">正在同步任务队列…</div>
    <div v-else-if="error" class="task-empty">{{ error.message }}</div>
    <div v-else-if="!tasks.length" class="task-empty">暂无上传任务</div>

    <div v-else class="task-groups">
      <section v-if="readyTasks.length" class="task-group">
        <h3>准备中 (READY) · {{ readyTasks.length }}</h3>
        <div v-for="task in readyTasks" :key="task.id" class="task-item">
          <img v-if="task.thumbnailUrl || task.photoThumbnailUrl" :src="task.thumbnailUrl || task.photoThumbnailUrl || undefined" class="thumb" />
          <div v-else class="thumb-fallback"><Icon name="photo" :size="14" /></div>
          <div class="task-copy">
            <strong>{{ fileLabel(task) }}</strong>
            <span>{{ formatSize() }}</span>
          </div>
          <span class="ready-tag">READY</span>
          <button v-if="canWrite" class="icon-x" type="button" @click="emit('cancel', task)">
            <Icon name="x" :size="14" />
          </button>
        </div>
      </section>

      <section v-if="processingTasks.length" class="task-group">
        <h3>处理中 (PROCESSING) · {{ processingTasks.length }}</h3>
        <div v-for="task in processingTasks" :key="task.id" class="task-item processing">
          <img v-if="task.thumbnailUrl || task.photoThumbnailUrl" :src="task.thumbnailUrl || task.photoThumbnailUrl || undefined" class="thumb" />
          <div v-else class="thumb-fallback"><Icon name="photo" :size="14" /></div>
          <div class="task-copy">
            <strong>{{ fileLabel(task) }}</strong>
            <div class="bar"><div class="fill" :style="{ width: `${task.progress || 32}%` }"></div></div>
          </div>
          <span class="pct">{{ task.progress || 32 }}%</span>
          <button v-if="canWrite" class="icon-x" type="button" @click="emit('cancel', task)">
            <Icon name="pause" :size="14" />
          </button>
        </div>
      </section>

      <section v-if="completedTasks.length" class="task-group">
        <button class="collapse" type="button" @click="completedOpen = !completedOpen">
          <span>已完成 (COMPLETED) · {{ completedTasks.length }}</span>
          <Icon name="chevron-down" :size="14" />
        </button>
        <div v-if="completedOpen">
          <div v-for="task in completedTasks" :key="task.id" class="task-item">
            <div class="thumb-fallback"><Icon name="check" :size="14" /></div>
            <div class="task-copy">
              <strong>{{ fileLabel(task) }}</strong>
              <span>{{ task.status === 'FAILED' ? '失败' : '已完成' }}</span>
            </div>
            <button v-if="canWrite && task.status === 'FAILED'" class="icon-x" type="button" @click="emit('retry', task)">
              <Icon name="refresh" :size="14" />
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
  gap: 16px;
  padding: 20px 18px 18px;
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
}

.pause-btn {
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 650;
  color: #00b88f;
  background: #ecfdf5;
}

.task-empty {
  font-size: 13px;
  color: #9ca3af;
  padding: 12px 0;
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
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
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

.ready-tag {
  font-size: 10px;
  font-weight: 750;
  color: #00b88f;
  background: #ecfdf5;
  padding: 2px 6px;
  border-radius: 999px;
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
}

.icon-x {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  color: #9ca3af;
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
}
</style>
