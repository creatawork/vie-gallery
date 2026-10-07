import { computed, ref } from 'vue'
import { apiFetch } from '../api'
import { applyViewerPreset, createRecommendedViewerConfig, mergeViewerConfig, parseViewerConfig, restoreViewerPreset, serializeViewerConfig, ViewerConfigValidationError, type ConfigIssue, type PresetName } from '@vie/gallery-contracts'
export function useViewerConfigEditor(galleryId: string, options: { request?: typeof apiFetch; canWrite?: () => boolean } = {}) {
  const request = options.request ?? apiFetch
  const config = ref(createRecommendedViewerConfig()), issues = ref<ConfigIssue[]>([]), savedJson = ref(''), saving = ref(false), error = ref('')
  const dirty = computed(() => serializeViewerConfig(config.value) !== savedJson.value)
  let loadVersion = 0
  function replace(json: string, markSaved = false, schemaVersion = 1) {
    const result = parseViewerConfig(json, schemaVersion, 'legacy')
    config.value = result.config; issues.value = result.issues
    if (markSaved) savedJson.value = serializeViewerConfig(config.value)
  }
  async function load() {
    const version = ++loadVersion
    const response = await request(`/api/galleries/${encodeURIComponent(galleryId)}/viewer-config`)
    if (version !== loadVersion) return
    if (response.status === 404) { replace(serializeViewerConfig(createRecommendedViewerConfig()), true); return }
    if (!response.ok) throw new Error('展厅配置加载失败，请重试。')
    const data = await response.json()
    if (version === loadVersion) replace(data.configJson ?? '{}', true, data.schemaVersion ?? 1)
  }
  function patch(input: unknown) {
    if (options.canWrite && !options.canWrite()) return
    try {
      const next = mergeViewerConfig(config.value, input)
      const paths: string[] = []
      function collect(value: unknown, path = '') { if (value && typeof value === 'object' && !Array.isArray(value)) for (const [key, child] of Object.entries(value)) collect(child, path ? `${path}.${key}` : key); else paths.push(path) }
      collect(input)
      config.value = { ...next, customized: true }
      issues.value = issues.value.filter(issue => !paths.some(path => issue.path === path || issue.path.startsWith(`${path}.`)))
    } catch (cause) { if (cause instanceof ViewerConfigValidationError) issues.value = [...issues.value.filter(issue => !cause.issues.some(next => next.path === issue.path)), ...cause.issues]; else throw cause }
  }
  function preset(name: PresetName) { if (options.canWrite && !options.canWrite()) return; config.value = applyViewerPreset(name, JSON.parse(serializeViewerConfig(config.value))); issues.value = [] }
  function resetPreset() { if (options.canWrite && !options.canWrite()) return; config.value = restoreViewerPreset(JSON.parse(serializeViewerConfig(config.value))); issues.value = [] }
  async function save(): Promise<boolean> {
    if (saving.value || issues.value.length || (options.canWrite && !options.canWrite())) return false
    saving.value = true; error.value = ''
    try {
      const snapshot = serializeViewerConfig(config.value), presetName = config.value.presetName
      const response = await request(`/api/galleries/${encodeURIComponent(galleryId)}/viewer-config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configJson: snapshot, presetName, schemaVersion: 1 }) })
      if (!response.ok) throw new Error('草稿保存失败，请检查权限或稍后重试。')
      savedJson.value = snapshot; return true
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '草稿保存失败，请重试。'; return false }
    finally { saving.value = false }
  }
  return { config, issues, savedJson, dirty, saving, error, load, replace, patch, preset, resetPreset, save }
}
