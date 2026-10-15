<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import type { WorkspacePhoto } from '../../composables/useGalleryWorkspace'
import { formatBytes } from '../../lib/format'
import Icon from '../Icon.vue'

const props = defineProps<{
  photo: WorkspacePhoto
  canWrite?: boolean
  selected?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
}>()

const emit = defineEmits<{
  (event: 'open'): void
  (event: 'set-cover'): void
  (event: 'delete'): void
  (event: 'toggle-select'): void
  (event: 'move-up'): void
  (event: 'move-down'): void
}>()

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
const menuTrigger = ref<HTMLButtonElement | null>(null)

function toggleMenu(event: Event) {
  event.stopPropagation()
  menuOpen.value = !menuOpen.value
}

// 菜单展开期间监听外点与 Esc，解决菜单不关闭的问题。
function handleDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return
  if (menuRoot.value && event.target instanceof Node && menuRoot.value.contains(event.target)) return
  menuOpen.value = false
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (menuOpen.value && event.key === 'Escape') {
    menuOpen.value = false
    event.preventDefault()
    event.stopPropagation()
    nextTick(() => menuTrigger.value?.focus())
  }
}

watch(menuOpen, open => {
  if (open) {
    document.addEventListener('click', handleDocumentClick, true)
    document.addEventListener('keydown', handleDocumentKeydown, true)
  } else {
    document.removeEventListener('click', handleDocumentClick, true)
    document.removeEventListener('keydown', handleDocumentKeydown, true)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick, true)
  document.removeEventListener('keydown', handleDocumentKeydown, true)
})

function handleSelectClick(event: Event) {
  event.stopPropagation()
  emit('toggle-select')
}
</script>

<template>
  <article
    class="photo-card"
    :class="{ 'is-selected': selected, 'is-menu-open': menuOpen }"
    tabindex="0"
    @click="$emit('open')"
    @keydown.enter.self.prevent="$emit('open')"
    @keydown.space.self.prevent="$emit('open')"
  >
    <div class="photo-img-box">
      <img
        v-if="photo.thumbnailUrl"
        :src="photo.thumbnailUrl"
        :alt="photo.title || '照片'"
        loading="lazy"
        class="photo-image"
      />
      <div v-else class="empty-thumb">
        <Icon name="photo" :size="28" />
      </div>

      <!-- Multi-select checkbox button -->
      <button
        v-if="canWrite"
        type="button"
        class="select-btn"
        :class="{ 'is-checked': selected }"
        :aria-pressed="!!selected"
        :aria-label="selected ? '取消选中' : '选中照片'"
        @click="handleSelectClick"
      >
        <Icon v-if="selected" name="check" :size="12" stroke-width="3" />
      </button>

      <!-- Status badges (All Chinese) -->
      <div class="badges-row">
        <span v-if="photo.cover" class="badge-cover" title="相册封面">封面</span>
        <span v-if="photo.status === 'PROCESSING'" class="badge-status is-processing" title="处理中">
          <span class="dot-pulse"></span>
          <span>处理中</span>
        </span>
        <span v-else-if="photo.status === 'FAILED'" class="badge-status is-failed" title="失败">
          <span>失败</span>
        </span>
      </div>
    </div>
    <div class="photo-info">
      <h3 :title="photo.title || '未命名照片'">{{ photo.title || '未命名照片' }}</h3>
      <div class="photo-meta">
        <span v-if="formatBytes(photo.byteSize)">{{ formatBytes(photo.byteSize) }}</span>
        <span v-else-if="photo.width && photo.height">{{ photo.width }}×{{ photo.height }}</span>
        <span v-else>—</span>
        <div ref="menuRoot" class="meta-actions" @click.stop>
          <button ref="menuTrigger" class="ghost-btn" type="button" aria-label="更多操作" :aria-expanded="menuOpen" @click="toggleMenu">
            <Icon name="more" :size="16" />
          </button>
          <div v-if="menuOpen" class="card-menu">
            <button type="button" @click="$emit('open'); menuOpen = false">查看大图</button>
            <button v-if="canWrite && !photo.cover" type="button" @click="$emit('set-cover'); menuOpen = false">设为封面</button>
            <button v-if="canWrite && canMoveUp" type="button" @click="$emit('move-up'); menuOpen = false">前移</button>
            <button v-if="canWrite && canMoveDown" type="button" @click="$emit('move-down'); menuOpen = false">后移</button>
            <button v-if="canWrite" type="button" class="danger" @click="$emit('delete'); menuOpen = false">删除</button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.photo-card {
  position: relative;
  background: var(--bg-surface);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 40, 28, 0.05);
  border: 1px solid var(--border-strong);
  transition: background-color .18s, border-color .18s, color .18s;
}

