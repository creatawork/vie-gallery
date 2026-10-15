import test from 'node:test'
import assert from 'node:assert/strict'
import { ConfigManager } from '../src/core/ConfigManager'
import { normalizeViewerConfig } from '@vie/gallery-contracts'

test('a gallery without server config presents the recommended scene, not a blank default', () => {
  const oldWindow = globalThis.window
  const oldStorage = globalThis.localStorage
  const values = new Map<string, string>()
  Object.assign(globalThis, { window: { location: { search: '', hash: '' } }, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } })
  try {
    const adopted = new ConfigManager().adoptServerSnapshot(null)
    assert.equal(adopted.presetName, 'jade-flow')
    assert.equal(adopted.background?.mode, 'gradient')
    assert.equal(adopted.layout.params?.composition, 'curated')
    assert.equal(adopted.camera?.autoRotate, true)

    // 旧相册（已有服务端配置）完全不受兜底影响
    const existing = new ConfigManager()
      .adoptServerSnapshot(normalizeViewerConfig({ presetName: 'minimal', background: { mode: 'solid', color: '#101010' } }).config)
    assert.equal(existing.presetName, 'minimal')
    assert.equal(existing.background?.mode, 'solid')

    // Historical browser snapshots cannot override authored visual settings.
    values.set('vie-gallery-viewer-preference', '{"layout":{"mode":"grid"},"background":{"mode":"solid","color":"#ff0000"},"visitorAllowDownload":true,"quality":"low"}')
    const preferred = new ConfigManager().adoptServerSnapshot(null)
    assert.equal(preferred.presetName, 'jade-flow')
    assert.equal(preferred.layout.mode, 'helix')
    assert.equal(preferred.background?.color, '#111a17')
    assert.equal(preferred.visitorAllowDownload, false)
    assert.equal(preferred.quality, 'low')
    values.set('vie-gallery-viewer-preference', '{"quality":"high"}')
    const capped = new ConfigManager().adoptServerSnapshot(normalizeViewerConfig({ quality: 'low' }).config)
    assert.equal(capped.quality, 'low')
  } finally { Object.assign(globalThis, { window: oldWindow, localStorage: oldStorage }) }
})

test('config manager validates all entry points and preserves requested intent', async () => {
  const oldWindow = globalThis.window
  const oldStorage = globalThis.localStorage
  const oldFetch = globalThis.fetch
  const values = new Map<string, string>()
  Object.assign(globalThis, { window: { location: { search: '?layout=bad&particles=unknown', hash: '' } }, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key)
  } })
  try {
    const manager = new ConfigManager({ quality: 'high' })
    assert.equal(manager.loadFromURL(), null)
    assert.throws(() => manager.importConfig('{"particles":{"density":9}}'))
    assert.throws(() => manager.savePreference({ quality: 'invalid' } as never))
    manager.importConfig('{"layout":"helix","extension":{"label":"kept"}}')
    assert.equal(manager.getConfig().layout.mode, 'helix')
    values.set('vie-gallery-viewer-preference', '{"particles":{"density":3}}')
    globalThis.fetch = async () => new Response(JSON.stringify({ configJson: '{"presetName":"minimal","quality":"high"}', schemaVersion: 1 }), { status: 200 })
    await manager.loadFromServer('demo')
    assert.equal(manager.getConfig().layout.mode, 'sphere')
    assert.equal(manager.getConfig().particles.enabled, false)
    assert.equal(manager.autoAdjustForDevice().quality, 'high')
    const candidate = await manager.loadPreset('minimal')
    assert.equal(candidate.layout.mode, 'grid')
    assert.equal(manager.getConfig().layout.mode, 'sphere', 'candidate does not mutate committed config')
  } finally { Object.assign(globalThis, { window: oldWindow, localStorage: oldStorage, fetch: oldFetch }) }
})
