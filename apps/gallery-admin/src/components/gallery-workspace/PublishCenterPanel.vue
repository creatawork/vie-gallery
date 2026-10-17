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
  canShare?: boolean
  isOwner?: boolean
  busy?: boolean
  error?: string | null
}>(), {
  loading: false,
  publishing: false,
  unpublishing: false,
  canPublish: false,
  canConfig: false,
  canShare: false,
  isOwner: false,
  busy: false,
  error: null
})

const emit = defineEmits<{
  (event: 'publish'): void
  (event: 'unpublish'): void
  (event: 'preview'): void
  (event: 'openConfig'): void
  (event: 'refresh'): void
  (event: 'openShare'): void
  (event: 'editMetadata'): void
}>()

const isPublished = computed(() => props.gallery?.status === 'PUBLISHED')
const readinessKnown = computed(() => !!props.readiness && !props.loading && !props.error)
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
        <h3>发布与分享</h3>
      </div>
      <button
        class="refresh-btn"
        type="button"
        title="刷新状态"
        aria-label="刷新发布状态"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <Icon name="refresh" :size="14" :class="{ spinning: loading }" />
      </button>
    </div>

    <!-- 1. 访客当前看到 -->
    <section class="section-card visitor-section">
      <h4>访客访问状态</h4>
      <div class="status-badge-row">
        <span class="status-pill" :class="isPublished ? 'is-published' : 'is-draft'">
          <span class="dot"></span>
          {{ isPublished ? '展厅已上线' : '草稿 · 尚未公开' }}
        </span>
        <span v-if="gallery" class="vis-pill" :class="gallery.visibility === 'PUBLIC' ? 'is-public' : 'is-private'">
          {{ gallery.visibility === 'PUBLIC' ? '公开访问' : gallery.visibility === 'PASSWORD' ? '凭密码进入' : '凭专属链接进入' }}
        </span>
      </div>

      <p v-if="readiness?.configDraftChanged" class="draft-hint">展示设计有待同步的更改。</p>
      <details class="publish-details">
      <summary>发布时间与配置</summary>
      <div class="meta-details">
        <div v-if="isPublished && readiness?.publishedAt" class="meta-row">
          <span class="meta-label">发布时间：</span>
          <span class="meta-val">{{ formatDateTime(readiness.publishedAt) }}</span>
        </div>
        <div v-if="readiness?.publishedConfigVersionId" class="meta-row">
          <span class="meta-label">场景配置</span>
          <span class="meta-val">已同步给访客</span>
        </div>
      </div>
      </details>
    </section>

    <!-- 2. 待发布变更与检查 -->
    <details class="section-card changes-section" :open="!isPublished || hasBlockers || !!error">
      <summary>发布前检查</summary>
      <p v-if="error" class="readiness-error" role="alert">{{ error }}<br />刷新状态后再试。</p>
      <p v-else-if="!readinessKnown" class="readiness-loading" role="status">{{ loading ? '正在检查照片与场景…' : '尚未确认发布状态，请刷新。' }}</p>
      
      <div v-else-if="hasBlockers" class="blockers-list">
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
          <span>{{ readiness?.readyPhotoCount ?? 0 }} 张照片已就绪</span>
        </div>
        <div v-if="readiness?.configDraftChanged" class="change-item">
          <span class="change-dot warn"></span>
          <span>展示风格将随本次发布一起生效</span>
        </div>
      </div>
    </details>

    <!-- 3. 操作区 -->
    <section class="publish-actions-section">
      <div class="actions-row">
        <button
          v-if="canPublish"
          class="btn btn-primary"
          type="button"
          :disabled="!readinessKnown || hasBlockers || busy || publishing || unpublishing || (!hasChangesToPublish && isPublished)"
          @click="emit('publish')"
        >
          <Icon v-if="publishing" name="refresh" :size="15" class="spinning" />
          <Icon v-else name="send" :size="15" />
          <span>{{ publishing ? '正在发布…' : (isPublished ? '同步最新变更到访客' : '发布展厅') }}</span>
        </button>

        <p v-if="busy" class="publish-helper" role="status">上传与风格载入、保存完成后，即可发布。</p>
        <button v-if="canPublish && readiness?.configDraftChanged" type="button" class="btn btn-outline-secondary" :disabled="!readinessKnown || busy || publishing" @click="emit('editMetadata')">添加版本说明</button>

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
          v-if="canShare"
          class="btn btn-outline-secondary"
          type="button"
          @click="emit('openShare')"
        >
          <Icon name="lock" :size="14" />
          <span>访问与分享设置</span>
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
  display:grid;
  gap:16px;
  padding:24px 20px;
  background:var(--bg-surface);
  border:1px solid var(--border-strong);
  border-radius:12px
}

