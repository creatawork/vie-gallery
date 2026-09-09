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
  activeMode?: 'viewport' | 'material' | 'slices' | 'tasks'
  transformMode?: 'translate' | 'rotate' | 'scale'
  activeTasksCount?: number
}>()

const emit = defineEmits<{
  (event: 'config'): void
  (event: 'share'): void
  (event: 'preview'): void
  (event: 'publish'): void
  (event: 'unpublish'): void
  (event: 'back'): void
  (event: 'openUpload'): void
  (event: 'changeMode', mode: 'viewport' | 'material' | 'slices' | 'tasks'): void
  (event: 'changeTransformMode', mode: 'translate' | 'rotate' | 'scale'): void
}>()

const statusLabel = (status: Gallery['status']) => ({ DRAFT: '草稿模式', PUBLISHED: '已发布', ARCHIVED: '已归档' }[status] || status)
const statusClass = (status: Gallery['status']) => ({ DRAFT: 'badge-draft', PUBLISHED: 'badge-published', ARCHIVED: 'badge-archived' }[status] || 'badge-private')
const publishedDate = (value?: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '2024-03-15'
</script>

<template>
  <header class="workspace-header">
    <!-- Top Row: Back + Title + Badges + Mode Switcher + Gizmos + Action Buttons -->
    <div class="header-main-bar">
      <!-- Left: Title & Status Cluster -->
      <div class="workspace-heading">
        <div class="workspace-heading-row">
          <button class="back-link-btn" type="button" title="返回相册列表" @click="$emit('back')">
            <span class="back-arrow">←</span>
            <span>3D 云展厅</span>
          </button>
          <span class="title-sep">/</span>
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
          <span v-if="gallery.status === 'PUBLISHED'" class="meta-dot" aria-hidden="true">·</span>
          <span v-if="gallery.status === 'PUBLISHED'" class="meta-item">
            <Icon name="clock" :size="13" /> 发布于 {{ publishedDate(gallery.publishedAt) }}
          </span>
          <span class="meta-dot" aria-hidden="true">·</span>
          <span class="sync-status-indicator" :class="{ 'is-live': gallery.status === 'PUBLISHED' }">
            <span class="pulse-dot-sm"></span>
            {{ gallery.status === 'PUBLISHED' ? '3D 云展厅运行中' : '草稿编辑就绪' }}
          </span>
        </div>
      </div>

      <!-- Center: Studio Mode Switcher Tabs -->
      <div class="studio-mode-switcher" aria-label="工作台模式切换">
        <button
          class="mode-tab-btn"
          :class="{ active: (activeMode || 'viewport') === 'viewport' }"
          type="button"
          @click="$emit('changeMode', 'viewport')"
        >
          <span class="mode-icon">🧊</span>
          <span>3D 视图 / 场景编辑</span>
        </button>

        <button
          class="mode-tab-btn"
          :class="{ active: activeMode === 'material' }"
          type="button"
          @click="$emit('changeMode', 'material')"
        >
          <span class="mode-icon">🎨</span>
          <span>材质资产 / PBR</span>
        </button>

        <button
          class="mode-tab-btn"
          :class="{ active: activeMode === 'slices' }"
          type="button"
          @click="$emit('changeMode', 'slices')"
        >
          <span class="mode-icon">📑</span>
          <span>版本切片 / Slices</span>
        </button>

        <button
          class="mode-tab-btn"
          :class="{ active: activeMode === 'tasks' }"
          type="button"
          @click="$emit('changeMode', 'tasks')"
        >
          <span class="mode-icon">⚡</span>
          <span>任务中心 / Tasks</span>
          <span v-if="activeTasksCount && activeTasksCount > 0" class="task-count-pill">
            {{ activeTasksCount }}
          </span>
        </button>
      </div>

      <!-- Right: Transform Gizmos + Actions Cluster -->
      <div class="workspace-actions" aria-label="空间操作">
        <!-- Transform Mode Buttons [W, E, R] -->
        <div class="gizmo-mode-group">
          <button
            class="gizmo-btn"
            :class="{ active: (transformMode || 'translate') === 'translate' }"
            type="button"
            title="移动变换 (快捷键 W)"
            @click="$emit('changeTransformMode', 'translate')"
          >
            <span>W</span>
          </button>
          <button
            class="gizmo-btn"
            :class="{ active: transformMode === 'rotate' }"
            type="button"
            title="旋转变换 (快捷键 E)"
            @click="$emit('changeTransformMode', 'rotate')"
          >
            <span>E</span>
          </button>
          <button
            class="gizmo-btn"
            :class="{ active: transformMode === 'scale' }"
            type="button"
            title="缩放变换 (快捷键 R)"
            @click="$emit('changeTransformMode', 'scale')"
          >
            <span>R</span>
          </button>
        </div>

        <!-- Telemetry Pill -->
        <div class="webgl-indicator-pill">
          <span class="webgl-glow-dot"></span>
          <span>WebGL 2.0</span>
        </div>

        <button
          v-if="props.canShare"
          class="btn btn-secondary action-pill-btn"
          type="button"
          :disabled="gallery.status !== 'PUBLISHED'"
          :title="gallery.status === 'PUBLISHED' ? '管理访客加密分享链接' : '发布后才能创建分享链接'"
          @click="$emit('share')"
        >
          <Icon name="share" :size="14" />
          <span>分享链接</span>
        </button>

        <button
          class="btn btn-secondary action-pill-btn"
          type="button"
          title="上传资产与纹理"
          @click="$emit('openUpload')"
        >
          <span class="upload-icon">📤</span>
          <span>上传资产</span>
        </button>

        <button
          v-if="gallery.status === 'DRAFT' && props.canPublish"
          class="btn btn-publish"
          type="button"
          :disabled="props.publishing"
          @click="$emit('publish')"
        >
          <Icon v-if="props.publishing" name="refresh" :size="14" class="spin" />
          <Icon v-else name="check" :size="14" />
          <span>{{ props.publishing ? '发布中…' : '发布空间' }}</span>
        </button>

        <button
          class="btn btn-primary preview-cta-btn"
          type="button"
          :disabled="gallery.status !== 'PUBLISHED'"
          :title="gallery.status === 'PUBLISHED' ? '在 3D Viewer 中打开' : '空间发布后才能预览 3D 展厅'"
          @click="$emit('preview')"
        >
          <Icon name="external" :size="14" />
          <span>进入 3D 展厅</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.workspace-header {
  margin-bottom: 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 20px rgba(0, 229, 255, 0.05);
  padding: 14px 20px;
}

.header-main-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.workspace-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-heading-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.back-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: color 0.2s ease;
  padding: 0;
}

