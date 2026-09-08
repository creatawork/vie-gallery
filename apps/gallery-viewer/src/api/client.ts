import type {
  ApiError,
  PublicGalleryResponse,
  PublicPhotoPage,
  UnlockResponse
} from '../types/api'

export interface ViewerConfigResponse {
  id: string
  galleryId: string
  configJson: string
  enabled: boolean
  presetName?: string | null
  createdAt: string
  updatedAt: string
  schemaVersion?: number
}

type ErrorPayload = Partial<ApiError>

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function statusMessage(status: number) {
  if (status === 400 || status === 422) return '请求参数有误，请检查后重试。'
  if (status === 401) return '访问会话已过期，请重新解锁。'
  if (status === 403) return '当前凭证无权访问这个空间。'
  if (status === 404) return '找不到这个相册空间。'
  if (status === 409) return '请求与当前空间状态冲突。'
  if (status === 429) return '尝试次数过多，请稍后再试。'
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return '请求失败，请稍后重试。'
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function redactValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    return secrets.reduce((result, secret) => secret ? result.split(secret).join('[已隐藏]') : result, value)
  }
  if (Array.isArray(value)) return value.map(item => redactValue(item, secrets))
  if (isRecord(value)) {
    const redacted: JsonRecord = {}
    for (const [key, item] of Object.entries(value)) {
      if (/^(token|rawToken|tokenHash|password|passwordHash|authorization)$/i.test(key)) continue
      redacted[key] = redactValue(item, secrets)
    }
    return redacted
  }
  return value
}

function normalizePayload(value: unknown, secrets: readonly string[] = []): ErrorPayload {
  if (!isRecord(value)) return {}
  const redacted = redactValue(value, secrets)
  if (!isRecord(redacted)) return {}
  return {
    code: readString(redacted.code),
    message: readString(redacted.message),
    requestId: readString(redacted.requestId),
    details: isRecord(redacted.details) ? redacted.details : undefined
  }
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

function parseBody(body: string): unknown {
  if (!body.trim()) return undefined
  try {
    return JSON.parse(body)
  } catch {
    // HTML and malformed proxy responses are represented by the HTTP status.
    return undefined
  }
}

function errorFromBody(response: Response, body: string, secrets: readonly string[] = []) {
  const payload = normalizePayload(parseBody(body), secrets)
  return new PublicApiError(
    payload.code || `HTTP_${response.status}`,
    payload.message || statusMessage(response.status),
    response.status,
    payload.requestId,
    payload.details
  )
}

/**
 * 安全解析公开 API 错误。响应可能是 JSON、代理返回的 HTML，或没有 body。
 */
export async function parseApiError(
  response: Response,
  secrets: readonly string[] = []
): Promise<PublicApiError> {
  return errorFromBody(response, await readBody(response), secrets)
}

async function parseJsonResponse<T>(response: Response, secrets: readonly string[] = []): Promise<T> {
  const body = await readBody(response)
  const parsed = parseBody(body)
  if (parsed === undefined) {
    throw new PublicApiError('INVALID_RESPONSE', '服务返回了无法识别的数据，请稍后重试。', response.status)
  }
  return parsed as T
}

function readShareToken() {
  const params = new URLSearchParams(window.location.search)
  const queryToken = params.get('t') || params.get('token')
  if (queryToken) return queryToken

  const match = window.location.hash.match(/(?:^#|[&#])s=([^&]+)/)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
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

  private async fetch(url: string, init: RequestInit = {}) {
    try {
      return await globalThis.fetch(url, init)
    } catch {
      throw new PublicApiError('NETWORK_ERROR', '网络连接异常，请检查网络后重试。', 0)
    }
  }

  async getGallery(slug: string): Promise<PublicGalleryResponse> {
    const response = await this.fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}`, {
      headers: this.headers(),
      credentials: 'include'
    })
    if (!response.ok) throw await parseApiError(response, this.shareToken ? [this.shareToken] : [])
    return parseJsonResponse<PublicGalleryResponse>(response, this.shareToken ? [this.shareToken] : [])
  }

  async unlock(slug: string, password: string): Promise<UnlockResponse> {
    const response = await this.fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}/unlock`, {
      method: 'POST',
      headers: this.headers('application/json'),
      body: JSON.stringify({ password }),
      credentials: 'include'
    })
    if (!response.ok) throw await parseApiError(response, [password, ...(this.shareToken ? [this.shareToken] : [])])
    return parseJsonResponse<UnlockResponse>(response, this.shareToken ? [this.shareToken] : [])
  }

  async getPhotos(slug: string, page: number = 0, pageSize: number = 50): Promise<PublicPhotoPage> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    const response = await this.fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}/photos?${params}`, {
      headers: this.headers(),
      credentials: 'include'
    })
    if (!response.ok) throw await parseApiError(response, this.shareToken ? [this.shareToken] : [])
    return parseJsonResponse<PublicPhotoPage>(response, this.shareToken ? [this.shareToken] : [])
  }

  /**
   * 读取公开 Viewer 配置。没有配置时由后端返回空 404，此时返回 null；
   * 带错误 body 的 404（例如相册不存在）仍作为错误抛出。
   */
  async getViewerConfig(slug: string): Promise<ViewerConfigResponse | null> {
    const response = await this.fetch(`${this.baseUrl}/g/${encodeURIComponent(slug)}/viewer-config`, {
      headers: this.headers(),
      credentials: 'include'
    })
    const secrets = this.shareToken ? [this.shareToken] : []
    if (response.status === 404) {
      const body = await readBody(response)
      if (!body.trim()) return null
      throw errorFromBody(response, body, secrets)
    }
    if (!response.ok) throw await parseApiError(response, secrets)
    return parseJsonResponse<ViewerConfigResponse>(response, secrets)
  }

  setShareToken(token: string | null) {
    this.shareToken = token
  }
}

/**
 * 公开 API 错误。
 */
export class PublicApiError extends Error implements ApiError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PublicApiError'
    Object.setPrototypeOf(this, new.target.prototype)
  }

  get isNetworkError() { return this.code === 'NETWORK_ERROR' }
  get isNotFound() { return this.code === 'GALLERY_NOT_FOUND' || this.status === 404 }
  get isPasswordRequired() { return this.code === 'PASSWORD_REQUIRED' }
  get isPasswordInvalid() { return this.code === 'PASSWORD_INVALID' }
  get isShareLinkRequired() { return this.code === 'SHARE_LINK_REQUIRED' }
  get isSessionExpired() { return this.code === 'PUBLIC_SESSION_EXPIRED' }
  get isRateLimited() { return this.code === 'RATE_LIMITED' || this.status === 429 }
}

export type { ApiError, ViewerConfigResponse }
