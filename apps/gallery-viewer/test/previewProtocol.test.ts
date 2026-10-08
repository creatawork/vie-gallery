import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultViewerConfig } from '@vie/gallery-contracts'
import { createViewerPreviewChannel, isTrustedPreviewMessage } from '../../gallery-admin/src/lib/viewerPreviewChannel'
import { useViewerConfigEditor } from '../../gallery-admin/src/composables/useViewerConfigEditor'

const originalFrame = globalThis.requestAnimationFrame, originalCancelFrame = globalThis.cancelAnimationFrame
before(() => {
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle)
})
after(() => {
  globalThis.requestAnimationFrame = originalFrame
  globalThis.cancelAnimationFrame = originalCancelFrame
})

test('manual reapply resends an unchanged bootstrapped config with a fresh sequence', async () => {
  const sent: any[] = [], source = { postMessage: (message: unknown) => sent.push(message) } as unknown as Window
  const iframe = { src: 'http://localhost:15174/g/test', contentWindow: source } as HTMLIFrameElement
  const channel = createViewerPreviewChannel(iframe, () => {})
  const event = (type: string, sequence = 0) => ({ source, origin: 'http://localhost:15174', data: { type, sequence } }) as MessageEvent
  try {
    const config = createDefaultViewerConfig(), initial = channel.send(config)
    channel.accept(event('VIE_PREVIEW_BOOTSTRAP_REQUEST'))
    channel.accept(event('VIE_PREVIEW_BOOTSTRAP_APPLIED', initial))
    channel.accept(event('VIE_PREVIEW_READY'))
    assert.equal(channel.send(config), initial)
    assert.equal(sent.length, 1)
    const reapplied = channel.send(config, { force: true })
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.ok(reapplied > initial)
    assert.equal(sent.at(-1).type, 'VIE_CONFIG_UPDATE')
    assert.equal(sent.at(-1).sequence, reapplied)
    assert.deepEqual(sent.at(-1).config, config)
  } finally { channel.dispose() }
})

test('manual reapply can recover after all automatic retries time out', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const sent: any[] = [], applied: any[] = [], source = { postMessage: (message: unknown) => sent.push(message) } as unknown as Window
  const iframe = { src: 'http://localhost:15174/g/test', contentWindow: source } as HTMLIFrameElement
  const channel = createViewerPreviewChannel(iframe, message => applied.push(message))
  const event = (type: string, sequence = 0) => ({ source, origin: 'http://localhost:15174', data: { type, sequence, effectiveQuality: 'mid', reason: null } }) as MessageEvent
  try {
    const config = createDefaultViewerConfig()
    channel.send(config)
    channel.accept(event('VIE_PREVIEW_READY'))
    for (let i = 0; i < 3; i++) t.mock.timers.tick(1200)
    assert.equal(sent.length, 3)
    assert.equal(applied.length, 1)
    assert.equal(typeof applied[0].error, 'string')
    const timedOutSequence = sent.at(-1).sequence
    const retrySequence = channel.send(config, { force: true })
    t.mock.timers.tick(0)
    assert.ok(retrySequence > timedOutSequence)
    assert.equal(sent.length, 4)
    channel.accept(event('VIE_CONFIG_APPLIED', timedOutSequence))
    assert.equal(applied.length, 1)
    channel.accept(event('VIE_CONFIG_APPLIED', retrySequence))
    assert.equal(applied.length, 2)
    assert.equal(applied[1].error, undefined)
    t.mock.timers.tick(5000)
    assert.equal(sent.length, 4)
  } finally { channel.dispose() }
})

test('preview checks exact origin and source, rejects stale receipts and disposes pending messages', async () => {
  const sent: any[] = [], source = { postMessage: (...args: any[]) => sent.push(args) } as unknown as Window
  const iframe = { src: 'http://localhost:15174/g/test', contentWindow: source } as HTMLIFrameElement
  const applied: any[] = [], channel = createViewerPreviewChannel(iframe, message => applied.push(message))
  const event = (type: string, sequence = 0, origin = 'http://localhost:15174', eventSource = source) => ({ source: eventSource, origin, data: { type, sequence, effectiveQuality: 'mid', reason: null } }) as MessageEvent
  assert.equal(isTrustedPreviewMessage(event('x', 0, 'http://localhost:15173'), source, 'http://localhost:15174'), false)
  assert.equal(isTrustedPreviewMessage(event('x', 0, 'null'), source, 'http://localhost:15174'), false)
  assert.equal(isTrustedPreviewMessage(event('x', 0, undefined, {} as Window), source, 'http://localhost:15174'), false)
  const config = createDefaultViewerConfig()
  channel.send(config); channel.accept(event('VIE_PREVIEW_READY', 0, 'http://localhost:15173'))
  assert.equal(sent.length, 0)
  channel.accept(event('VIE_PREVIEW_READY'))
  assert.equal(sent.length, 1)
  for (let i = 0; i < 20; i++) channel.send({ ...config, quality: i === 19 ? 'low' : 'high' })
  channel.accept(event('VIE_CONFIG_APPLIED', 1)); assert.equal(applied.length, 0)
  await new Promise(resolve => setTimeout(resolve, 160))
  assert.equal(sent.at(-1)[0].config.quality, 'low')
  assert.equal(sent.at(-1)[1], 'http://localhost:15174')
  channel.accept(event('VIE_CONFIG_APPLIED', sent.at(-1)[0].sequence)); assert.equal(applied.length, 1)
  Object.defineProperty(iframe, 'contentWindow', { value: {} })
  channel.accept(event('VIE_CONFIG_APPLIED', sent.at(-1)[0].sequence)); assert.equal(applied.length, 1)
  channel.send(config); channel.dispose()
  await new Promise(resolve => setTimeout(resolve, 160))
  assert.equal(sent.length, 2)
})

