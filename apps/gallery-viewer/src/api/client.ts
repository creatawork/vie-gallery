import type {
  PublicGalleryResponse,
  UnlockResponse,
  PhotoListResponse,
  ApiError
} from '../types/api'

/**
 * 公开 API 客户端
 */
export class PublicApiClient {
  private baseUrl: string
  private shareToken: string | null = null

  constructor(baseUrl: string = '/api/public') {
    this.baseUrl = baseUrl
    // 从 URL 获取分享 token
    const params = new URLSearchParams(window.location.search)
    this.shareToken = params.get('t')
  }

  /**
   * 获取公开相册状态
   */
  async getGallery(slug: string): Promise<PublicGalleryResponse> {
    const headers: Record<string, string> = {}
    if (this.shareToken) {
      headers['X-Share-Token'] = this.shareToken
    }

    const response = await fetch(`${this.baseUrl}/g/${slug}`, { headers })

    if (!response.ok) {
      const error: ApiError = await response.json()
      throw new PublicApiError(error.code, error.message, response.status)
    }

    return response.json()
  }

  /**
   * 解锁密码相册
   */
  async unlock(slug: string, password: string): Promise<UnlockResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (this.shareToken) {
      headers['X-Share-Token'] = this.shareToken
    }

    const response = await fetch(`${this.baseUrl}/g/${slug}/unlock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password }),
      credentials: 'include' // 重要：携带 session cookie
    })

    if (!response.ok) {
      const error: ApiError = await response.json()
      throw new PublicApiError(error.code, error.message, response.status)
    }

    return response.json()
  }

  /**
   * 获取公开照片列表
   */
  async getPhotos(
    slug: string,
    page: number = 0,
    pageSize: number = 50
  ): Promise<PhotoListResponse> {
    const headers: Record<string, string> = {}
    if (this.shareToken) {
      headers['X-Share-Token'] = this.shareToken
    }

    const url = `${this.baseUrl}/g/${slug}/photos?page=${page}&pageSize=${pageSize}`
    const response = await fetch(url, {
      headers,
      credentials: 'include' // 重要：携带 session cookie
    })

    if (!response.ok) {
      const error: ApiError = await response.json()
      throw new PublicApiError(error.code, error.message, response.status)
    }

    return response.json()
  }

  /**
   * 设置分享 token（用于编程式设置）
   */
  setShareToken(token: string | null) {
    this.shareToken = token
  }
}

/**
 * 公开 API 错误
 */
export class PublicApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'PublicApiError'
  }

  /**
   * 是否是相册未找到
   */
  get isNotFound(): boolean {
    return this.code === 'GALLERY_NOT_FOUND' || this.status === 404
  }

  /**
   * 是否需要密码
   */
  get isPasswordRequired(): boolean {
    return this.code === 'PASSWORD_REQUIRED'
  }

  /**
   * 是否需要分享链接
   */
  get isShareLinkRequired(): boolean {
    return this.code === 'SHARE_LINK_REQUIRED'
  }

  /**
   * 是否密码错误
   */
  get isPasswordInvalid(): boolean {
    return this.code === 'PASSWORD_INVALID'
  }

  /**
   * 是否分享链接失效
   */
  get isShareLinkInvalid(): boolean {
    return ['SHARE_LINK_INVALID', 'SHARE_LINK_EXPIRED', 'SHARE_LINK_REVOKED'].includes(this.code)
  }

  /**
   * 是否被限流
   */
  get isRateLimited(): boolean {
    return this.code === 'RATE_LIMITED' || this.status === 429
  }
}
