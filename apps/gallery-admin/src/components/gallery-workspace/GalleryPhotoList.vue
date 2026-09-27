<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Sortable from 'sortablejs'
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import { usePhotoCuration } from '../../composables/usePhotoCuration'
import Icon from '../Icon.vue'

const props = defineProps<{
  photos: WorkspacePhoto[]
  canWrite?: boolean
}>()

const emit = defineEmits<{
  (event: 'open', photo: WorkspacePhoto): void
  (event: 'set-cover', photo: WorkspacePhoto): void
  (event: 'delete', photo: WorkspacePhoto): void
  (event: 'batch-delete', photoIds: string[]): void
  (event: 'move-photo', payload: { id: string; direction: 'up' | 'down' }): void
  (event: 'reorder', payload: { fromIndex: number; toIndex: number }): void
  (event: 'update-title', payload: { photo: WorkspacePhoto; title: string }): void
  (event: 'retry-failed'): void
}>()

const listRef = ref<HTMLElement | null>(null)
const editingTitleId = ref<string | null>(null)
const editingTitleValue = ref('')

const {
  activeFilter,
  selectedPhotoIds,
  filteredPhotos,
  readyCount,
  processingCount,
  failedCount,
  sortingEnabled,
  allFilteredSelected,
  toggleSelect,
  selectAll,
  clearSelection
} = usePhotoCuration({ photos: () => props.photos })

watch(() => props.photos, () => {
  // 列表刷新后，正在编辑的行可能已不存在，退出编辑态避免悬挂输入框。
  if (editingTitleId.value && !props.photos.some(p => p.id === editingTitleId.value)) {
    editingTitleId.value = null
  }
}, { deep: true })

let sortableInstance: Sortable | null = null

watch([listRef, () => props.canWrite, sortingEnabled], async ([element, canWriteValue, sortable]) => {
  await nextTick()
  sortableInstance?.destroy()
  sortableInstance = null
  if (!element || !canWriteValue || !sortable) return
  sortableInstance = new Sortable(element, {
    draggable: '.photo-list-row',
    filter: 'button, input, a',
    handle: '.row-drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: event => {
      const { oldIndex, newIndex } = event
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
      emit('reorder', { fromIndex: oldIndex, toIndex: newIndex })
    }
  })
}, { immediate: true, flush: 'post' })

onUnmounted(() => {
  sortableInstance?.destroy()
  sortableInstance = null
})

function startEditTitle(photo: WorkspacePhoto) {
  if (!props.canWrite) return
  editingTitleId.value = photo.id
  editingTitleValue.value = photo.title || ''
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.photo-list-row .row-title-input')
    input?.focus()
    input?.select()
  })
}

function saveTitle(photo: WorkspacePhoto) {
  if (editingTitleId.value !== photo.id) return
  const trimmed = editingTitleValue.value.trim()
  editingTitleId.value = null
  if (trimmed !== (photo.title || '')) {
    emit('update-title', { photo, title: trimmed })
  }
}

function cancelEditTitle(photo: WorkspacePhoto) {
  if (editingTitleId.value !== photo.id) return
  editingTitleId.value = null
  editingTitleValue.value = photo.title || ''
}

function onTitleKeydown(event: KeyboardEvent, photo: WorkspacePhoto) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveTitle(photo)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditTitle(photo)
  }
}

