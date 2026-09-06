import type {
  ApiError,
  PublicGalleryResponse,
  UnlockResponse,
  PhotoListResponse
} from '../types/api'

interface ErrorPayload {
  code?: string
  message?: string
  requestId?: string
  details?: Record<string, unknown>
}

function statusMessage(status: number) {
  if (status === 401) return '访问凭证已失效，请重新解锁。'
  if (status === 403) return '当前凭证无权访问这个空间。'
  if (status === 404) return '找不到这个相册空间。'
  if (status === 409) return '请求与当前空间状态冲突。'
  if (status === 429) return '尝试次数过多，请稍后再试。'
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return '请求失败，请稍后重试。'
}

export async function parseApiError(response: Response): Promise<PublicApiError> {
  let payload: ErrorPayload = {}
  try {
    const parsed = await response.json() as ErrorPayload
    if (parsed && typeof parsed === 'object') payload = parsed
  } catch {
    // Proxies and unavailable services may return HTML or an empty body.
  }

  return new PublicApiError(
    payload.code || `HTTP_${response.status}`,
    payload.message || statusMessage(response.status),
    response.status,
    payload.requestId,
    payload.details
  )
}

function readShareToken() {
  const params = new URLSearchParams(window.location.search)
  const queryToken = params.get('t') || params.get('token')
  if (queryToken) return queryToken

  const hash = window.location.hash
  const match = hash.match(/(?:^#|[&#])s=([^&]+)/)
  if (!match) return null

  return decodeURIComponent(match[1])
}

/**
 * 公开 API 客户端。
 */
export class PublicApiClient {
  private readonly baseUrl: string
  private shareToken: string | null = null

  constructor(baseUrl: string = '/api/public') {
    this.baseUrl = baseUrl
    this.shareToken = readShareToken()
  }

  private headers(contentType?: string) {
    const headers: Record<string, string> = {}
    if (contentType) headers['Content-Type'] = contentType
    if (this.shareToken) headers['X-Share-Token'] = this.shareToken
    return headers
  }

  async getGallery(slug: string): Promise<PublicGalleryResponse> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}`, {
        headers: this.headers(),
        credentials: 'include'
      })
    } catch {
      throw new PublicApiError('NETWORK_ERROR', '网络连接异常，请检查网络后重试。', 0)
    }
    if (!response.ok) throw await parseApiError(response)
    return response.json() as Promise<PublicGalleryResponse>
  }

  async unlock(slug: string, password: string): Promise<UnlockResponse> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}/unlock`, {
        method: 'POST',
        headers: this.headers('application/json'),
        body: JSON.stringify({ password }),
        credentials: 'include'
      })
    } catch {
      throw new PublicApiError('NETWORK_ERROR', '网络连接异常，请检查网络后重试。', 0)
    }
    if (!response.ok) throw await parseApiError(response)
    return response.json() as Promise<UnlockResponse>
  }

  async getPhotos(slug: string, page: number = 0, pageSize: number = 50): Promise<PhotoListResponse> {
    let response: Response
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    try {
      response = await fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}/photos?${params}`, {
        headers: this.headers(),
        credentials: 'include'
      })
    } catch {
      throw new PublicApiError('NETWORK_ERROR', '网络连接异常，请检查网络后重试。', 0)
    }
    if (!response.ok) throw await parseApiError(response)
    return response.json() as Promise<PhotoListResponse>
  }

  async getViewerConfig(slug: string): Promise<any | null> {
    try {
      const response = await fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}/viewer-config`, {
        headers: this.headers(),
        credentials: 'include'
      })
      if (response.ok) return await response.json()
      return null
    } catch {
      return null
    }
  }

  setShareToken(token: string | null) {
    this.shareToken = token
  }
}

/**
 * 公开 API 错误。
 */
export class PublicApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PublicApiError'
  }

  get isNetworkError() { return this.code === 'NETWORK_ERROR' }
  get isNotFound() { return this.code === 'GALLERY_NOT_FOUND' || this.status === 404 }
  get isPasswordRequired() { return this.code === 'PASSWORD_REQUIRED' }
  get isPasswordInvalid() { return this.code === 'PASSWORD_INVALID' }
  get isShareLinkRequired() { return this.code === 'SHARE_LINK_REQUIRED' }
  get isSessionExpired() { return this.code === 'PUBLIC_SESSION_EXPIRED' }
  get isRateLimited() { return this.code === 'RATE_LIMITED' || this.status === 429 }
}

export type { ApiError }
