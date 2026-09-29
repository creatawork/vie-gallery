import { computed, ref } from 'vue'
import {
  defaultBrandSiteConfig,
  type BrandSiteConfig,
  type BrandSiteStatus
} from '@vie/gallery-contracts'
import { apiFetch } from '../api'

export interface BrandSiteAdminState {
  siteId: string
  subdomain?: string | null
  status: BrandSiteStatus | string
  enabled: boolean
  config: BrandSiteConfig
  createdAt?: string
  updatedAt?: string
  lastPublishedAt?: string | null
  publishedVersionId?: string | null
  hasUnpublishedChanges?: boolean
}

export interface BrandSiteVersionItem {
  id: string
  configJson: string
  templateId?: string | null
  schemaVersion: number
  createdAt: string
  createdByUserId?: string | null
}

/**
 * 品牌站工作区数据层：GET 自动开通站点（首版每账号一站），草稿自动保存，
 * 发布/版本/回滚对齐 usePublishCenter 的交互形态。API 不可用时降级为本地演示态。
 */
export function useBrandSite() {
  const site = ref<BrandSiteAdminState | null>(null)
  const versions = ref<BrandSiteVersionItem[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const publishing = ref(false)
  const loadError = ref<string | null>(null)
  const demoMode = ref(false)

  let demoConfig: BrandSiteConfig | null = null

  const config = computed<BrandSiteConfig>(() => site.value?.config ?? demoConfig ?? defaultBrandSiteConfig())

  async function load(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      const res = await apiFetch('/api/brand-site')
      if (res.status === 401) {
        loadError.value = '登录已失效，请重新登录。'
        return
      }
      if (!res.ok) {
        throw new Error(`加载品牌站失败（${res.status}）`)
      }
      site.value = (await res.json()) as BrandSiteAdminState
      demoMode.value = false
    } catch {
      // API 未部署 / 网络不可达：进入演示模式，界面可看可编辑，不落库
      demoMode.value = true
      if (!demoConfig) demoConfig = defaultBrandSiteConfig('演示品牌站')
      site.value = {
        siteId: 'demo',
        subdomain: 'demo',
        status: 'TRIAL',
        enabled: true,
        config: demoConfig,
        hasUnpublishedChanges: true
      }
    } finally {
      loading.value = false
    }
  }

  async function saveDraft(next: BrandSiteConfig): Promise<boolean> {
    const body = { configJson: JSON.stringify(next), schemaVersion: 1 }
    if (demoMode.value) {
      demoConfig = next
      if (site.value) {
        site.value = { ...site.value, config: next, hasUnpublishedChanges: true }
      }
      return true
    }
    saving.value = true
    try {
      const res = await apiFetch('/api/brand-site/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail ? `保存失败：${detail}` : `保存失败（${res.status}）`)
      }
      site.value = (await res.json()) as BrandSiteAdminState
      return true
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : '保存草稿失败'
      return false
    } finally {
      saving.value = false
    }
  }

  async function publish(): Promise<boolean> {
    if (demoMode.value) {
      loadError.value = '演示模式：API 未连接，发布不可用'
      return false
    }
    publishing.value = true
    try {
      const res = await apiFetch('/api/brand-site/publish', { method: 'POST' })
      if (!res.ok) throw new Error(`发布失败（${res.status}）`)
      await Promise.all([load(), loadVersions()])
      return true
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : '发布失败'
      return false
    } finally {
      publishing.value = false
    }
  }

  async function loadVersions(): Promise<void> {
    if (demoMode.value) return
    try {
      const res = await apiFetch('/api/brand-site/versions?page=0&pageSize=20')
      if (!res.ok) return
      const page = (await res.json()) as { items: BrandSiteVersionItem[] }
      versions.value = page.items ?? []
    } catch {
      /* 版本列表加载失败不阻塞编辑 */
    }
  }

  async function rollback(versionId: string): Promise<boolean> {
    if (demoMode.value) return false
    try {
      const res = await apiFetch('/api/brand-site/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId })
      })
      if (!res.ok) throw new Error(`回滚失败（${res.status}）`)
      await Promise.all([load(), loadVersions()])
      return true
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : '回滚失败'
      return false
    }
  }

  async function updateSettings(payload: { subdomain?: string; enabled?: boolean; status?: string }): Promise<boolean> {
    if (demoMode.value) {
      if (site.value) {
        site.value = {
          ...site.value,
          subdomain: payload.subdomain ?? site.value.subdomain,
          status: (payload.status as BrandSiteStatus) ?? site.value.status,
          enabled: payload.enabled ?? site.value.enabled
        }
      }
      return true
    }
    try {
      const res = await apiFetch('/api/brand-site/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `更新设置失败（${res.status}）`)
      }
      site.value = (await res.json()) as BrandSiteAdminState
      return true
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : '更新设置失败'
      return false
    }
  }

  async function uploadLogo(file: File): Promise<{ logoStorageObjectId: string; logoUrl: string } | null> {
    if (demoMode.value) {
      loadError.value = '演示模式：Logo 上传不可用'
      return null
    }
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await apiFetch('/api/brand-site/logo', { method: 'POST', body: form })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `Logo 上传失败（${res.status}）`)
      }
      return (await res.json()) as { logoStorageObjectId: string; logoUrl: string }
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Logo 上传失败'
      return null
    }
  }

  return {
    site,
    config,
    versions,
    loading,
    saving,
    publishing,
    loadError,
    demoMode,
    load,
    saveDraft,
    publish,
    loadVersions,
    rollback,
    updateSettings,
    uploadLogo
  }
}
