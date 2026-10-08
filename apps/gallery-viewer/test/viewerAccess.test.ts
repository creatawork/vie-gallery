import test from 'node:test'
import assert from 'node:assert/strict'
import { useViewerState } from '../src/composables/useViewerState'
import { createDefaultViewerConfig } from '@vie/gallery-contracts'

for (const update of ['bootstrap', 'applied'] as const) test(`photos finishing cannot replace a newer ${update} draft`, async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  Object.assign(globalThis, { window: { location: { search: '?embed=preview', hash: '' }, setTimeout, clearTimeout } })
  let finishPhotos!: (response: Response) => void
  globalThis.fetch = async url => String(url).includes('/photos')
    ? new Promise<Response>(resolve => { finishPhotos = resolve })
    : Response.json({ accessState: 'READY' })
  try {
    const viewer = useViewerState('fixture', { isPreviewEmbed: () => true }), config = createDefaultViewerConfig()
    const loading = viewer.initialize()
    viewer.setConfigSnapshot({ ...config, quality: 'high' })
    for (let i = 0; i < 100 && !finishPhotos; i++) await Promise.resolve()
    assert.equal(typeof finishPhotos, 'function')
    await new Promise(resolve => setTimeout(resolve, 0))
    if (update === 'bootstrap') viewer.setConfigSnapshot({ ...config, quality: 'low' })
    else viewer.setAppliedConfigSnapshot({ ...config, quality: 'low' })
    finishPhotos(Response.json({ items: [], page: 0, pageSize: 50, total: 0 }))
    await loading
    assert.equal(viewer.viewerConfig.value?.quality, 'low')
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow }
})
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

for (const firstLoad of ['initialize', 'unlock'] as const) test(`late EMPTY ${firstLoad} cannot clear a newer ready configuration`, async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  Object.assign(globalThis, { window: { location: { search: '', hash: '' } } })
  let finish!: (response: Response) => void, galleryRequests = 0, configRequests = 0
  globalThis.fetch = async url => {
    const path = String(url)
    if (path.endsWith('/unlock')) return Response.json({ unlocked: true })
    if (path.endsWith('/viewer-config')) return ++configRequests === 1
      ? new Promise<Response>(resolve => finish = resolve)
      : Response.json({ configJson: '{"quality":"low","visitorAllowDownload":true}' })
    if (path.includes('/photos')) return Response.json({ items: [{ title: 'current', thumbnailUrl: null, width: 100, height: 100, sortOrder: 0 }], page: 0, pageSize: 50, total: 1 })
    return Response.json({ accessState: ++galleryRequests === 1 ? 'EMPTY' : 'READY' })
  }
  try {
    const viewer = useViewerState('fixture')
    const first = firstLoad === 'initialize' ? viewer.initialize() : viewer.unlock('fixture-password')
    for (let i = 0; i < 100 && !finish; i++) await Promise.resolve()
    assert.equal(typeof finish, 'function')
    await viewer.initialize()
    finish(Response.json({ configJson: '{"quality":"high"}' })); await first
    assert.equal(viewer.state.value, 'ready')
    assert.equal(viewer.viewerConfig.value?.quality, 'low')
    assert.equal(viewer.allowDownload.value, true)
    assert.equal(viewer.photos.value[0].title, 'current')
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow }
})

test('preview retries use the latest applied draft and reopen the snapshot gate for the new cycle', async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  Object.assign(globalThis, { window: { location: { search: '?preview=fixture&embed=preview', hash: '' } } })
  let configs = 0, finishGallery!: (response: Response) => void, delayGallery = false
  globalThis.fetch = async url => {
    const path = String(url)
    if (path.endsWith('/viewer-config')) { configs++; return Response.json({ configJson: '{"quality":"low"}' }) }
    if (path.includes('/photos')) return Response.json({ items: [], page: 0, pageSize: 50, total: 0 })
    return delayGallery ? new Promise<Response>(resolve => finishGallery = resolve) : Response.json({ accessState: 'READY' })
  }
  try {
    const viewer = useViewerState('fixture'), config = createDefaultViewerConfig()
    assert.equal(viewer.setConfigSnapshot({ ...config, quality: 'high' }), true)
    await viewer.initialize()
    viewer.viewerConfig.value = { ...config, quality: 'mid' }
    await viewer.retry()
    assert.equal(viewer.viewerConfig.value?.quality, 'mid')
    delayGallery = true
    const retry = viewer.retry()
    assert.equal(viewer.setConfigSnapshot({ ...config, quality: 'low' }), true)
    finishGallery(Response.json({ accessState: 'READY' })); await retry
    assert.equal(viewer.viewerConfig.value?.quality, 'low')
    assert.equal(configs, 0)
  } finally { globalThis.fetch = oldFetch; globalThis.window = oldWindow }
})

test('preview session expiry and unlock preserve the latest successfully applied draft', async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  Object.assign(globalThis, { window: { location: { search: '?preview=fixture&embed=preview', hash: '' } } })
  let expired = false, configs = 0
  globalThis.fetch = async url => {
    const path = String(url)
    if (path.endsWith('/unlock')) { expired = false; return Response.json({ unlocked: true }) }
    if (path.endsWith('/viewer-config')) { configs++; return Response.json({ configJson: '{}' }) }
    if (path.includes('/photos')) return expired
      ? Response.json({ code: 'PUBLIC_SESSION_EXPIRED' }, { status: 401 })
      : Response.json({ items: [{ thumbnailUrl: null, title: 'private', width: 100, height: 100, sortOrder: 0 }], page: 0, pageSize: 1, total: 2 })
    return Response.json({ accessState: 'READY', visibility: 'PASSWORD' })
  }
  try {
    const viewer = useViewerState('fixture'), config = createDefaultViewerConfig()
    viewer.setConfigSnapshot({ ...config, quality: 'high' })
    await viewer.initialize()
    viewer.setAppliedConfigSnapshot({ ...config, quality: 'mid', visitorAllowDownload: true })
    expired = true; await viewer.loadMore()
    assert.equal(viewer.viewerConfig.value, null)
    assert.equal(viewer.allowDownload.value, false)
    assert.equal(await viewer.unlock('fixture-password'), true)
    assert.equal(viewer.viewerConfig.value?.quality, 'mid')
    assert.equal(viewer.allowDownload.value, true)
    assert.equal(configs, 0)
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