test('editor keeps extensions, invalid inputs and edits made during an in-flight save', async () => {
  let finish!: (response: Response) => void, puts = 0
  const editor = useViewerConfigEditor('fixture', { request: async (_url, init) => {
    if (init?.method === 'PUT') { puts++; return new Promise<Response>(resolve => finish = resolve) }
    return Response.json({ configJson: JSON.stringify({ quality: 'high', visitorAllowDownload: true, extension: { future: 42 }, audio: { bgm: { enabled: true } } }) })
  } })
  await editor.load()
  editor.preset('film-gallery'); assert.equal(editor.config.value.quality, 'high')
  assert.deepEqual(editor.config.value.extension, { future: 42 })
  editor.patch({ layout: { params: { spacing: 1.5 } } }); assert.equal(editor.config.value.customized, true)
  editor.patch({ background: { color: 'red' } }); assert.equal(editor.issues.value[0].path, 'background.color')
  assert.equal(await editor.save(), false); assert.equal(puts, 0)
  editor.patch({ background: { color: '#112233' } })
  const saving = editor.save()
  editor.patch({ layout: { params: { spacing: 2 } } })
  finish(Response.json({})); assert.equal(await saving, true); assert.equal(editor.dirty.value, true)
  editor.resetPreset(); assert.equal(editor.config.value.visitorAllowDownload, true)
  assert.equal(editor.config.value.audio.bgm?.enabled, true)
  assert.equal(editor.config.value.customized, false)
})

test('iframe document reload reboots the latest draft and rejects receipts from the old document', async () => {
  const sent: any[] = [], applied: any[] = [], ready: boolean[] = []
  const source = { postMessage: (message: unknown) => sent.push(message) } as unknown as Window
  const iframe = { src: 'http://localhost:15174/g/test', contentWindow: source } as HTMLIFrameElement
  const channel = createViewerPreviewChannel(iframe, message => applied.push(message), value => ready.push(value))
  const event = (type: string, sequence = 0) => ({ source, origin: 'http://localhost:15174', data: { type, sequence, effectiveQuality: 'mid', reason: null } }) as MessageEvent
  try {
    const initial = channel.send(createDefaultViewerConfig())
    channel.accept(event('VIE_PREVIEW_BOOTSTRAP_REQUEST'))
    channel.accept(event('VIE_PREVIEW_BOOTSTRAP_APPLIED', initial))
    channel.accept(event('VIE_PREVIEW_READY'))
    const edited = channel.send({ ...createDefaultViewerConfig(), quality: 'low' })
    // Navigation preserves the iframe's WindowProxy. The pending edit belongs to
    // the old document, but its draft must survive into the new handshake.
    channel.accept(event('VIE_PREVIEW_BOOTSTRAP_REQUEST'))
    const bootstrap = sent.at(-1)
    assert.equal(bootstrap.type, 'VIE_PREVIEW_BOOTSTRAP')
    assert.equal(bootstrap.config.quality, 'low')
    assert.ok(bootstrap.sequence > edited)
    channel.accept(event('VIE_CONFIG_APPLIED', edited))
    channel.accept(event('VIE_PREVIEW_BOOTSTRAP_APPLIED', initial))
    channel.accept(event('VIE_PREVIEW_READY'))
    assert.equal(ready.at(-1), false)
    assert.equal(sent.at(-1).type, 'VIE_CONFIG_UPDATE')
    channel.accept(event('VIE_CONFIG_APPLIED', bootstrap.sequence))
    assert.equal(applied.length, 1)
    await new Promise(resolve => setTimeout(resolve, 160))
    assert.equal(sent.length, 3)
  } finally { channel.dispose() }
})
