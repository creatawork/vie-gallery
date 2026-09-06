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

const statusLabel = (status: Gallery['status']) => ({ DRAFT: '草稿', PUBLISHED: '已发布', ARCHIVED: '已归档' }[status] || status)
const statusClass = (status: Gallery['status']) => ({ DRAFT: 'badge-draft', PUBLISHED: 'badge-published', ARCHIVED: 'badge-archived' }[status] || 'badge-private')
const publishedDate = (value?: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : ''
</script>

<template>
  <header class="workspace-header">
    <div class="workspace-heading">
      <div class="workspace-heading-row">
        <h1>{{ gallery.name }}</h1>
        <span class="badge" :class="gallery.visibility === 'PUBLIC' ? 'badge-public' : 'badge-private'">
          <Icon :name="gallery.visibility === 'PUBLIC' ? 'globe' : 'lock'" :size="12" />
          <span>{{ gallery.visibility === 'PUBLIC' ? '公开' : '私密' }}</span>
        </span>
        <span class="badge" :class="statusClass(gallery.status)">
          <Icon :name="gallery.status === 'PUBLISHED' ? 'check' : gallery.status === 'DRAFT' ? 'alert-circle' : 'lock'" :size="12" />
          <span>{{ statusLabel(gallery.status) }}</span>
        </span>
      </div>
      <div class="workspace-meta">
        <code>/g/{{ gallery.slug }}</code>
        <span aria-hidden="true">·</span>
        <span>{{ photoCount }} 张照片</span>
        <span v-if="gallery.status === 'PUBLISHED' && gallery.publishedAt" aria-hidden="true">·</span>
        <span v-if="gallery.status === 'PUBLISHED' && gallery.publishedAt">发布于 {{ publishedDate(gallery.publishedAt) }}</span>
      </div>
      <p class="visitor-note" :class="{ 'is-live': gallery.status === 'PUBLISHED' }">
        <Icon :name="gallery.status === 'PUBLISHED' ? 'globe' : 'lock'" :size="14" />
        {{ gallery.status === 'PUBLISHED' ? '访客可以访问此空间' : '访客暂不可访问此空间' }}
      </p>
    </div>

    <div class="workspace-actions" aria-label="空间操作">
      <button v-if="props.canConfig" class="btn btn-secondary" type="button" @click="$emit('config')">
        <Icon name="sliders" :size="16" />
        <span>3D 视觉配置</span>
      </button>
      <button v-if="props.canShare" class="btn btn-secondary" type="button" :disabled="gallery.status !== 'PUBLISHED'" :title="gallery.status === 'PUBLISHED' ? '管理分享链接' : '发布后才能创建分享链接'" @click="$emit('share')">
        <Icon name="share" :size="16" />
        <span>分享链接</span>
      </button>
      <button v-if="gallery.status === 'DRAFT' && props.canPublish" class="btn btn-publish" type="button" :disabled="props.publishing" @click="$emit('publish')">
        <Icon v-if="props.publishing" name="refresh" :size="16" class="spin" />
        <Icon v-else name="check" :size="16" />
        <span>{{ props.publishing ? '发布中…' : '发布空间' }}</span>
      </button>
      <button v-else-if="gallery.status === 'PUBLISHED' && props.canPublish" class="btn btn-secondary" type="button" :disabled="props.publishing" @click="$emit('unpublish')">
        <Icon v-if="props.publishing" name="refresh" :size="16" class="spin" />
        <Icon v-else name="lock" :size="16" />
        <span>{{ props.publishing ? '撤回中…' : '撤回发布' }}</span>
      </button>
      <button class="btn btn-primary" type="button" :disabled="gallery.status !== 'PUBLISHED'" :title="gallery.status === 'PUBLISHED' ? '在访客端预览' : '发布后才能预览访客页面'" @click="$emit('preview')">
        <Icon name="external" :size="16" />
        <span>预览空间</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.workspace-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  padding: 10px 0 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.workspace-heading {
  min-width: 0;
}

.workspace-heading-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.workspace-heading h1 {
  max-width: 720px;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: clamp(26px, 4vw, 38px);
  font-weight: 750;
  letter-spacing: -0.045em;
  line-height: 1.15;
}

.workspace-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.workspace-meta code {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--brand-deep, #087a5c);
  font-family: var(--font-mono);
}

.visitor-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 13px;
  color: #9a6700;
  font-size: 12px;
  font-weight: 650;
}

.visitor-note.is-live { color: #047857; }
.badge-draft { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; }
.badge-published { color: #047857; background: var(--brand-accent-subtle); border: 1px solid rgba(16, 185, 129, 0.25); }
.badge-archived { color: #475569; background: #f1f5f9; border: 1px solid #cbd5e1; }

.btn-publish {
  color: #ffffff;
  background: linear-gradient(135deg, #0f766e, #059669);
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.24);
}

.btn-publish:hover:not(:disabled) { transform: translateY(-2px); }

.workspace-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.workspace-actions .btn {
  min-height: 40px;
}

@media (max-width: 767px) {
  .workspace-header {
    display: block;
    padding-bottom: 20px;
  }

  .workspace-actions {
    display: grid;
    grid-template-columns: 1fr;
    margin-top: 18px;
  }

  .workspace-actions .btn {
    width: 100%;
  }
}
</style>
