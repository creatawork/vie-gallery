import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createRecommendedViewerConfig, RECOMMENDED_SCENE_PRESET, serializeViewerConfig, type PublishReadinessResponse } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

/** 首次发布时后端可能还没有草稿配置行（publishConfig 会 404 CONFIG_NOT_FOUND）。
 *  发布前先静默写入推荐场景草稿，保证“上传完直接发布”一条路走通。 */
async function ensureConfigDraft(galleryId: string): Promise<void> {
  const response = await apiFetch(`/api/galleries/${galleryId}/viewer-config`)
  if (response.ok) return
  if (response.status !== 404) throw new Error('获取展厅配置失败')
  const save = await apiFetch(`/api/galleries/${galleryId}/viewer-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configJson: serializeViewerConfig(createRecommendedViewerConfig()),
      presetName: RECOMMENDED_SCENE_PRESET,
      schemaVersion: 1
    })
  })
  if (!save.ok) throw new Error('初始化展厅场景失败，请重试')
}

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
        await ensureConfigDraft(galleryIdValue)
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
