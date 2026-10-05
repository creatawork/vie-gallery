import test from 'node:test'
import assert from 'node:assert/strict'
import { useViewerState } from '../src/composables/useViewerState'
test('unlock reloads current configuration and expiry revokes photos and download permission', async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  Object.assign(globalThis, { window: { location: { search: '', hash: '' } } })
  let unlocked = false, expired = false, configurations = 0
  globalThis.fetch = async url => {
    const path = String(url)
    if (path.endsWith('/unlock')) { unlocked = true; return Response.json({ unlocked: true }) }
    if (path.includes('/photos')) return expired ? Response.json({ code: 'PUBLIC_SESSION_EXPIRED' }, { status: 401 }) : Response.json({ items: [{ title: 'private', width: 100, height: 100, thumbnailUrl: null, sortOrder: 0 }], page: 0, pageSize: 1, total: 2 })
    if (path.endsWith('/viewer-config')) { configurations++; return Response.json({ configJson: JSON.stringify({ visitorAllowDownload: true }) }) }
    return Response.json({ title: 'private', accessState: unlocked ? 'READY' : 'PASSWORD_REQUIRED', visibility: 'PASSWORD' })
  }
  try {
    const viewer = useViewerState('private')
    await viewer.initialize(); assert.equal(configurations, 0); assert.equal(viewer.allowDownload.value, false)
    assert.equal(await viewer.unlock('fixture-password'), true)
    assert.equal(configurations, 1); assert.equal(viewer.allowDownload.value, true)
    assert.equal(viewer.gallery.value?.accessState, 'READY')
    expired = true; await viewer.loadMore()
    assert.equal(viewer.state.value, 'password_prompt'); assert.equal(viewer.allowDownload.value, false)
    assert.equal(viewer.photos.value.length, 0)
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow }
})
test('late config from a previous initialization cannot restore download access', async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  Object.assign(globalThis, { window: { location: { search: '', hash: '' } } })
  let finish!: (response: Response) => void, galleryRequests = 0
  globalThis.fetch = async url => {
    if (String(url).endsWith('/viewer-config')) return new Promise<Response>(resolve => finish = resolve)
    if (String(url).includes('/photos')) return Response.json({ items: [], page: 0, pageSize: 50, total: 0 })
    return Response.json({ accessState: ++galleryRequests === 1 ? 'READY' : 'PASSWORD_REQUIRED' })
  }
  try {
    const viewer = useViewerState('private'), first = viewer.initialize()
    for (let i = 0; i < 20 && !finish; i++) await Promise.resolve()
    await viewer.initialize()
    finish(Response.json({ configJson: '{"visitorAllowDownload":true}' })); await first
    assert.equal(viewer.state.value, 'password_prompt'); assert.equal(viewer.allowDownload.value, false)
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow }
})
