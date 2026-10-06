import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultViewerConfig } from '@vie/gallery-contracts'
import { createViewerPreviewChannel, isTrustedPreviewMessage } from '../../gallery-admin/src/lib/viewerPreviewChannel'
import { useViewerConfigEditor } from '../../gallery-admin/src/composables/useViewerConfigEditor'

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
