import test from 'node:test'
import assert from 'node:assert/strict'
import { apiFetch, csrfToken } from '../src/api'

test('CSRF follows browser cookies and recovers rejected registrations', async t => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  let cookie = ''
  Object.assign(globalThis, {
    window: { setTimeout, clearTimeout },
    document: { get cookie() { return cookie } }
  })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  })
  const register = () => apiFetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'creator@example.com', password: 'abc123', displayName: 'Creator' })
  })
  try {
    await t.test('registration after logout obtains a new token when its cookie was deleted', async () => {
      cookie = ''
      let generations = 0
      globalThis.fetch = async (input, init) => {
        if (input === '/api/auth/csrf') {
          const token = `token-${++generations}`
          cookie = `XSRF-TOKEN=${token}`
          return json({ token })
        }
        if (input === '/api/auth/logout') {
          cookie = ''
          return new Response(null, { status: 204 })
        }
        assert.equal(new Headers(init?.headers).get('X-XSRF-TOKEN'), 'token-2')
        return json({ user: { displayName: 'Creator' } }, 201)
      }
      await csrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
      assert.equal((await register()).status, 201)
      assert.equal(generations, 2)
    })

    await t.test('uses a token rotated in another tab, including URL-encoded cookies', async () => {
      cookie = 'other=value;XSRF-TOKEN=rotated%2Btoken%3D'
      globalThis.fetch = async (input, init) => {
        assert.equal(input, '/api/auth/register')
        assert.equal(new Headers(init?.headers).get('X-XSRF-TOKEN'), 'rotated+token=')
        return json({}, 201)
      }
      assert.equal((await register()).status, 201)
    })

    await t.test('refreshes and retries only once after an explicit CSRF rejection', async () => {
      cookie = 'XSRF-TOKEN=stale'
      const attempts: RequestInit[] = []
      globalThis.fetch = async (input, init) => {
        if (input === '/api/auth/csrf') {
          assert.equal(init?.cache, 'no-store')
          assert.equal(init?.credentials, 'include')
          cookie = 'XSRF-TOKEN=fresh'
          return json({ token: 'fresh' })
        }
        attempts.push(init!)
        if (attempts.length === 1) return json({ code: 'CSRF_INVALID' }, 403)
        assert.equal(new Headers(init?.headers).get('X-XSRF-TOKEN'), 'fresh')
        return json({ user: {} }, 201)
      }
      assert.equal((await register()).status, 201)
      assert.equal(attempts.length, 2)
      assert.equal(attempts[1].body, attempts[0].body)
      assert.equal(new Headers(attempts[1].headers).get('Content-Type'), 'application/json')
    })

    await t.test('leaves permission failures intact and never retries them', async () => {
      cookie = 'XSRF-TOKEN=current'
      let calls = 0
      globalThis.fetch = async () => { calls++; return json({ code: 'ACCESS_DENIED' }, 403) }
      const response = await register()
      assert.equal(response.status, 403)
      assert.deepEqual(await response.json(), { code: 'ACCESS_DENIED' })
      assert.equal(calls, 1)
    })

    await t.test('stops after the second CSRF rejection and preserves the error body', async () => {
      cookie = 'XSRF-TOKEN=current'
      let posts = 0
      let refreshes = 0
      globalThis.fetch = async input => {
        if (input === '/api/auth/csrf') { refreshes++; return json({ token: 'fresh' }) }
        posts++
        return json({ code: 'CSRF_INVALID' }, 403)
      }
      const response = await register()
      assert.deepEqual(await response.json(), { code: 'CSRF_INVALID' })
      assert.equal(posts, 2)
      assert.equal(refreshes, 1)
    })

    await t.test('concurrent initial mutations share the same token request', async () => {
      cookie = ''
      let generations = 0
      globalThis.fetch = async (input, init) => {
        if (input === '/api/auth/csrf') {
          generations++
          await Promise.resolve()
          cookie = 'XSRF-TOKEN=shared'
          return json({ token: 'shared' })
        }
        assert.equal(new Headers(init?.headers).get('X-XSRF-TOKEN'), 'shared')
        return json({}, 201)
      }
      await Promise.all([register(), register()])
      assert.equal(generations, 1)
    })

    await t.test('a consumed Request body is preserved for the CSRF retry', async () => {
      cookie = 'XSRF-TOKEN=current'
      const bodies: string[] = []
      globalThis.fetch = async (input, init) => {
        if (input === '/api/auth/csrf') return json({ token: 'fresh' })
        assert.ok(input instanceof Request)
        bodies.push(await input.text())
        assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json')
        return bodies.length === 1 ? json({ code: 'CSRF_INVALID' }, 403) : json({}, 201)
      }
      const request = new Request('https://gallery.test/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"displayName":"Creator"}'
      })
      assert.equal((await apiFetch(request)).status, 201)
      assert.deepEqual(bodies, ['{"displayName":"Creator"}', '{"displayName":"Creator"}'])
    })

    await t.test('never replays a mutation after a network error', async () => {
      cookie = 'XSRF-TOKEN=current'
      let calls = 0
      globalThis.fetch = async () => { calls++; throw new TypeError('Failed to fetch') }
      await assert.rejects(register(), /Failed to fetch/)
      assert.equal(calls, 1)
    })

    await t.test('token acquisition can recover after a failed response', async () => {
      cookie = ''
      let calls = 0
      globalThis.fetch = async () => {
        calls++
        return calls === 1 ? json({ token: '' }) : json({ token: 'recovered' })
      }
      await assert.rejects(csrfToken(), /无法建立安全连接/)
      assert.equal(await csrfToken(), 'recovered')
    })
  } finally {
    Object.assign(globalThis, { fetch: originalFetch, window: originalWindow, document: originalDocument })
  }
})
