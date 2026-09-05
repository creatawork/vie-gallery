<script setup lang="ts">
import type { Gallery } from '@vie/gallery-contracts'
import Icon from '../Icon.vue'

defineProps<{
  gallery: Gallery
  photoCount: number
}>()

defineEmits<{
  (event: 'config'): void
  (event: 'share'): void
  (event: 'preview'): void
}>()
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
      </div>
      <div class="workspace-meta">
        <code>/g/{{ gallery.slug }}</code>
        <span aria-hidden="true">·</span>
        <span>{{ photoCount }} 张照片</span>
      </div>
    </div>

    <div class="workspace-actions" aria-label="空间操作">
      <button class="btn btn-secondary" type="button" @click="$emit('config')">
        <Icon name="sliders" :size="16" />
        <span>3D 视觉配置</span>
      </button>
      <button class="btn btn-secondary" type="button" @click="$emit('share')">
        <Icon name="share" :size="16" />
        <span>分享链接</span>
      </button>
      <button class="btn btn-primary" type="button" @click="$emit('preview')">
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
