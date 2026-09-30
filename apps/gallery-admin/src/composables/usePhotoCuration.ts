import { computed, ref, watch } from 'vue'
import type { WorkspacePhoto } from './useGalleryWorkspace'

export type PhotoStatusFilter = 'ALL' | 'READY' | 'PROCESSING' | 'FAILED'

export interface PhotoCurationOptions {
  photos: () => WorkspacePhoto[]
  onSelectionPruned?: () => void
}

/**
 * 网格与列表共用的策展状态：状态筛选、标题搜索、多选、批量操作。
 * 两种视图各自实例化，切换视图时由视图层调用 clearSelection 对齐体验。
 *
 * 选择集始终跟随当前可见集合：切换状态筛选或修改搜索词后，
 * 不在可见集合中的选择会被修剪掉，避免"隐藏选择"被批量删除误伤。
 */
export function usePhotoCuration(options: PhotoCurationOptions) {
  const activeFilter = ref<PhotoStatusFilter>('ALL')
  const searchQuery = ref('')
  const selectedPhotoIds = ref<Set<string>>(new Set())

  const readyCount = computed(() => options.photos().filter(p => p.status === 'READY').length)
  const processingCount = computed(() => options.photos().filter(p => p.status === 'PROCESSING').length)
  const failedCount = computed(() => options.photos().filter(p => p.status === 'FAILED').length)

  const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase())

  const filteredPhotos = computed(() => {
    const search = normalizedSearch.value
    return options.photos().filter(p => {
      if (activeFilter.value !== 'ALL' && p.status !== activeFilter.value) return false
      if (search && !(p.title || '').toLowerCase().includes(search)) return false
      return true
    })
  })

  // 存在状态筛选或搜索词时禁止排序：筛选视图里的拖拽顺序无法映射回真实顺序。
  const hasActiveFilter = computed(() => activeFilter.value !== 'ALL' || normalizedSearch.value !== '')
  const sortingEnabled = computed(() => !hasActiveFilter.value)

  const allFilteredSelected = computed(() => (
    filteredPhotos.value.length > 0 &&
    filteredPhotos.value.every(p => selectedPhotoIds.value.has(p.id))
  ))

  // 可见集合变化（切换筛选、修改搜索、照片增删）时修剪选择集。
  watch(filteredPhotos, (currentPhotos) => {
    const currentIdSet = new Set(currentPhotos.map(p => p.id))
    if (selectedPhotoIds.value.size === 0) return
    const next = new Set([...selectedPhotoIds.value].filter(id => currentIdSet.has(id)))
    if (next.size !== selectedPhotoIds.value.size) {
      selectedPhotoIds.value = next
      options.onSelectionPruned?.()
    }
  })

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

  function clearFilters() {
    activeFilter.value = 'ALL'
    searchQuery.value = ''
  }

  function selectedIds(): string[] {
    return Array.from(selectedPhotoIds.value)
  }

  return {
    activeFilter,
    searchQuery,
    filteredPhotos,
    selectedPhotoIds,
    readyCount,
    processingCount,
    failedCount,
    hasActiveFilter,
    sortingEnabled,
    allFilteredSelected,
    toggleSelect,
    selectAll,
    clearSelection,
    clearFilters,
    selectedIds
  }
}
