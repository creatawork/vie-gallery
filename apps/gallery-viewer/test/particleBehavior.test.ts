import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { normalizeViewerConfig, mergeViewerConfig } from '@vie/gallery-contracts'
import { ParticlesPlugin } from '../src/plugins/ParticlesPlugin'
import { createViewerContext } from './helpers/viewerContext'
test('six systems freeze, change size/color without rebuild and obey actual budgets', async () => {
  const types = ['stars', 'hearts', 'sakura', 'snow', 'fireflies', 'meteors'] as const
  const context = createViewerContext(normalizeViewerConfig({ quality: 'low', particles: { types: [...types], speed: 0 } }).config)
  const plugin = new ParticlesPlugin(() => .4)
  await plugin.install(context)
  const objects = [...context.scene.children] as Array<THREE.Points | THREE.InstancedMesh | THREE.LineSegments>
  const petal = objects.find(o => o instanceof THREE.InstancedMesh)!
  const vertexBefore = petal.geometry.attributes.position.getX(1)
  const snow = objects.find(o => o.material instanceof THREE.PointsMaterial)!
  const snowSize = (snow.material as THREE.PointsMaterial).size
  const snapshot = () => objects.map(o => JSON.stringify(o instanceof THREE.InstancedMesh ? Array.from(o.instanceMatrix.array) : { position: Array.from(o.geometry.attributes.position.array), time: (o.material as THREE.ShaderMaterial).uniforms?.uTime?.value }))
  const before = snapshot()
  plugin.update(.016, 20)
  plugin.update(.016, 21)
  assert.deepEqual(snapshot(), before)
  context.config = mergeViewerConfig(context.config, { particles: { speed: 1, size: 2, color: '#ff0000' } })
  context.emit('config:update', context.config)
  assert.deepEqual(context.scene.children, objects)
  assert.equal(petal.geometry.attributes.position.getX(1), vertexBefore * 2)
  assert.equal((snow.material as THREE.PointsMaterial).size, snowSize * 2)
  plugin.update(.016, 22)
  assert.notDeepEqual(snapshot(), before)
  for (const o of objects) {
    const material = o.material as THREE.ShaderMaterial & { color?: THREE.Color; size?: number }
    if (material.uniforms) { assert.equal(material.uniforms.uSize.value, 2); assert.equal(material.uniforms.uColor.value.getHexString(), 'ff0000') }
    else assert.equal(material.color?.getHexString(), 'ff0000')
  }
  assert.ok(Object.values(plugin.getParticleCounts()).reduce((a, b) => a + b, 0) <= 200)
  const actual = objects.reduce((n, o) => n + (o instanceof THREE.InstancedMesh ? o.count : o.geometry.attributes.position.count / (o instanceof THREE.LineSegments ? 2 : 1)), 0)
  assert.equal(actual, Object.values(plugin.getParticleCounts()).reduce((a, b) => a + b, 0))
  context.getParticleBudget = () => 10
  context.emit('config:update', context.config)
  assert.equal(Object.values(plugin.getParticleCounts()).reduce((a, b) => a + b, 0), 10)
  context.config = mergeViewerConfig(context.config, { particles: { density: 0 } })
  context.emit('config:update', context.config)
  assert.equal(context.scene.children.length, 0)
  plugin.uninstall()
  assert.equal(context.bus.listenerCount('config:update'), 0)
})