function statusLabel(status?: string) {
  if (status === 'PROCESSING') return '处理中'
  if (status === 'FAILED') return '失败'
  if (status === 'DELETED') return '已删除'
  return '已就绪'
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

function handleBatchDelete() {
  if (selectedPhotoIds.value.size === 0) return
  emit('batch-delete', Array.from(selectedPhotoIds.value))
}

defineExpose({ clearSelection })
</script>

<template>
  <div class="photo-list-container">
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
          <Icon :name="allFilteredSelected ? 'check' : 'grid'" :size="14" />
          <span>{{ allFilteredSelected ? '取消全选' : '全选当前' }}</span>
        </button>
      </div>
    </div>

    <p v-if="canWrite && sortingEnabled && photos.length > 1" class="drag-hint">
      拖动左侧手柄即可调整顺序
    </p>

    <div v-if="filteredPhotos.length" ref="listRef" class="photo-rows">
      <div
        v-for="photo in filteredPhotos"
        :key="photo.id"
        class="photo-list-row"
        :class="{ 'is-selected': selectedPhotoIds.has(photo.id) }"
        @click="emit('open', photo)"
      >
        <button
          v-if="canWrite"
          class="row-select"
          type="button"
          :aria-label="selectedPhotoIds.has(photo.id) ? '取消选择' : '选择照片'"
          @click.stop="toggleSelect(photo.id)"
        >
          <span class="select-box" :class="{ checked: selectedPhotoIds.has(photo.id) }">
            <Icon v-if="selectedPhotoIds.has(photo.id)" name="check" :size="12" />
          </span>
        </button>
        <span v-if="canWrite" class="row-drag-handle" aria-hidden="true" @click.stop>
          <Icon name="grip" :size="14" />
        </span>
        <img v-if="photo.thumbnailUrl" :src="photo.thumbnailUrl" class="row-thumb" loading="lazy" alt="" />
        <div v-else class="row-thumb row-thumb-empty">
          <Icon name="photo" :size="16" />
        </div>

        <div class="row-main" @click.stop>
          <template v-if="editingTitleId === photo.id">
            <input
              class="row-title-input"
              v-model="editingTitleValue"
              type="text"
              maxlength="160"
              placeholder="输入照片标题"
              @blur="saveTitle(photo)"
              @keydown="onTitleKeydown($event, photo)"
            />
          </template>
          <button
            v-else
            class="row-title"
            type="button"
            :title="canWrite ? '点击修改标题' : ''"
            @click="canWrite ? startEditTitle(photo) : emit('open', photo)"
          >
            {{ photo.title || '未命名照片' }}
            <Icon v-if="canWrite" name="edit" :size="12" class="row-edit-hint" />
          </button>
          <div class="row-meta">
            <span v-if="photo.width && photo.height" class="row-meta-tag">{{ photo.width }}×{{ photo.height }}</span>
            <span class="row-meta-tag" :class="`row-status-${(photo.status || '').toLowerCase()}`">
              {{ statusLabel(photo.status) }}
            </span>
            <span v-if="photo.cover" class="row-meta-tag is-cover">
              <Icon name="star" :size="10" />
              封面
            </span>
          </div>
        </div>

        <div v-if="canWrite" class="row-actions" @click.stop>
          <button
            v-if="!photo.cover && photo.status === 'READY'"
            class="row-action-btn"
            type="button"
            title="设为封面"
            @click="emit('set-cover', photo)"
          >
            <Icon name="star" :size="14" />
          </button>
          <button
            class="row-action-btn"
            type="button"
            title="前移"
            :disabled="!canMoveUp(photo)"
            @click="emit('move-photo', { id: photo.id, direction: 'up' })"
          >
            <Icon name="arrow-up" :size="14" />
          </button>
          <button
            class="row-action-btn"
            type="button"
            title="后移"
            :disabled="!canMoveDown(photo)"
            @click="emit('move-photo', { id: photo.id, direction: 'down' })"
          >
            <Icon name="arrow-down" :size="14" />
          </button>
          <button class="row-action-btn is-danger" type="button" title="删除" @click="emit('delete', photo)">
            <Icon name="trash" :size="14" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="list-filtered-empty">当前分类下没有照片。</p>

    <Transition name="slide-up">
      <div v-if="selectedPhotoIds.size > 0" class="floating-batch-bar">
        <div class="batch-count-info">
          <span class="batch-selected-badge">{{ selectedPhotoIds.size }}</span>
          <span>张照片已选择</span>
        </div>
        <div class="batch-actions-btns">
          <button class="btn btn-batch-cancel" type="button" @click="clearSelection">取消选择</button>
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
.photo-list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.drag-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.photo-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  cursor: pointer;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.photo-list-row:hover {
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.photo-list-row.is-selected {
  border-color: rgba(16, 185, 129, 0.6);
  background: rgba(236, 253, 245, 0.6);
}

.photo-list-row.sortable-ghost {
  opacity: 0.4;
}

.photo-list-row.sortable-chosen {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
}

.row-select {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.select-box {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  display: grid;
  place-items: center;
  color: #ffffff;
  transition: all 0.15s ease;
}

.select-box.checked {
  background: #10b981;
  border-color: #10b981;
}

.row-drag-handle {
  display: flex;
  align-items: center;
  color: #cbd5e1;
  cursor: grab;
  padding: 4px 2px;
}

.row-drag-handle:active {
  cursor: grabbing;
}

.row-thumb {
  width: 64px;
  height: 44px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: #f1f5f9;
}

.row-thumb-empty {
  display: grid;
  place-items: center;
  color: #cbd5e1;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row-title {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  font-size: 13.5px;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title:hover {
  color: #047857;
}

.row-edit-hint {
  opacity: 0.45;
  flex-shrink: 0;
}

.row-title-input {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #10b981;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  outline: none;
  width: min(320px, 100%);
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-meta-tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.14);
  color: #64748b;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.row-status-ready {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
}

.row-status-processing {
  background: rgba(245, 158, 11, 0.14);
  color: #d97706;
}

.row-status-failed {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.row-meta-tag.is-cover {
  background: rgba(16, 185, 129, 0.18);
  color: #047857;
  font-weight: 700;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.row-action-btn {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.row-action-btn:hover:not(:disabled) {
  background: #f1f5f9;
  color: #0f172a;
}

.row-action-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.row-action-btn.is-danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.list-filtered-empty {
  margin: 0;
  padding: 28px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
  border: 1px dashed rgba(203, 213, 225, 0.8);
  border-radius: 12px;
}

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

@media (prefers-reduced-motion: reduce) {
  .photo-list-row,
  .row-action-btn,
  .select-box {
    transition: none !important;
  }
}
</style>
