<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { formatBytes } from '../lib/format'
import { useModalFocus } from '../composables/useModalFocus'

interface PhotoItem {
  id: string
  title?: string
  thumbnailUrl?: string
  originalUrl?: string
  byteSize?: number
  width?: number
  height?: number
  cover?: boolean
  status?: string
  createdAt?: string
}

interface Props {
  show: boolean
  photos: PhotoItem[]
  currentIndex: number
  canWrite?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', index: number): void
  (e: 'set-cover', photo: PhotoItem): void
  (e: 'delete', photo: PhotoItem): void
  (e: 'update-title', payload: { photo: PhotoItem; title: string }): void
  (e: 'move-up', photo: PhotoItem): void
  (e: 'move-down', photo: PhotoItem): void
}>()

const isEditingTitle = ref(false)
const titleInput = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const titleButtonRef = ref<HTMLButtonElement | null>(null)

const currentPhoto = computed(() => props.photos[props.currentIndex])
const { root } = useModalFocus(computed(() => props.show && !!currentPhoto.value), {
  focusContainer: true,
  onEscape: () => {
    if (isEditingTitle.value) cancelEditTitle()
    else emit('close')
  }
})

watch(() => props.currentIndex, async () => {
  isEditingTitle.value = false
  titleInput.value = currentPhoto.value?.title || ''
  await nextTick()
  if (props.show && document.activeElement === document.body) root.value?.focus()
})

watch(() => props.show, (shown) => {
  if (shown) {
    isEditingTitle.value = false
    titleInput.value = currentPhoto.value?.title || ''
  }
})

function startEditTitle() {
  if (!props.canWrite || !currentPhoto.value) return
  titleInput.value = currentPhoto.value.title || ''
  isEditingTitle.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

function saveTitle(restoreFocus = false) {
  if (!isEditingTitle.value || !currentPhoto.value) return
  const trimmed = titleInput.value.trim()
  isEditingTitle.value = false
  if (trimmed !== (currentPhoto.value.title || '')) {
    emit('update-title', { photo: currentPhoto.value, title: trimmed })
  }
  if (restoreFocus) nextTick(() => titleButtonRef.value?.focus())
}

function cancelEditTitle() {
  isEditingTitle.value = false
  titleInput.value = currentPhoto.value?.title || ''
  nextTick(() => titleButtonRef.value?.focus())
}

function handleKeyDown(e: KeyboardEvent) {
  if (!props.show || e.isComposing) return
  if (isEditingTitle.value) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTitle(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditTitle()
    }
    return
  }
  if (e.key === 'ArrowLeft' && props.currentIndex > 0) {
    e.preventDefault()
    emit('select', props.currentIndex - 1)
  }
  if (e.key === 'ArrowRight' && props.currentIndex < props.photos.length - 1) {
    e.preventDefault()
    emit('select', props.currentIndex + 1)
  }
}

