import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createRecommendedViewerConfig, RECOMMENDED_SCENE_PRESET, serializeViewerConfig, type PublishReadinessResponse, type ViewerConfigVersionMetadata } from '@vie/gallery-contracts'
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
  const appliedConfigVersion = ref<string | null>(null)
  let requestSequence = 0

  async function fetchReadiness(galleryIdValue: string): Promise<PublishReadinessResponse> {
    const response = await apiFetch(`/api/galleries/${galleryIdValue}/publish-readiness`)
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string }
      throw new Error(body.message || '获取发布就绪状态失败')
    }
    return await response.json() as PublishReadinessResponse
  }

  async function loadReadiness() {
    const galleryIdValue = id.value
    if (!isEnabled.value || !galleryIdValue) {
      readiness.value = null
      return
    }
    const sequence = ++requestSequence
    loading.value = true
    error.value = null
    try {
      const result = await fetchReadiness(galleryIdValue)
      if (sequence === requestSequence && galleryIdValue === id.value) readiness.value = result
    } catch (cause) {
      if (sequence === requestSequence && galleryIdValue === id.value) error.value = cause instanceof Error ? cause.message : '获取发布就绪状态失败'
    } finally {
      if (sequence === requestSequence) loading.value = false
    }
  }

  async function publishAll(metadata?: ViewerConfigVersionMetadata) {
    const galleryIdValue = id.value
    if (!galleryIdValue || publishing.value) return
    publishing.value = true
    error.value = null
    try {
      // Always make the decision from a fresh readiness response. A failed read
      // must never fall back to the previous value and accidentally republish.
      const freshReadiness = await fetchReadiness(galleryIdValue)
      if (galleryIdValue !== id.value) return
      readiness.value = freshReadiness

      if (freshReadiness.configDraftChanged) {
        await ensureConfigDraft(galleryIdValue)
        const configResp = await apiFetch(`/api/galleries/${galleryIdValue}/viewer-config/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadata ?? {})
        })
        if (!configResp.ok) {
          const body = await configResp.json().catch(() => ({})) as { message?: string }
          // The request may have reached the server even if its response was
          // lost. Refresh state for the next explicit retry; never repeat here.
          const refreshed = await fetchReadiness(galleryIdValue).catch(() => null)
          if (refreshed && galleryIdValue === id.value) readiness.value = refreshed
          throw new Error(body.message || '配置发布结果暂时无法确认，请刷新状态后重试。')
        }
        const version = await configResp.json() as { versionNumber?: string | number }
        appliedConfigVersion.value = version.versionNumber == null ? null : String(version.versionNumber)
        const refreshed = await fetchReadiness(galleryIdValue)
        if (galleryIdValue !== id.value) return
        readiness.value = refreshed
      }

      // 2. Publish gallery
      const galleryResp = await apiFetch(`/api/galleries/${galleryIdValue}/publish`, {
        method: 'POST'
      })
      if (!galleryResp.ok) {
        const body = await galleryResp.json().catch(() => ({})) as { message?: string }
        const prefix = appliedConfigVersion.value ? `配置版本 v${appliedConfigVersion.value} 已生效，相册发布失败。` : ''
        throw new Error(`${prefix}${body.message || '请重试发布展厅。'}`)
      }

      await loadReadiness()
      appliedConfigVersion.value = null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '发布失败，请重试'
      const partialSuccess = appliedConfigVersion.value && !message.startsWith(`配置版本 v${appliedConfigVersion.value} 已生效`)
        ? `配置版本 v${appliedConfigVersion.value} 已生效，后续发布未完成：${message}`
        : message
      error.value = partialSuccess
      throw new Error(partialSuccess)
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
    requestSequence++
    appliedConfigVersion.value = null
    void loadReadiness()
  }, { immediate: true })

  return {
    readiness,
    loading,
    publishing,
    unpublishing,
    error,
    appliedConfigVersion,
    loadReadiness,
    publishAll,
    unpublish
  }
}
