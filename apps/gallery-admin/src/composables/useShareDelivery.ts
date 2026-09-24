import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import type { Gallery, ShareLink } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

export function formatRemaining(expiresAt?: string | null): string {
  if (!expiresAt) return '永久有效'
  const exp = new Date(expiresAt).getTime()
  if (Number.isNaN(exp)) return '永久有效'
  const now = Date.now()
  const diffMs = exp - now
  if (diffMs <= 0) return '已过期'
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (days > 0) return `剩余 ${days} 天 ${hours} 小时`
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000))
  return `剩余 ${hours} 小时 ${minutes} 分钟`
}

export function formatLastAccessed(lastAccessedAt?: string | null): string {
  if (!lastAccessedAt) return '尚未访问'
  const date = new Date(lastAccessedAt)
  if (Number.isNaN(date.getTime())) return '尚未访问'
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (60 * 1000))
  if (diffMinutes < 5) return '刚刚访问'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays <= 7) return `${diffDays} 天前`
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatShareDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

export function useShareDelivery(
  galleryId: MaybeRefOrGetter<string>,
  gallery: MaybeRefOrGetter<Gallery | null>
) {
  const id = computed(() => toValue(galleryId))
  const currentGallery = computed(() => toValue(gallery))

  const shareLinks = ref<ShareLink[]>([])
  const loading = ref(false)
  const generating = ref(false)
  const revoking = ref(false)
  const savingPassword = ref(false)
  const latestCreatedLink = ref<{
    id: string
    shareUrl: string
    shortUrl: string | null
    expiresAt?: string
    rawToken?: string
  } | null>(null)
  const shortUrls = ref<Record<string, string>>({})
  const error = ref<string | null>(null)

  function viewerBaseUrl(slug: string) {
    const isLocal = ['5173', '5174', '5175'].includes(window.location.port) &&
      ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    const port = isLocal ? ':5174' : (window.location.port ? `:${window.location.port}` : '')
    return `${window.location.protocol}//${window.location.hostname}${port}/g/${slug}`
  }

  function shareUrlWithToken(base: string, rawToken?: string) {
    return rawToken ? `${base}?t=${encodeURIComponent(rawToken)}` : base
  }

  function normalizeShareUrl(url: string, slug: string, rawToken?: string): string {
    // 本地开发时后端返回的是 gallery.public.base-url 配置的域名（默认是生产占位域），
    // 直接改端口会拼出"生产域名 + 开发端口"的不可用链接，因此整条链接按当前窗口重建。
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return shareUrlWithToken(viewerBaseUrl(slug), rawToken)
    }
    if (url) return url
    return shareUrlWithToken(viewerBaseUrl(slug), rawToken)
  }

  async function loadShareLinks() {
    const galleryIdValue = id.value
    if (!galleryIdValue) return
    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/share-links`)
      if (!response.ok) throw new Error('分享链接列表加载失败。')
      shareLinks.value = await response.json() as ShareLink[]
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '分享链接加载失败。'
    } finally {
      loading.value = false
    }
  }

  /**
   * 为分享链接生成短链接（幂等），失败时返回 null 并降级使用完整链接。
   */
  async function ensureShortLink(shareLinkId: string): Promise<string | null> {
    const cached = shortUrls.value[shareLinkId]
    if (cached) return cached
    try {
      const response = await apiFetch(`/api/share-links/${shareLinkId}/short-url`, { method: 'POST' })
      if (!response.ok) return null
      const data = await response.json() as { shortCode: string; shortUrl: string }
      if (!data.shortUrl) return null
      shortUrls.value = { ...shortUrls.value, [shareLinkId]: data.shortUrl }
      return data.shortUrl
    } catch {
      return null
    }
  }

  async function createShareLink(expiryDays: number = 30): Promise<string> {
    const g = currentGallery.value
    if (!g) throw new Error('展厅信息未就绪。')
    generating.value = true
    error.value = null
    try {
      const requestBody: Record<string, string> = {}
      if (expiryDays > 0) {
        requestBody.expiresAt = new Date(Date.now() + expiryDays * 86_400_000).toISOString()
      }
      const response = await apiFetch(`/api/galleries/${g.id}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      if (!response.ok) throw new Error('生成分享链接失败。')
      const data = await response.json() as {
        id?: string
        shareUrl?: string
        rawToken?: string
        expiresAt?: string
      }
      const finalUrl = normalizeShareUrl(data.shareUrl || '', g.slug, data.rawToken)
      // 短链接生成失败时静默降级：确认框仍然展示完整链接
      let shortUrl: string | null = null
      if (data.id) {
        shortUrl = await ensureShortLink(data.id)
      }
      latestCreatedLink.value = {
        id: data.id || '',
        shareUrl: finalUrl,
        shortUrl,
        expiresAt: data.expiresAt,
        rawToken: data.rawToken
      }
      await loadShareLinks()
      return finalUrl
    } finally {
      generating.value = false
    }
  }

  async function revokeShareLink(shareLinkId: string) {
    revoking.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/share-links/${shareLinkId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('撤销分享链接失败。')
      await loadShareLinks()
    } finally {
      revoking.value = false
    }
  }

  async function setGalleryPassword(password: string) {
    const galleryIdValue = id.value
    if (!galleryIdValue) return
    savingPassword.value = true
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || '设置相册密码失败，密码至少需要 6 个字符。')
      }
    } finally {
      savingPassword.value = false
    }
  }

  async function clearGalleryPassword() {
    const galleryIdValue = id.value
    if (!galleryIdValue) return
    savingPassword.value = true
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/password`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('清除相册密码失败。')
    } finally {
      savingPassword.value = false
    }
  }

  async function updateGalleryVisibility(visibility: 'PUBLIC' | 'PRIVATE' | 'PASSWORD') {
    const galleryIdValue = id.value
    if (!galleryIdValue) return
    const response = await apiFetch(`/api/galleries/${galleryIdValue}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility })
    })
    if (!response.ok) throw new Error('更新相册访问权限失败。')
  }

  return {
    shareLinks,
    loading,
    generating,
    revoking,
    savingPassword,
    latestCreatedLink,
    shortUrls,
    error,
    loadShareLinks,
    createShareLink,
    ensureShortLink,
    revokeShareLink,
    setGalleryPassword,
    clearGalleryPassword,
    updateGalleryVisibility
  }
}
