<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import GalleryPhotoCard from './GalleryPhotoCard.vue'
import Icon from '../Icon.vue'

const props = defineProps<{
  photos: WorkspacePhoto[]
  canWrite?: boolean
}>()

const emit = defineEmits<{
  (event: 'open', index: number): void
  (event: 'set-cover', photo: WorkspacePhoto): void
  (event: 'delete', photo: WorkspacePhoto): void
  (event: 'batch-delete', photoIds: string[]): void
  (event: 'move-photo', payload: { id: string; direction: 'up' | 'down' }): void
  (event: 'retry-failed'): void
}>()

// Category Filter State
const activeFilter = ref<'ALL' | 'READY' | 'PROCESSING' | 'FAILED'>('ALL')
const selectedPhotoIds = ref<Set<string>>(new Set())

const readyCount = computed(() => props.photos.filter(p => p.status === 'READY').length)
const processingCount = computed(() => props.photos.filter(p => p.status === 'PROCESSING').length)
const failedCount = computed(() => props.photos.filter(p => p.status === 'FAILED').length)

const filteredPhotos = computed(() => {
  if (activeFilter.value === 'ALL') return props.photos
  return props.photos.filter(p => p.status === activeFilter.value)
})

const sortingEnabled = computed(() => activeFilter.value === 'ALL')

// Reassign Set so Vue tracks selection size after prune/clear
watch(() => props.photos, (currentPhotos) => {
  const currentIdSet = new Set(currentPhotos.map(p => p.id))
  const next = new Set([...selectedPhotoIds.value].filter(id => currentIdSet.has(id)))
  if (next.size !== selectedPhotoIds.value.size) {
    selectedPhotoIds.value = next
  }
}, { deep: true })

function toggleSelect(id: string) {
  const next = new Set(selectedPhotoIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedPhotoIds.value = next
}

function selectAll() {
  if (selectedPhotoIds.value.size === filteredPhotos.value.length && filteredPhotos.value.length > 0) {
    selectedPhotoIds.value = new Set()
  } else {
    selectedPhotoIds.value = new Set(filteredPhotos.value.map(p => p.id))
  }
}

function clearSelection() {
  selectedPhotoIds.value = new Set()
}

function handleBatchDelete() {
  if (selectedPhotoIds.value.size === 0) return
  emit('batch-delete', Array.from(selectedPhotoIds.value))
}

function canMoveUp(photo: WorkspacePhoto) {
  if (!sortingEnabled.value) return false
  return props.photos.findIndex(p => p.id === photo.id) > 0
}

function canMoveDown(photo: WorkspacePhoto) {
  if (!sortingEnabled.value) return false
  const index = props.photos.findIndex(p => p.id === photo.id)
  return index >= 0 && index < props.photos.length - 1
}

function handlePhotoOpen(photo: WorkspacePhoto) {
  const fullIndex = props.photos.findIndex(p => p.id === photo.id)
  if (fullIndex !== -1) {
    emit('open', fullIndex)
  }
}

defineExpose({ clearSelection })
</script>

<template>
  <div class="photo-grid-container">
    <!-- Filter Pills & Multi-Select Bar -->
    <div class="photo-filter-toolbar">
      <div class="filter-pills-group" role="tablist">
        <button
          class="category-pill"
          :class="{ active: activeFilter === 'ALL' }"
          type="button"
          @click="activeFilter = 'ALL'"
        >
          <span>全部照片</span>
          <span class="count-tag">{{ photos.length }}</span>
        </button>
        <button
          class="category-pill"
          :class="{ active: activeFilter === 'READY' }"
          type="button"
          @click="activeFilter = 'READY'"
        >
          <span>已就绪</span>
          <span class="count-tag is-ready">{{ readyCount }}</span>
        </button>
        <button
          v-if="processingCount"
          class="category-pill"
          :class="{ active: activeFilter === 'PROCESSING' }"
          type="button"
          @click="activeFilter = 'PROCESSING'"
        >
          <span class="pulse-dot-amber"></span>
          <span>处理中</span>
          <span class="count-tag is-processing">{{ processingCount }}</span>
        </button>
        <button
          v-if="failedCount"
          class="category-pill"
          :class="{ active: activeFilter === 'FAILED' }"
          type="button"
          @click="activeFilter = 'FAILED'"
        >
          <span>失败</span>
          <span class="count-tag is-failed">{{ failedCount }}</span>
        </button>
      </div>

      <!-- Quick select all / actions -->
      <div v-if="canWrite && filteredPhotos.length" class="batch-trigger-tools">
        <button
          v-if="activeFilter === 'FAILED' && failedCount > 0"
          class="btn btn-retry-tool"
          type="button"
          @click="$emit('retry-failed')"
        >
          <Icon name="refresh" :size="14" />
          <span>重试失败项</span>
        </button>
        <button class="btn btn-ghost btn-sm select-all-btn" type="button" @click="selectAll">
          <Icon :name="selectedPhotoIds.size === filteredPhotos.length && filteredPhotos.length > 0 ? 'check' : 'grid'" :size="14" />
          <span>{{ selectedPhotoIds.size === filteredPhotos.length && filteredPhotos.length > 0 ? '取消全选' : '全选当前' }}</span>
        </button>
      </div>
    </div>

    <!-- Photos Grid -->
    <div v-if="filteredPhotos.length" class="photos-masonry-grid" aria-live="polite">
      <slot name="dropzone"></slot>
      <GalleryPhotoCard
        v-for="photo in filteredPhotos"
        :key="photo.id"
        :photo="photo"
        :can-write="canWrite"
        :selected="selectedPhotoIds.has(photo.id)"
        :can-move-up="canMoveUp(photo)"
        :can-move-down="canMoveDown(photo)"
        @open="handlePhotoOpen(photo)"
        @set-cover="$emit('set-cover', photo)"
        @delete="$emit('delete', photo)"
        @toggle-select="toggleSelect(photo.id)"
        @move-up="$emit('move-photo', { id: photo.id, direction: 'up' })"
        @move-down="$emit('move-photo', { id: photo.id, direction: 'down' })"
      />
    </div>

    <!-- Empty Photos State -->
    <div v-else class="empty-photos-panel">
      <slot name="dropzone"></slot>
      <div class="empty-box-content">
        <div class="empty-photo-icon">
          <Icon name="photo" :size="32" />
        </div>
        <h3>{{ photos.length ? '当前分类下没有照片' : '相册内暂无照片' }}</h3>
        <p>{{ photos.length ? '请切换筛选标签查看其他状态的照片。' : '在上方拖拽或选择照片上传，开启沉浸式 3D 展厅创作。' }}</p>
      </div>
    </div>

    <!-- Bottom Floating Batch Action Bar -->
    <Transition name="slide-up">
      <div v-if="selectedPhotoIds.size > 0" class="floating-batch-bar">
        <div class="batch-count-info">
          <span class="batch-selected-badge">{{ selectedPhotoIds.size }}</span>
          <span>张照片已选择</span>
        </div>
        <div class="batch-actions-btns">
          <button
            v-if="activeFilter === 'FAILED' && failedCount > 0"
            class="btn btn-batch-retry"
            type="button"
            @click="$emit('retry-failed')"
          >
            <Icon name="refresh" :size="14" />
            <span>重试失败项</span>
          </button>
          <button class="btn btn-batch-cancel" type="button" @click="clearSelection">
            取消选择
          </button>
          <button class="btn btn-danger btn-sm" type="button" @click="handleBatchDelete">
            <Icon name="trash" :size="14" />
            <span>批量删除</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.photo-grid-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
}

