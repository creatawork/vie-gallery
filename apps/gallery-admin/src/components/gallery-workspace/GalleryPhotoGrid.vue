<script setup lang="ts">
import { computed, ref } from 'vue'
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

function toggleSelect(id: string) {
  if (selectedPhotoIds.value.has(id)) {
    selectedPhotoIds.value.delete(id)
  } else {
    selectedPhotoIds.value.add(id)
  }
}

function selectAll() {
  if (selectedPhotoIds.value.size === filteredPhotos.value.length) {
    selectedPhotoIds.value.clear()
  } else {
    selectedPhotoIds.value = new Set(filteredPhotos.value.map(p => p.id))
  }
}

function clearSelection() {
  selectedPhotoIds.value.clear()
}

function handleBatchDelete() {
  if (selectedPhotoIds.value.size === 0) return
  emit('batch-delete', Array.from(selectedPhotoIds.value))
}
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

      <!-- Quick select all if photos exist and can write -->
      <div v-if="canWrite && filteredPhotos.length" class="batch-trigger-tools">
        <button class="btn btn-ghost btn-sm" type="button" @click="selectAll">
          <Icon :name="selectedPhotoIds.size === filteredPhotos.length && filteredPhotos.length > 0 ? 'check' : 'grid'" :size="14" />
          <span>{{ selectedPhotoIds.size === filteredPhotos.length ? '取消全选' : '全选当前' }}</span>
        </button>
      </div>
    </div>

    <!-- Photos Grid -->
    <div v-if="filteredPhotos.length" class="photos-masonry-grid" aria-live="polite">
      <GalleryPhotoCard
        v-for="(photo, index) in filteredPhotos"
        :key="photo.id"
        :photo="photo"
        :can-write="canWrite"
        :selected="selectedPhotoIds.has(photo.id)"
        @open="$emit('open', index)"
        @set-cover="$emit('set-cover', photo)"
        @delete="$emit('delete', photo)"
        @toggle-select="toggleSelect(photo.id)"
      />
    </div>

    <!-- Empty Photos State -->
    <div v-else class="empty-photos-panel">
      <div class="empty-photo-icon">
        <Icon name="photo" :size="32" />
      </div>
      <h3>{{ photos.length ? '当前分类下没有照片' : '相册内暂无照片' }}</h3>
      <p>{{ photos.length ? '请切换筛选标签查看其他状态的照片' : '在上方拖拽或选择照片上传，开启沉浸式 3D 展厅创作。' }}</p>
    </div>

    <!-- Bottom Floating Batch Action Bar -->
    <Transition name="slide-up">
      <div v-if="selectedPhotoIds.size > 0" class="floating-batch-bar">
        <div class="batch-count-info">
          <span class="batch-selected-badge">{{ selectedPhotoIds.size }}</span>
          <span>张照片已选择</span>
        </div>
        <div class="batch-actions-btns">
          <button class="btn btn-secondary btn-sm" type="button" @click="clearSelection">
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

.photos-masonry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 18px;
}

.empty-photos-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  padding: 40px 20px;
  text-align: center;
  border-radius: 18px;
  border: 1px dashed rgba(203, 213, 225, 0.8);
  background: #ffffff;
}

.empty-photo-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: #059669;
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
}

.empty-photos-panel h3 {
  font-size: 16px;
  font-weight: 750;
  color: #0f172a;
}

.empty-photos-panel p {
  font-size: 13px;
  color: #64748b;
  max-width: 420px;
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
  gap: 20px;
  padding: 12px 22px;
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
  background: #10b981;
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

.btn-danger {
  background: #ef4444;
  color: #ffffff;
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
