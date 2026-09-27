import { computed, ref, watch } from 'vue'
import type { WorkspacePhoto } from './useGalleryWorkspace'

export type PhotoStatusFilter = 'ALL' | 'READY' | 'PROCESSING' | 'FAILED'

export interface PhotoCurationOptions {
  photos: () => WorkspacePhoto[]
  onSelectionPruned?: () => void
}

/**
 * 网格与列表共用的策展状态：状态筛选、多选、批量操作。
 * 两种视图各自实例化，切换视图时由视图层调用 clearSelection 对齐体验。
 */
export function usePhotoCuration(options: PhotoCurationOptions) {
  const activeFilter = ref<PhotoStatusFilter>('ALL')
  const selectedPhotoIds = ref<Set<string>>(new Set())

  const readyCount = computed(() => options.photos().filter(p => p.status === 'READY').length)
  const processingCount = computed(() => options.photos().filter(p => p.status === 'PROCESSING').length)
  const failedCount = computed(() => options.photos().filter(p => p.status === 'FAILED').length)

  const filteredPhotos = computed(() => {
    if (activeFilter.value === 'ALL') return options.photos()
    return options.photos().filter(p => p.status === activeFilter.value)
  })

  // 只有"全部"视图下的顺序才是真实顺序，其余筛选视图禁用排序。
  const sortingEnabled = computed(() => activeFilter.value === 'ALL')

  const allFilteredSelected = computed(() => (
    filteredPhotos.value.length > 0 && selectedPhotoIds.value.size === filteredPhotos.value.length
  ))

  watch(() => options.photos(), (currentPhotos) => {
    const currentIdSet = new Set(currentPhotos.map(p => p.id))
    const next = new Set([...selectedPhotoIds.value].filter(id => currentIdSet.has(id)))
    if (next.size !== selectedPhotoIds.value.size) {
      selectedPhotoIds.value = next
      options.onSelectionPruned?.()
    }
  }, { deep: true })

  function toggleSelect(id: string) {
    const next = new Set(selectedPhotoIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedPhotoIds.value = next
  }

  function selectAll() {
    if (allFilteredSelected.value) {
      selectedPhotoIds.value = new Set()
    } else {
      selectedPhotoIds.value = new Set(filteredPhotos.value.map(p => p.id))
    }
  }

  function clearSelection() {
    selectedPhotoIds.value = new Set()
  }

  function selectedIds(): string[] {
    return Array.from(selectedPhotoIds.value)
  }

  return {
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
    clearSelection,
    selectedIds
  }
}
