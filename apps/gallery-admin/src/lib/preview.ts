import { apiFetch } from '../api'

export interface PreviewToken {
  token: string
  expiresAt: string
}

export function viewerOrigin() {
  if (import.meta.env.VITE_VIEWER_ORIGIN) return new URL(import.meta.env.VITE_VIEWER_ORIGIN).origin
  const { protocol, hostname, port } = window.location
  // 仅开发端口下 viewer 固定运行在 5174；
  // 其余场景（生产任意端口）viewer 与管理端同源同端口，
  // 丢弃端口会导致 iframe 指向默认端口而握手失败。
  if (import.meta.env.DEV && ['5173', '5174', '5175', '15173'].includes(port)) {
    return `${protocol}//${hostname}:${port === '15173' ? '15174' : '5174'}`
  }
  return window.location.origin
}

export function creatorPreviewUrl(slug: string, token: string, embed = false) {
  const url = new URL(`${viewerOrigin()}/g/${encodeURIComponent(slug)}`)
  url.searchParams.set('preview', token)
  if (embed) url.searchParams.set('embed', 'preview')
  return url.toString()
}

export async function issuePreviewToken(galleryId: string): Promise<PreviewToken> {
  const response = await apiFetch(`/api/galleries/${encodeURIComponent(galleryId)}/preview-token`, {
    method: 'POST'
  })
  if (response.status === 401) {
    throw new Error('登录已失效，请重新登录后再预览。')
  }
  if (response.status === 403) {
    throw new Error('你没有权限预览这个展厅。')
  }
  if (response.status === 404) {
    throw new Error('找不到这个展厅，可能已被移除。')
  }
  if (!response.ok) {
    throw new Error('暂时无法打开内部预览，请稍后重试。')
  }
  return await response.json() as PreviewToken
}

export async function openCreatorPreview(galleryId: string, slug: string, embed = false) {
  const issued = await issuePreviewToken(galleryId)
  const url = creatorPreviewUrl(slug, issued.token, embed)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) throw new Error('浏览器拦截了新窗口，请允许弹窗后再试。')
  return issued
}
