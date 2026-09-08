<script setup lang="ts">
import type { Gallery } from '@vie/gallery-contracts'
import Icon from '../Icon.vue'

const props = defineProps<{
  gallery: Gallery
  photoCount: number
  publishing?: boolean
  canConfig?: boolean
  canShare?: boolean
  canPublish?: boolean
}>()

defineEmits<{
  (event: 'config'): void
  (event: 'share'): void
  (event: 'preview'): void
  (event: 'publish'): void
  (event: 'unpublish'): void
}>()

const statusLabel = (status: Gallery['status']) => ({ DRAFT: '草稿模式', PUBLISHED: '已发布', ARCHIVED: '已归档' }[status] || status)
const statusClass = (status: Gallery['status']) => ({ DRAFT: 'badge-draft', PUBLISHED: 'badge-published', ARCHIVED: 'badge-archived' }[status] || 'badge-private')
const publishedDate = (value?: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : ''
</script>

<template>
  <header class="workspace-header">
    <div class="workspace-heading">
      <div class="workspace-heading-row">
        <h1 class="gallery-title">{{ gallery.name }}</h1>
        <div class="header-badges-cluster">
          <span class="badge" :class="gallery.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'">
            <Icon :name="gallery.visibility === 'PUBLIC' ? 'globe' : 'lock'" :size="12" />
            <span>{{ gallery.visibility === 'PUBLIC' ? '公开展示' : '私密相册' }}</span>
          </span>
          <span class="badge" :class="statusClass(gallery.status)">
            <Icon :name="gallery.status === 'PUBLISHED' ? 'check' : gallery.status === 'DRAFT' ? 'alert-circle' : 'lock'" :size="12" />
            <span>{{ statusLabel(gallery.status) }}</span>
          </span>
        </div>
      </div>

      <div class="workspace-meta">
        <code class="slug-pill">/g/{{ gallery.slug }}</code>
        <span class="meta-dot" aria-hidden="true">·</span>
        <span class="meta-item"><Icon name="photo" :size="13" /> {{ photoCount }} 张照片素材</span>
        <span v-if="gallery.status === 'PUBLISHED' && gallery.publishedAt" class="meta-dot" aria-hidden="true">·</span>
        <span v-if="gallery.status === 'PUBLISHED' && gallery.publishedAt" class="meta-item">
          <Icon name="clock" :size="13" /> 发布于 {{ publishedDate(gallery.publishedAt) }}
        </span>
        <span class="meta-dot" aria-hidden="true">·</span>
        <span class="sync-status-indicator" :class="{ 'is-live': gallery.status === 'PUBLISHED' }">
          <span class="pulse-dot-sm"></span>
          {{ gallery.status === 'PUBLISHED' ? '3D 云展厅运行中' : '草稿编辑就绪' }}
        </span>
      </div>
    </div>

    <div class="workspace-actions" aria-label="空间操作">
      <button
        v-if="props.canConfig"
        class="btn btn-secondary action-pill-btn"
        type="button"
        title="配置 3D 布局、星空粒子与特效"
        @click="$emit('config')"
      >
        <Icon name="sliders" :size="15" />
        <span>3D 视觉配置</span>
      </button>

      <button
        v-if="props.canShare"
        class="btn btn-secondary action-pill-btn"
        type="button"
        :disabled="gallery.status !== 'PUBLISHED'"
        :title="gallery.status === 'PUBLISHED' ? '管理访客加密分享链接' : '发布后才能创建分享链接'"
        @click="$emit('share')"
      >
        <Icon name="share" :size="15" />
        <span>分享链接</span>
      </button>

      <button
        v-if="gallery.status === 'DRAFT' && props.canPublish"
        class="btn btn-publish"
        type="button"
        :disabled="props.publishing"
        @click="$emit('publish')"
      >
        <Icon v-if="props.publishing" name="refresh" :size="15" class="spin" />
        <Icon v-else name="check" :size="15" />
        <span>{{ props.publishing ? '发布中…' : '发布空间' }}</span>
      </button>

      <button
        v-else-if="gallery.status === 'PUBLISHED' && props.canPublish"
        class="btn btn-secondary action-pill-btn"
        type="button"
        :disabled="props.publishing"
        @click="$emit('unpublish')"
      >
        <Icon v-if="props.publishing" name="refresh" :size="15" class="spin" />
        <Icon v-else name="lock" :size="15" />
        <span>{{ props.publishing ? '撤回中…' : '撤回发布' }}</span>
      </button>

      <button
        class="btn btn-primary preview-cta-btn"
        type="button"
        :disabled="gallery.status !== 'PUBLISHED'"
        :title="gallery.status === 'PUBLISHED' ? '在 3D Viewer 中打开' : '空间发布后才能预览 3D 展厅'"
        @click="$emit('preview')"
      >
        <Icon name="external" :size="15" />
        <span>进入 3D 展厅</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.workspace-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px;
  margin-bottom: 22px;
  border-radius: 20px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  background: linear-gradient(145deg, #ffffff 0%, #fbfdfc 100%);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.workspace-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-heading-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.gallery-title {
  max-width: 640px;
  overflow-wrap: anywhere;
  color: #0f172a;
  font-size: clamp(22px, 2.5vw, 28px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.header-badges-cluster {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 700;
}

.badge-public {
  color: #2563eb;
  background: rgba(239, 246, 255, 0.9);
  border: 1px solid rgba(59, 130, 246, 0.25);
}

.badge-private {
  color: #475569;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.badge-draft {
  color: #92400e;
  background: rgba(255, 251, 235, 0.95);
  border: 1px solid #fde68a;
}

.badge-published {
  color: #047857;
  background: rgba(236, 253, 245, 0.95);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge-archived {
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
}

.workspace-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  color: #64748b;
  font-size: 13px;
}

.slug-pill {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: #059669;
  background: #ecfdf5;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  font-weight: 600;
}

.meta-dot {
  color: #cbd5e1;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #475569;
}

.sync-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
  color: #64748b;
}

.sync-status-indicator.is-live {
  color: #059669;
}

.pulse-dot-sm {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
}

.workspace-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.action-pill-btn {
  padding: 9px 15px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 11px;
}

.btn-publish {
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 11px;
  color: #ffffff;
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25);
  transition: all 0.2s ease;
}

.btn-publish:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(5, 150, 105, 0.35);
}

.preview-cta-btn {
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 11px;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.25);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .workspace-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .workspace-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