.publish-header,.header-title {
  display:flex;
  align-items:center;
  gap:10px
}

.publish-header {
  justify-content:space-between
}

.header-title>svg {
  display:none
}

.publish-kicker {
  font-size:10px;
  letter-spacing:.12em;
  color:var(--brand-deep)
}

h3 {
  margin:0;
  font-size:21px;
  font-weight:650;
  letter-spacing:-.03em
}

h4 {
  font-size:12px;
  font-weight:600;
  color:var(--text-secondary);
  margin:0 0 12px
}

.refresh-btn {
  display:grid;
  place-items:center;
  width:36px;
  height:36px;
  border:1px solid var(--border-strong);
  border-radius:8px;
  color:var(--text-secondary);
  background:var(--bg-surface)
}

.section-card {
  padding:0;
  background:none;
  border:0;
  border-radius:0
}

.visitor-section {
  padding-bottom:0
}

.publish-details { margin-top:12px }
.publish-details summary,.changes-section summary { min-height:44px; padding:10px 0; cursor:pointer; font-size:14px; color:var(--text-primary) }
.changes-section[open] summary { margin-bottom:8px }
.draft-hint { margin-top:10px; color:var(--text-secondary); font-size:13px }

.status-badge-row {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px
}

.status-pill {
  display:inline-flex;
  align-items:center;
  gap:7px;
  font-size:13px;
  font-weight:600;
  color:var(--text-primary)
}

.status-pill .dot {
  width:7px;
  height:7px;
  border-radius:50%;
  background:#a09b87
}

.status-pill.is-published .dot {
  background:var(--brand-accent)
}

.vis-pill {
  padding:4px 7px;
  border-radius:5px;
  font-size:11px;
  background:var(--bg-app);
  color:var(--text-secondary)
}

.meta-details {
  display:grid;
  gap:8px;
  margin-top:14px;
  font-size:11px;
  color:var(--text-secondary)
}

.meta-row {
  display:flex;
  justify-content:space-between;
  gap:8px
}

.visitor-actions {
  margin-top:16px
}

.visitor-actions .btn {
  width:100%
}

.blockers-list,.pending-changes-list {
  display:grid;
  gap:12px
}

.blocker-item,.no-changes,.change-item {
  display:flex;
  align-items:flex-start;
  gap:8px;
  font-size:12px;
  line-height:1.65;
  color:var(--text-secondary)
}

.blocker-item {
  color:#a43730
}

.blocker-icon,.check-icon {
  flex-shrink:0;
  margin-top:2px
}

.no-changes,.check-icon {
  color:var(--brand-deep)
}

.change-dot {
  width:5px;
  height:5px;
  min-width:5px;
  margin-top:7px;
  border-radius:50%;
  background:var(--brand-accent)
}

.change-dot.warn {
  background:#9b701f
}

.readiness-error {
  color:#a43730;
  font-size:12px;
  line-height:1.7
}

.readiness-loading,.publish-helper {
  color:var(--text-secondary);
  font-size:12px;
  line-height:1.7
}

.publish-helper {
  width:100%;
  margin:0
}

.actions-row {
  display:grid;
  gap:9px
}

.btn {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  min-height:40px;
  padding:9px 12px;
  border-radius:8px;
  font-size:12px;
  font-weight:600;
  box-shadow:none;
  transition:background .18s,border-color .18s
}

.btn-primary {
  background:var(--brand-accent);
  color:white
}

.btn-primary:hover:not(:disabled) {
  background:var(--brand-deep);
  transform:none;
  box-shadow:none
}

.btn-secondary,.btn-outline-secondary {
  background:var(--bg-surface);
  border:1px solid var(--border-strong);
  color:var(--text-secondary)
}

.btn-secondary:hover,.btn-outline-secondary:hover {
  background:var(--mint-soft);
  color:var(--brand-deep)
}

.btn-danger-outline {
  background:none;
  color:#a43730;
  min-height:34px
}

.btn:disabled,.refresh-btn:disabled {
  opacity:.5;
  cursor:not-allowed
}

.btn:focus-visible,.refresh-btn:focus-visible {
  outline:2px solid var(--brand-accent);
  outline-offset:3px
}

.spinning {
  animation:publish-spin 1s linear infinite
}

@keyframes publish-spin {
  to {
    transform:rotate(360deg)
  }
}

@media(prefers-reduced-motion:reduce) {
  .spinning {
    animation:none
  }
  .btn {
    transition:none
  }
}
</style>
