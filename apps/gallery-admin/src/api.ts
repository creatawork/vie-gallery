const csrfState = { token: '' }
const REQUEST_TIMEOUT_MS = 30_000  // 通用请求超时 30 秒
const UPLOAD_TIMEOUT_MS = 120_000  // 文件上传超时 120 秒（足够处理大文件和后端图片处理）
const SINGLE_FILE_TIMEOUT_MS = 300_000  // 逐文件上传超时 300 秒：单文件最大 50MB，慢速网络也需要余量

function readCookie(name: string): string | undefined {
  return document.cookie.split('; ').find(value => value.startsWith(`${name}=`))?.split('=').slice(1).join('=')
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })

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

export async function csrfToken(): Promise<string> {
  if (!csrfState.token) {
    const response = await fetchWithTimeout('/api/auth/csrf', { credentials: 'include' }, REQUEST_TIMEOUT_MS)
    if (!response.ok) throw new Error('无法建立安全连接，请刷新后重试。')
    const body = await response.json() as { token: string }
    csrfState.token = body.token
  }
  return csrfState.token || readCookie('XSRF-TOKEN') || ''
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (isMutating) headers.set('X-XSRF-TOKEN', await csrfToken())

  // 检测是否为文件上传请求（body 是 FormData）
  const isFileUpload = init.body instanceof FormData
  const timeout = isFileUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS

  const response = isMutating
    ? await fetchWithTimeout(input, { ...init, headers, credentials: 'include' }, timeout)
    : await fetch(input, { ...init, headers, credentials: 'include' })
  if (response.status === 403 && isMutating) {
    csrfState.token = ''
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
  const token = await csrfToken()
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.timeout = SINGLE_FILE_TIMEOUT_MS
    if (token) xhr.setRequestHeader('X-XSRF-TOKEN', token)
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
      if (xhr.status === 403) csrfState.token = ''
      resolve(response)
    }
    xhr.onerror = () => reject(new TypeError('Failed to fetch'))
    xhr.ontimeout = () => reject(new Error('请求超时，请检查网络连接后重试。'))
    xhr.onabort = () => reject(new Error('上传已取消。'))
    xhr.send(body)
  })
}
