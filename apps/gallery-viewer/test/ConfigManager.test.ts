import test from 'node:test'
import assert from 'node:assert/strict'
import { ConfigManager } from '../src/core/ConfigManager'

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
