let csrfRequest: Promise<string> | null = null
const WORKSPACE_KEY = 'vie-active-workspace'
let activeWorkspaceId: string | null | undefined

export function getActiveWorkspaceId(): string | null {
  if (activeWorkspaceId === undefined) {
    try { activeWorkspaceId = sessionStorage.getItem(WORKSPACE_KEY) } catch { activeWorkspaceId = null }
  }
  return activeWorkspaceId
}

export function setActiveWorkspaceId(id: string | null) {
  activeWorkspaceId = id
  try {
    if (id) sessionStorage.setItem(WORKSPACE_KEY, id)
    else sessionStorage.removeItem(WORKSPACE_KEY)
  } catch { /* Workspace selection still works when browser storage is unavailable. */ }
}
const REQUEST_TIMEOUT_MS = 30_000  // 通用请求超时 30 秒
const UPLOAD_TIMEOUT_MS = 120_000  // 文件上传超时 120 秒（足够处理大文件和后端图片处理）
const SINGLE_FILE_TIMEOUT_MS = 300_000  // 逐文件上传超时 300 秒：单文件最大 50MB，慢速网络也需要余量

function readCookie(name: string): string | undefined {
  const value = document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))?.slice(name.length + 1)
  if (!value) return undefined
  try { return decodeURIComponent(value) } catch { return undefined }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  if (init.signal?.aborted) abort()

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error('请求超时，请检查网络连接后重试。')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
    init.signal?.removeEventListener('abort', abort)
  }
}

export async function csrfToken(forceRefresh = false): Promise<string> {
  if (csrfRequest) return csrfRequest
  // Cookie 会随退出登录或其他标签页的操作变化，不能长期缓存其副本。
  const cookieToken = readCookie('XSRF-TOKEN')
  if (!forceRefresh && cookieToken) return cookieToken

  csrfRequest = (async () => {
    const response = await fetchWithTimeout('/api/auth/csrf', {
      credentials: 'include', cache: 'no-store'
    }, REQUEST_TIMEOUT_MS)
    if (!response.ok) throw new Error('无法建立安全连接，请刷新后重试。')
    const body = await response.json() as { token?: unknown }
    if (typeof body.token !== 'string' || !body.token) {
      throw new Error('无法建立安全连接，请刷新后重试。')
    }
    return body.token
  })().finally(() => { csrfRequest = null })
  return csrfRequest
}

async function isCsrfFailure(response: Response): Promise<boolean> {
  if (response.status !== 403) return false
  const body = await response.clone().json().catch(() => null) as { code?: string } | null
  return body?.code === 'CSRF_INVALID'
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const request = input instanceof Request ? input : undefined
  const method = (init.method || request?.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers ?? request?.headers)
  const workspaceId = getActiveWorkspaceId()
  const pathname = new URL(request?.url ?? input.toString(), 'http://gallery.local').pathname
  const workspaceScoped = !pathname.startsWith('/api/auth/') && pathname !== '/api/me/workspaces'
  if (workspaceId && workspaceScoped && !headers.has('X-Workspace-Id')) headers.set('X-Workspace-Id', workspaceId)
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (isMutating) headers.set('X-XSRF-TOKEN', await csrfToken())

  // 检测是否为文件上传请求（body 是 FormData）
  const isFileUpload = init.body instanceof FormData
  const timeout = isFileUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  const canRetry = isMutating && !(init.body instanceof ReadableStream)
  const retryInput = canRetry && request ? request.clone() : input

  const response = await fetchWithTimeout(input, { ...init, headers, credentials: 'include' }, timeout)
  if (canRetry && !init.signal?.aborted && await isCsrfFailure(response)) {
    // CSRF 过滤器在业务处理前拒绝请求，刷新令牌后只重试一次。
    headers.set('X-XSRF-TOKEN', await csrfToken(true))
    if (init.signal?.aborted) return response
    return fetchWithTimeout(retryInput, { ...init, headers, credentials: 'include' }, timeout)
  }
  return response
}

export interface UploadFileOptions {
  headers?: Record<string, string>
  onProgress?: (loaded: number, total: number) => void
}

/**
 * 用 XHR 上传单个请求体（fetch 无法读取上传进度），返回与 apiFetch 一致的 Response，
 * 便于调用方复用 response.ok / response.json() 的错误处理模式。
 */
export async function uploadFileWithProgress(
  url: string,
  body: FormData,
  options: UploadFileOptions = {}
): Promise<Response> {
  const workspaceId = getActiveWorkspaceId()
  const token = await csrfToken()
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.timeout = SINGLE_FILE_TIMEOUT_MS
    if (token) xhr.setRequestHeader('X-XSRF-TOKEN', token)
    if (workspaceId) xhr.setRequestHeader('X-Workspace-Id', workspaceId)
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) options.onProgress?.(event.loaded, event.total)
    }
    xhr.onload = () => {
      const response = new Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: { 'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json' }
      })
      resolve(response)
    }
    xhr.onerror = () => reject(new TypeError('Failed to fetch'))
    xhr.ontimeout = () => reject(new Error('请求超时，请检查网络连接后重试。'))
    xhr.onabort = () => reject(new Error('上传已取消。'))
    xhr.send(body)
  })
}
