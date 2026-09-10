import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { PublishReadinessResponse } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

export function usePublishCenter(
  galleryId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true
) {
  const id = computed(() => toValue(galleryId))
  const isEnabled = computed(() => toValue(enabled))

  const readiness = ref<PublishReadinessResponse | null>(null)
  const loading = ref(false)
  const publishing = ref(false)
  const unpublishing = ref(false)
  const error = ref<string | null>(null)

  async function loadReadiness() {
    const galleryIdValue = id.value
    if (!isEnabled.value || !galleryIdValue) {
      readiness.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/publish-readiness`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || '获取发布就绪状态失败')
      }
      readiness.value = await response.json() as PublishReadinessResponse
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '获取发布就绪状态失败'
    } finally {
      loading.value = false
    }
  }

  async function publishAll() {
    const galleryIdValue = id.value
    if (!galleryIdValue || publishing.value) return
    publishing.value = true
    error.value = null
    try {
      // 1. If config draft has changed, publish config first
      if (readiness.value?.configDraftChanged) {
        const configResp = await apiFetch(`/api/galleries/${galleryIdValue}/viewer-config/publish`, {
          method: 'POST'
        })
        if (!configResp.ok) {
          const body = await configResp.json().catch(() => ({})) as { message?: string }
          throw new Error(body.message || '同步画廊配置失败')
        }
      }

      // 2. Publish gallery
      const galleryResp = await apiFetch(`/api/galleries/${galleryIdValue}/publish`, {
        method: 'POST'
      })
      if (!galleryResp.ok) {
        const body = await galleryResp.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || '发布展厅失败')
      }

      await loadReadiness()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '发布失败，请重试'
      throw cause
    } finally {
      publishing.value = false
    }
  }

  async function unpublish() {
    const galleryIdValue = id.value
    if (!galleryIdValue || unpublishing.value) return
    unpublishing.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/unpublish`, {
        method: 'POST'
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || '撤回发布失败')
      }
      await loadReadiness()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '撤回失败，请重试'
      throw cause
    } finally {
      unpublishing.value = false
    }
  }

  watch([id, isEnabled], () => {
    void loadReadiness()
  }, { immediate: true })

  return {
    readiness,
    loading,
    publishing,
    unpublishing,
    error,
    loadReadiness,
    publishAll,
    unpublish
  }
}
