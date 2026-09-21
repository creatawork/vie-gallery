const csrfState = { token: '' }
const REQUEST_TIMEOUT_MS = 30_000  // 通用请求超时 30 秒
const UPLOAD_TIMEOUT_MS = 120_000  // 文件上传超时 120 秒（足够处理大文件和后端图片处理）

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
