<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'
import type { Gallery, PublishReadinessResponse } from '@vie/gallery-contracts'

const props = withDefaults(defineProps<{
  gallery: Gallery | null
  readiness: PublishReadinessResponse | null
  loading?: boolean
  publishing?: boolean
  unpublishing?: boolean
  canPublish?: boolean
  canConfig?: boolean
  isOwner?: boolean
}>(), {
  loading: false,
  publishing: false,
  unpublishing: false,
  canPublish: false,
  canConfig: false,
  isOwner: false
})

const emit = defineEmits<{
  (event: 'publish'): void
  (event: 'unpublish'): void
  (event: 'preview'): void
  (event: 'openConfig'): void
  (event: 'refresh'): void
}>()

const isPublished = computed(() => props.gallery?.status === 'PUBLISHED')
const hasBlockers = computed(() => (props.readiness?.blockers.length ?? 0) > 0)
const hasChangesToPublish = computed(() => {
  if (!props.gallery) return false
  if (props.gallery.status !== 'PUBLISHED') return true
  return !!props.readiness?.configDraftChanged
})

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
</script>

<template>
  <div class="publish-center">
    <div class="publish-header">
      <div class="header-title">
        <Icon name="send" :size="18" />
        <h3>发布中心</h3>
      </div>
      <button
        class="refresh-btn"
        type="button"
        title="刷新状态"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <Icon name="refresh" :size="14" :class="{ spinning: loading }" />
      </button>
    </div>

    <!-- 1. 访客当前看到 -->
    <section class="section-card visitor-section">
      <h4>访客当前看到</h4>
      <div class="status-badge-row">
        <span class="status-pill" :class="isPublished ? 'is-published' : 'is-draft'">
          <span class="dot"></span>
          {{ isPublished ? '已发布至访客' : '草稿状态（访客不可见）' }}
        </span>
        <span v-if="gallery" class="vis-pill" :class="gallery.visibility === 'PUBLIC' ? 'is-public' : 'is-private'">
          {{ gallery.visibility === 'PUBLIC' ? '公开访问' : '需要密码/分享凭证' }}
        </span>
      </div>

      <div class="meta-details">
        <div v-if="isPublished && readiness?.publishedAt" class="meta-row">
          <span class="meta-label">发布时间：</span>
          <span class="meta-val">{{ formatDateTime(readiness.publishedAt) }}</span>
        </div>
        <div v-if="readiness?.publishedConfigVersionId" class="meta-row">
          <span class="meta-label">已生效配置版本：</span>
          <span class="meta-val code">{{ readiness.publishedConfigVersionId.slice(0, 8) }}…</span>
        </div>
      </div>

      <div class="visitor-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="emit('preview')">
          <Icon name="eye" :size="14" />
          <span>内部完整预览</span>
        </button>
      </div>
    </section>

    <!-- 2. 待发布变更与检查 -->
    <section class="section-card changes-section">
      <h4>待发布变更与就绪检查</h4>
      
      <div v-if="hasBlockers" class="blockers-list">
        <div v-for="blocker in readiness?.blockers" :key="blocker.code" class="blocker-item">
          <Icon name="alert-circle" :size="16" class="blocker-icon" />
          <span>{{ blocker.message }}</span>
        </div>
      </div>

      <div v-else-if="!hasChangesToPublish" class="no-changes">
        <Icon name="check" :size="16" class="check-icon" />
        <span>当前展厅与配置均已同步至最新，无待发布变更。</span>
      </div>

      <div v-else class="pending-changes-list">
        <div v-if="!isPublished" class="change-item">
          <span class="change-dot"></span>
          <span>展厅尚未发布（包含 {{ readiness?.readyPhotoCount ?? 0 }} 张就绪照片）</span>
        </div>
        <div v-if="readiness?.configDraftChanged" class="change-item">
          <span class="change-dot warn"></span>
          <span>3D/氛围配置有草稿修改尚未同步给访客</span>
        </div>
      </div>
    </section>

    <!-- 3. 操作区 -->
    <section class="publish-actions-section">
      <div class="actions-row">
        <button
          v-if="canPublish"
          class="btn btn-primary"
          type="button"
          :disabled="hasBlockers || publishing || (!hasChangesToPublish && isPublished)"
          @click="emit('publish')"
        >
          <Icon v-if="publishing" name="refresh" :size="15" class="spinning" />
          <Icon v-else name="send" :size="15" />
          <span>{{ publishing ? '正在发布…' : (isPublished ? '同步最新变更到访客' : '一键发布展厅') }}</span>
        </button>

        <button
          v-if="canPublish && isOwner && isPublished"
          class="btn btn-danger-outline"
          type="button"
          :disabled="unpublishing || publishing"
          @click="emit('unpublish')"
        >
          <Icon v-if="unpublishing" name="refresh" :size="15" class="spinning" />
          <span>{{ unpublishing ? '正在撤回…' : '撤回发布' }}</span>
        </button>

        <button
          v-if="canConfig"
          class="btn btn-outline-secondary"
          type="button"
          @click="emit('openConfig')"
        >
          <Icon name="settings" :size="14" />
          <span>配置与版本</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.publish-center {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 28px rgba(15, 40, 28, 0.06);
}

.publish-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #00b88f;
}

.header-title h3 {
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
}

.refresh-btn:hover:not(:disabled) {
  background: #e5e7eb;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.section-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.section-card h4 {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
}

.status-pill.is-published {
  background: #ecfdf5;
  color: #047857;
}

.status-pill.is-draft {
  background: #fef3c7;
  color: #b45309;
}

.status-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.vis-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.vis-pill.is-public {
  background: #f0fdf4;
  color: #16a34a;
}

.vis-pill.is-private {
  background: #f1f5f9;
  color: #475569;
}

.meta-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-val.code {
  font-family: monospace;
  font-weight: 600;
  color: #0f172a;
}

.visitor-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.blockers-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.blocker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #fef2f2;
  border: 1px solid #fee2e2;
  border-radius: 8px;
  color: #dc2626;
  font-size: 12px;
}

.blocker-icon {
  flex-shrink: 0;
}

.no-changes {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #059669;
  font-size: 12px;
  padding: 4px 0;
}

.check-icon {
  color: #059669;
}

.pending-changes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #334155;
}

.change-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.change-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00b88f;
  flex-shrink: 0;
}

.change-dot.warn {
  background: #f59e0b;
}

.publish-actions-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.btn-primary {
  background: #00b88f;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #00a67f;
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-danger-outline {
  background: #fff;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.btn-danger-outline:hover:not(:disabled) {
  background: #fef2f2;
}

.btn-outline-secondary {
  background: #fff;
  border: 1px solid #e2e8f0;
  color: #475569;
}

.btn-outline-secondary:hover {
  background: #f8fafc;
  color: #0f172a;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}
</style>