.back-link-btn:hover {
  color: #00e5ff;
}

.back-arrow {
  font-size: 14px;
}

.title-sep {
  color: #475569;
  font-size: 14px;
}

.gallery-title {
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f8fafc;
  font-size: clamp(16px, 1.8vw, 20px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}

.header-badges-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
}

.badge-public {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.badge-private {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.badge-draft {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-published {
  color: #10b981;
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.workspace-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.slug-pill {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.meta-dot {
  color: #475569;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sync-status-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #64748b;
  font-weight: 600;
}

.sync-status-indicator.is-live {
  color: #10b981;
}

.pulse-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748b;
}

.sync-status-indicator.is-live .pulse-dot-sm {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

/* Center: Mode Switcher */
.studio-mode-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(2, 6, 23, 0.6);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12.5px;
  font-weight: 650;
  padding: 7px 12px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.mode-tab-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.06);
}

.mode-tab-btn.active {
  background: rgba(0, 229, 255, 0.15);
  border: 1px solid rgba(0, 229, 255, 0.4);
  color: #00e5ff;
  font-weight: 750;
  box-shadow: 0 2px 8px rgba(0, 229, 255, 0.15);
}

.mode-icon {
  font-size: 13px;
}

.task-count-pill {
  font-size: 10px;
  font-weight: 800;
  background: #00e5ff;
  color: #03201d;
  padding: 1px 5px;
  border-radius: 999px;
}

/* Right Actions */
.workspace-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gizmo-mode-group {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(2, 6, 23, 0.6);
  padding: 2px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.gizmo-btn {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gizmo-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.08);
}

.gizmo-btn.active {
  background: #00e5ff;
  color: #042f2e;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
}

.webgl-indicator-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 229, 255, 0.08);
  border: 1px solid rgba(0, 229, 255, 0.25);
  color: #00e5ff;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 9px;
  border-radius: 7px;
}

.webgl-glow-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #00e5ff;
  box-shadow: 0 0 6px #00e5ff;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  font-size: 12.5px;
  font-weight: 650;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.2);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-publish {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #10b981;
}

.btn-publish:hover {
  background: rgba(16, 185, 129, 0.25);
  color: #ffffff;
}

.preview-cta-btn {
  background: linear-gradient(135deg, #00e5ff 0%, #059669 100%);
  border: 1px solid rgba(0, 229, 255, 0.4);
  color: #03201d;
  font-weight: 750;
  box-shadow: 0 4px 14px rgba(0, 229, 255, 0.25);
}

.preview-cta-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.preview-cta-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(1);
}

.upload-icon {
  font-size: 13px;
}
</style>
