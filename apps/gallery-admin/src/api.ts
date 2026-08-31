const csrfState = { token: '' }

function readCookie(name: string): string | undefined {
  return document.cookie.split('; ').find(value => value.startsWith(`${name}=`))?.split('=').slice(1).join('=')
}

export async function csrfToken(): Promise<string> {
  if (!csrfState.token) {
    const response = await fetch('/api/auth/csrf', { credentials: 'include' })
    if (!response.ok) throw new Error('Unable to initialize CSRF protection')
    const body = await response.json() as { token: string }
    csrfState.token = body.token
  }
  return csrfState.token || readCookie('XSRF-TOKEN') || ''
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-XSRF-TOKEN', await csrfToken())
  const response = await fetch(input, { ...init, headers, credentials: 'include' })
  if (response.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    csrfState.token = ''
  }
  return response
}
