import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeViewerConfig } from '@vie/gallery-contracts'
import { ViewerEngine } from '../src/core/ViewerEngine'
import { ConfigManager } from '../src/core/ConfigManager'
import { PluginManager } from '../src/core/PluginManager'
import { EventBus } from '../src/core/EventBus'
import { FrameClock } from '../src/core/FrameClock'
import { QualityController } from '../src/core/QualityController'
import { applyViewerPreset } from '@vie/gallery-contracts'
import { createViewerContext } from './helpers/viewerContext'

test('engine serializes updates, applies full candidates, and recovers failed plugin installs', async () => {
  const oldWindow = globalThis.window
  Object.assign(globalThis, { window: { location: { search: '', hash: '' } } })
  try {
    const config = normalizeViewerConfig({ particles: { enabled: false }, effects: { bloom: { enabled: false } }, interaction: { clickRipple: false } }).config
    const manager = new PluginManager(), context = createViewerContext(config), bus = new EventBus()
    const counts = new Map<string, number>()
    let finish!: () => void
    for (const name of ['Layout', 'Lighting', 'PhotoFade', 'Background', 'Fog', 'ClickRipple', 'CursorTrail', 'Particles']) {
      manager.register({ name, version: '1', install: () => {
        counts.set(name, (counts.get(name) ?? 0) + 1)
        if (name === 'Particles') return new Promise<void>(resolve => { finish = resolve })
      }, uninstall: () => counts.set(name, (counts.get(name) ?? 0) - 1) })
    }
    manager.setContext(context)
    const engine = Object.create(ViewerEngine.prototype) as ViewerEngine
    Object.assign(engine, { pluginManager: manager, configManager: new ConfigManager(config), pluginContext: context,
      scene: context.scene, camera: context.camera, eventBus: bus, photos: [], clock: new FrameClock(), disposed: false,
      pendingConfig: null, configDrain: null, composer: null, motionQuery: { matches: false }, controls: null,
      postProcessing: { apply: () => {}, dispose: () => {} }, resizePostProcessing: () => {},
      effectiveQuality: 'mid', qualityRequest: 'auto', qualityController: new QualityController('mid', 'high', 0),
      texturePool: { setBudget: () => {} }, renderer: { setPixelRatio: () => {} } })
    const a = engine.applyConfig({ particles: { enabled: true, types: ['stars'], density: .4 } })
    const b = engine.applyConfig({ particles: { density: .8 } } as never)
    for (let i = 0; i < 100 && !finish; i++) await Promise.resolve()
    assert.equal(typeof finish, 'function')
    finish(); await Promise.all([a, b])
    assert.equal(engine.getRequestedConfig().particles.density, .8)
    assert.equal(engine.getRequestedConfig().particles.enabled, true)
    assert.equal(counts.get('Particles'), 1)
    await assert.rejects(engine.applyConfig({ particles: { density: 99 } } as never))
    assert.equal(engine.getRequestedConfig().particles.density, .8)
    await engine.applyConfig({ interaction: { clickRipple: true } })
    assert.equal(counts.get('ClickRipple'), 1)
    await engine.applyConfig({ interaction: { clickRipple: false } })
    assert.equal(counts.get('ClickRipple'), 0)
    await engine.applyConfig({ effects: { bloom: { enabled: true, strength: .4 } } })
    await engine.applyConfig({ effects: { bloom: { strength: .8 } } } as never)
    assert.equal(engine.getRequestedConfig().effects.bloom?.strength, .8)
    let removed = 0
    manager.register({ name: 'Fog', version: '1', install: () => { throw Error('expected fog failure') }, uninstall: () => removed++ })
    await assert.rejects(engine.applyConfig({ effects: { fog: { enabled: true } } }))
    assert.equal(engine.getRequestedConfig().effects.fog?.enabled, false)
    assert.equal(context.config.effects.fog?.enabled, false)
    assert.equal(removed, 1)
    assert.equal(manager.isInstalled('Fog'), false)
    await engine.applyConfig({ particles: { color: '#112233' }, layout: { params: { radius: 900 } } } as never)
    await engine.replaceConfig(applyViewerPreset('minimal', engine.getRequestedConfig()))
    assert.equal(engine.getRequestedConfig().particles.color, undefined)
    assert.equal(engine.getRequestedConfig().layout.params?.radius, undefined)
    manager.dispose()
  } finally { globalThis.window = oldWindow }
})