.photo-filter-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
}

.filter-pills-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.category-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: rgba(241, 245, 249, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.8);
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-pill:hover {
  color: #0f172a;
  background: #ffffff;
}

.category-pill.active {
  color: #047857;
  background: #ffffff;
  border-color: rgba(16, 185, 129, 0.35);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.12);
}

.count-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.16);
  font-weight: 700;
}

.count-tag.is-ready {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.count-tag.is-processing {
  background: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.count-tag.is-failed {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.pulse-dot-amber {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
}

.batch-trigger-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-retry-tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-retry-tool:hover {
  background: #fde68a;
}

.select-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  cursor: pointer;
}

.select-all-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.photos-masonry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1200px) {
  .photos-masonry-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .photos-masonry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.empty-photos-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-box-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 180px;
  padding: 36px 20px;
  text-align: center;
  border-radius: 16px;
  border: 1px dashed rgba(203, 213, 225, 0.8);
  background: #ffffff;
}

.empty-photo-icon {
  width: 50px;
  height: 50px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #059669;
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
}

.empty-box-content h3 {
  font-size: 15px;
  font-weight: 750;
  color: #0f172a;
  margin: 0;
}

.empty-box-content p {
  font-size: 13px;
  color: #64748b;
  max-width: 400px;
  margin: 0;
}

/* Floating Batch Action Bar */
.floating-batch-bar {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 20px;
  background: #0f172a;
  color: #ffffff;
  border-radius: 9999px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.35);
}

.batch-count-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}

.batch-selected-badge {
  background: var(--brand-accent, #10b981);
  color: #ffffff;
  font-size: 12px;
  font-weight: 750;
  padding: 2px 8px;
  border-radius: 9999px;
}

.batch-actions-btns {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-batch-retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fef3c7;
  background: rgba(245, 158, 11, 0.3);
  border: 1px solid rgba(245, 158, 11, 0.5);
  cursor: pointer;
}

.btn-batch-retry:hover {
  background: rgba(245, 158, 11, 0.45);
}

.btn-batch-cancel {
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
}

.btn-batch-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 600;
  background: #ef4444;
  color: #ffffff;
  border: none;
  cursor: pointer;
}

.btn-danger:hover {
  background: #dc2626;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}
</style>