.photo-card:hover {
  transform: none;
  box-shadow: var(--shadow-sm);
}

.photo-card.is-selected {
  border-color: var(--brand-accent);
  box-shadow: 0 0 0 1px var(--brand-accent), 0 8px 20px var(--mint-soft);
}

.photo-img-box {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--bg-app);
  overflow: hidden;
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.empty-thumb {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
}

.select-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: var(--bg-surface);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background-color .18s, border-color .18s, color .18s;
  z-index: 2;
  opacity: 0;
}

.select-btn::before { content: ''; position: absolute; width: 22px; height: 22px; border: 1.5px solid white; border-radius: 5px; background: rgba(20, 31, 25, .3); }
.select-btn svg { position: relative; z-index: 1; }
.photo-card:hover .select-btn, .select-btn.is-checked { opacity: 1; }

.select-btn:hover {
  background: transparent;
}

.select-btn.is-checked {
  background: transparent;
}
.select-btn.is-checked::before { background: var(--brand-accent); border-color: var(--brand-accent); }

.badges-row {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 2;
}

.badge-cover {
  padding: 2px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--brand-deep);
  color: var(--bg-surface);
  box-shadow: none;
}

.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--bg-surface);
}

.badge-status.is-ready {
  background: var(--mint-soft);
}

.badge-status.is-processing {
  background: rgba(245, 158, 11, 0.9);
}

.badge-status.is-failed {
  background: rgba(239, 68, 68, 0.9);
}

.dot-pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--bg-surface);
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.photo-info {
  padding: 10px 12px 12px;
}

.photo-info h3 {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.photo-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.meta-actions {
  position: relative;
  display: flex;
  gap: 2px;
}

.ghost-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
  border-radius: 6px;
  background: transparent;
}

.ghost-btn:hover {
  background: var(--bg-app);
  color: var(--text-primary);
}

.card-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  min-width: 110px;
  padding: 6px;
  background: var(--bg-surface);
  border-radius: 10px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.14);
  z-index: 10;
}

.card-menu button {
  width: 100%;
  text-align: left;
  min-height: 44px;
  padding: 7px 8px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
}

.card-menu button:hover {
  background: var(--mint-soft);
}

.card-menu .danger {
  color: #dc2626;
}

.card-menu .danger:hover {
  background: #fef2f2;
}
.photo-card.is-menu-open {
  overflow: visible;
  z-index: 3;
}

.photo-card:focus-within .select-btn {
  opacity: 1;
  transform: none;
}

.photo-card:focus-visible,
.select-btn:focus-visible,
.ghost-btn:focus-visible,
.card-menu button:focus-visible {
  outline: 2px solid var(--brand-deep);
  outline-offset: -3px;
}

@media (max-width: 768px), (hover: none) {
  .select-btn { opacity: 1; }
  .photo-card, .photo-card:hover, .photo-card.tilt-active,
  .photo-card .photo-img-box, .photo-card .photo-info,
  .photo-card .select-btn, .photo-card .ghost-btn {
    transform: none;
    animation: none;
    transition: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .photo-card, .select-btn { transition: none; }
  .photo-card:hover, .photo-card.tilt-active { transform: none; }
  .dot-pulse { animation: none; }
}
</style>