function statusLabel(status?: string) {
  if (status === 'PROCESSING') return '处理中'
  if (status === 'FAILED') return '失败'
  if (status === 'DELETED') return '已删除'
  return '已就绪'
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="show && currentPhoto"
      ref="root"
      class="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="照片大图"
      tabindex="-1"
      @keydown="handleKeyDown"
      @click.self="emit('close')"
    >
      <!-- Top Navigation Bar -->
      <div class="lightbox-topbar">
        <div class="photo-indicator">
          <span class="index-current">{{ currentIndex + 1 }}</span>
          <span class="index-divider">/</span>
          <span class="index-total">{{ photos.length }}</span>
        </div>

        <div class="topbar-actions">
          <button
            v-if="canWrite && currentIndex > 0"
            class="action-btn"
            title="前移排序"
            @click="emit('move-up', photos[currentIndex])"
          >
            <Icon name="arrow-left" :size="14" />
            <span>前移</span>
          </button>
          <button
            v-if="canWrite && currentIndex < photos.length - 1"
            class="action-btn"
            title="后移排序"
            @click="emit('move-down', photos[currentIndex])"
          >
            <span>后移</span>
            <Icon name="arrow-right" :size="14" />
          </button>

          <button
            v-if="canWrite && !photos[currentIndex].cover"
            class="action-btn"
            title="设为相册封面"
            @click="emit('set-cover', photos[currentIndex])"
          >
            <Icon name="star" :size="15" />
            <span>设为封面</span>
          </button>
          <span v-else-if="photos[currentIndex].cover" class="lightbox-cover-badge">
            <Icon name="check" :size="14" />
            <span>当前封面</span>
          </span>

          <a
            v-if="photos[currentIndex].originalUrl"
            class="action-btn"
            title="在新标签页查看原始文件"
            :href="photos[currentIndex].originalUrl"
            target="_blank"
            rel="noopener"
          >
            <Icon name="maximize" :size="15" />
            <span>查看原图</span>
          </a>

          <button
            v-if="canWrite"
            class="action-btn action-danger"
            title="删除照片"
            @click="emit('delete', photos[currentIndex])"
          >
            <Icon name="trash" :size="15" />
            <span>删除</span>
          </button>

          <button class="action-btn close-btn" type="button" aria-label="关闭 (Esc)" title="关闭 (Esc)" @click="emit('close')">
            <Icon name="x" :size="18" />
          </button>
        </div>
      </div>

      <!-- Main Stage -->
      <div class="lightbox-stage">
        <!-- Prev Button -->
        <button
          v-if="currentIndex > 0"
          class="nav-btn prev-btn"
          aria-label="上一张"
          @click="emit('select', currentIndex - 1)"
        >
          <Icon name="arrow-left" :size="24" />
        </button>

        <!-- Current Image Display -->
        <div class="image-wrapper">
          <img
            :src="photos[currentIndex].thumbnailUrl"
            :alt="photos[currentIndex].title || '未命名照片'"
            class="main-image"
          />
        </div>

        <!-- Next Button -->
        <button
          v-if="currentIndex < photos.length - 1"
          class="nav-btn next-btn"
          aria-label="下一张"
          @click="emit('select', currentIndex + 1)"
        >
          <Icon name="arrow-right" :size="24" />
        </button>
      </div>

      <!-- Bottom Info Bar -->
      <div class="lightbox-bottombar">
        <div class="photo-info">
          <!-- Editable Title Row -->
          <div class="title-edit-container">
            <template v-if="isEditingTitle">
              <input
                ref="titleInputRef"
                v-model="titleInput"
                class="title-input-field"
                type="text"
                aria-label="照片标题"
                maxlength="160"
                placeholder="输入照片标题（按 Enter 保存）"
                @blur="saveTitle()"
              />
              <button class="title-save-btn" type="button" @click="saveTitle(true)">保存</button>
            </template>
            <template v-else>
              <h3 class="photo-title">
                <button
                  v-if="canWrite"
                  ref="titleButtonRef"
                  class="title-edit-btn"
                  type="button"
                  aria-label="修改照片标题"
                  title="修改照片标题"
                  @click="startEditTitle"
                >
                  {{ photos[currentIndex].title || '未命名照片' }}
                  <Icon name="edit" :size="14" class="edit-hint-icon" />
                </button>
                <span v-else>{{ photos[currentIndex].title || '未命名照片' }}</span>
              </h3>
            </template>
          </div>

          <div class="photo-meta-tags">
            <span v-if="photos[currentIndex].width && photos[currentIndex].height" class="meta-tag">
              {{ photos[currentIndex].width }} × {{ photos[currentIndex].height }} px
            </span>
            <span class="meta-tag">{{ formatBytes(photos[currentIndex].byteSize) }}</span>
            <span class="meta-tag status-tag" :class="`status-${photos[currentIndex].status?.toLowerCase()}`">
              {{ statusLabel(photos[currentIndex].status) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 15, 20, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  color: #ffffff;
  user-select: none;
  overflow-y: auto;
  font-family: var(--font-family, 'Plus Jakarta Sans', system-ui, sans-serif);
}

.lightbox-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 12px;
  padding: 16px 24px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0) 100%);
  z-index: 10;
}

.photo-indicator {
  font-family: var(--font-family, 'Plus Jakarta Sans', system-ui, sans-serif);
  font-size: 13.5px;
  font-weight: 600;
  color: #94a3b8;
}

.index-current {
  color: #f8fafc;
  font-weight: 700;
}

.index-divider {
  margin: 0 4px;
  opacity: 0.5;
}

.topbar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.action-btn {
  min-width: 44px;
  min-height: 44px;
  justify-content: center;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.action-danger {
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.2);
  border-color: rgba(220, 38, 38, 0.3);
}

.action-danger:hover {
  background: rgba(220, 38, 38, 0.35);
  border-color: rgba(220, 38, 38, 0.5);
}

.lightbox-cover-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
}

.close-btn {
  padding: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
}

.lightbox-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  padding: 20px;
}

.image-wrapper {
  height: 100%;
  max-width: 90vw;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes zoomIn {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: all 0.2s ease;
  z-index: 5;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-50%) scale(1.08);
}

.prev-btn {
  left: 24px;
}

.next-btn {
  right: 24px;
}

.lightbox-bottombar {
  padding: 16px 24px 24px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.photo-info {
  min-width: 0;
  max-width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.title-edit-container {
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.photo-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
  max-width: 100%;
  overflow-wrap: anywhere;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.title-edit-btn {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  min-height: 44px;
  max-width: 100%;
  overflow-wrap: anywhere;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.title-edit-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.edit-hint-icon {
  opacity: 0.6;
}

.title-input-field {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--brand-accent, #10b981);
  background: rgba(15, 23, 42, 0.85);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  min-width: 0;
  width: min(240px, 100%);
  text-align: center;
}

.title-save-btn {
  min-height: 44px;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--brand-accent, #10b981);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.photo-meta-tags {
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.meta-tag {
  font-size: 12px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 4px;
}

.status-tag {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
}

.status-ready {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.15);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.lightbox-overlay :is(button, a, input):focus-visible {
  outline: 2px solid var(--brand-lime, #d9f99d);
  outline-offset: 3px;
}

@media (max-width: 640px) {
  .lightbox-topbar { padding: 12px 16px; align-items: flex-start; }
  .photo-indicator { padding-top: 12px; flex-shrink: 0; }
  .topbar-actions { gap: 6px; }
  .lightbox-stage { padding: 12px; }
  .prev-btn { left: 12px; }
  .next-btn { right: 12px; }
  .lightbox-bottombar { padding: 12px 16px max(16px, env(safe-area-inset-bottom)); }
  .title-input-field { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .main-image { animation: none; }
  .fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
  .action-btn, .nav-btn { transition: background-color 0.15s ease; }
  .nav-btn:hover { transform: translateY(-50%); }
}
</style>
