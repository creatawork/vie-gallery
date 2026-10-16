import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRecommendedViewerConfig } from '@vie/gallery-contracts'
import { SpatialStagePlugin } from '../src/plugins/SpatialStagePlugin'
import { createViewerContext } from './helpers/viewerContext'
import type { PhotoMesh } from '../src/core/types'
import { stageFraming } from '../src/lib/stageFraming'

function fixture(count = 12, reduced = true) {
  const photos = Array.from({ length: count }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(index % 2 ? 80 : 55, index % 2 ? 48 : 120), new THREE.MeshStandardMaterial()) as PhotoMesh
    mesh.userData = {index,url:'',thumbnailUrl:''}
    return mesh
  })
  const context = createViewerContext(createRecommendedViewerConfig(), photos)
  context.reducedMotion = () => reduced
  Object.assign(context.renderer, {domElement:Object.assign(new EventTarget(), {hasPointerCapture:()=>false})})
  const stage = new SpatialStagePlugin()
  return {context,stage}
}

test('stage can be unloaded before installation and reused without duplicate orbital geometry', () => {
  const {context,stage} = fixture()
  assert.doesNotThrow(()=>stage.uninstall())
  stage.install(context)
  assert.equal(context.scene.children[0].children.length,2)
  stage.uninstall()
  assert.equal(context.scene.children.length,0)
  stage.install(context)
  assert.equal(context.scene.children[0].children.length,2)
  stage.uninstall()
})

test('stage navigation reaches all photos and wraps both ways even in reduced motion', () => {
  for(const count of [1,2,3,12,50]) {
    const {context,stage} = fixture(count)
    let index = -1
    context.on('stage:change', (state:{index:number}) => {index=state.index})
    stage.install(context)
    const visited = new Set([index])
    for(let i=0;i<count;i++) {context.emit('stage:step',1);stage.update(.016,i);visited.add(index)}
    assert.equal(visited.size,count)
    assert.equal(index,0)
    context.emit('stage:step',-1);stage.update(.016,100)
    assert.equal(index,count-1)
    for(const mesh of context.photos) assert.ok(Number.isFinite(mesh.position.x))
    stage.uninstall()
  }
})

test('pause and reduced motion stop autonomous advancement; manual stepping still works', () => {
  for(const reduced of [true,false]) {
    const {context,stage} = fixture(12,reduced)
    let index = -1
    context.on('stage:change',(state:{index:number})=>{index=state.index})
    stage.install(context)
    if(!reduced) context.emit('stage:autoplay',false)
    for(let i=0;i<600;i++) stage.update(.05,i*.05)
    assert.equal(index,0)
    context.emit('stage:step',1)
    for(let i=0;i<100;i++) stage.update(.05,30+i*.05)
    assert.equal(index,1)
    stage.uninstall()
  }
})

test('portrait works keep their aspect ratio and fit the mobile focus area', () => {
  const {context,stage} = fixture()
  ;(context.camera as THREE.PerspectiveCamera).aspect=390/844
  stage.install(context)
  for(let i=0;i<50;i++) stage.update(.05,i*.05)
  const mesh=context.photos[0]
  const box=new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
  assert.ok(box.x <= 220 && box.y <= 420)
  assert.ok(box.y > 300, 'the active work should make useful use of the phone viewport')
  assert.ok(Math.abs(box.x/box.y-55/120)<.001)
  stage.uninstall()
})

test('stage applies scale, spacing and radius changes without replacing the scene', () => {
  const { context, stage } = fixture()
  stage.install(context)
  const scale = context.photos[0].scale.x
  const position = context.photos[1].position.clone()
  context.config.layout.params!.scale = 1.5
  stage.update(.05, 1)
  assert.ok(Math.abs(context.photos[0].scale.x - scale * 1.5) < .001)
  context.config.layout.params!.spacing = 1.7
  stage.update(.05, 2)
  assert.ok(context.photos[1].position.distanceTo(position) > 30)
  const x = context.photos[1].position.x
  context.config.layout.params!.radius = 680
  stage.update(.05, 3)
  assert.ok(Math.abs(context.photos[1].position.x - x * 2) < .001)
  stage.uninstall()
})

test('photo float is independent of autoplay and stops when disabled', () => {
  const { context, stage } = fixture(12, false)
  context.config.camera!.autoRotate = false
  stage.install(context)
  for (let i = 0; i < 100; i++) stage.update(.05, i * .05)
  const y = context.photos[0].position.y
  for (let i = 100; i < 150; i++) stage.update(.05, i * .05)
  assert.ok(Math.abs(context.photos[0].position.y - y) > .1)
  context.config.effects.photoFloat = false
  for (let i = 150; i < 250; i++) stage.update(.05, i * .05)
  const frame = stageFraming(800, 800, (context.camera as THREE.PerspectiveCamera).fov, 750)
  assert.ok(Math.abs(context.photos[0].position.y - frame.centerY) < .001)
  stage.uninstall()
})

test('zero cruise speed pauses automatic advancement', () => {
  const { context, stage } = fixture(12, false)
  context.config.camera!.rotateSpeed = 0
  let index = -1
  context.on('stage:change', (state: { index: number }) => { index = state.index })
  stage.install(context)
  for (let i = 0; i < 400; i++) stage.update(.05, i * .05)
  assert.equal(index, 0)
  stage.uninstall()
})

test('coarse frames preserve the authored autoplay dwell instead of stretching it', () => {
  const { context, stage } = fixture(12, false)
  let index = -1
  context.on('stage:change', (state: { index: number }) => { index = state.index })
  stage.install(context)
  for (let i = 0; i < 68; i++) stage.update(.1, i * .1)
  assert.equal(index, 1, 'one photograph advances after the same active seconds at 10 fps')
  stage.uninstall()
})

test('changing entrance settings replays the visible works immediately', () => {
  const { context, stage } = fixture(12, false)
  context.config.camera!.autoRotate = false
  stage.install(context)
  for (let i = 0; i < 100; i++) stage.update(.05, i * .05)
  assert.equal((context.photos[0].material as THREE.Material).opacity, 1)
  context.config.effects.photoEntrance = 'rise'
  context.emit('config:update', context.config)
  stage.update(.05, 5)
  assert.equal((context.photos[0].material as THREE.Material).opacity, 0)
  for (let i = 0; i < 50; i++) stage.update(.05, 5 + i * .05)
  assert.equal((context.photos[0].material as THREE.Material).opacity, 1)
  stage.uninstall()
})

test('published autoplay changes take effect without reinstalling the stage', () => {
  const { context, stage } = fixture(12, false)
  let index = -1
  context.on('stage:change', (state: { index: number }) => { index = state.index })
  stage.install(context)
  context.config.camera = { ...context.config.camera, autoRotate: false }
  context.emit('config:update', context.config)
  for (let i = 0; i < 400; i++) stage.update(.05, i * .05)
  assert.equal(index, 0, 'disabling autoplay keeps the current work on display')
  context.config.camera.autoRotate = true
  context.emit('config:update', context.config)
  for (let i = 0; i < 160; i++) stage.update(.05, 20 + i * .05)
  assert.equal(index, 1, 'reenabling autoplay resumes the exhibition')
  stage.uninstall()
})

test('suspended stages ignore navigation and empty stages never open a nonexistent work', () => {
  const { context, stage } = fixture(12)
  let index = -1, opened = 0
  context.on('stage:change', (state: { index: number }) => { index = state.index })
  context.on('stage:open', () => { opened++ })
  stage.install(context)
  context.emit('stage:suspend', true)
  context.emit('stage:step', 1)
  stage.update(.05, 1)
  assert.equal(index, 0)
  context.emit('stage:suspend', false)
  context.emit('stage:step', 1)
  stage.update(.05, 2)
  assert.equal(index, 1)
  context.photos = []
  context.emit('photos:loaded', [])
  stage.update(.05, 3)
  const enter = new Event('keydown', { cancelable: true })
  Object.assign(enter, { key: 'Enter' })
  context.renderer.domElement.dispatchEvent(enter)
  assert.equal(opened, 0)
  stage.uninstall()
})

test('stage motion keeps full-frame rendering awake and balances transition ownership', () => {
  const { context, stage } = fixture(12, false)
  let active = 0, started = 0
  context.on('transition:start', () => { active++; started++ })
  context.on('transition:end', () => { active-- })
  stage.install(context)
  context.emit('stage:autoplay', false)
  context.emit('stage:step', 1)
  stage.update(.05, 0)
  assert.equal(active, 1, 'navigation must wake the renderer out of its idle frame budget')
  for (let i = 0; i < 200; i++) stage.update(.05, i * .05)
  assert.equal(active, 0)
  assert.equal(started, 1)
  context.emit('stage:step', 1)
  stage.update(.05, 11)
  assert.equal(active, 1)
  stage.uninstall()
  assert.equal(active, 0, 'changing scenes during motion releases its rendering ownership')
})

test('hover feedback eases into the photograph scale without snapping or accumulating', () => {
  const { context, stage } = fixture(12, false)
  stage.install(context)
  context.emit('stage:autoplay', false)
  const mesh = context.photos[0], original = mesh.scale.x
  context.emit('theatre:hover', 0)
  stage.update(.016, .016)
  assert.ok(mesh.scale.x > original && mesh.scale.x < original * 1.04)
  for (let i = 0; i < 100; i++) stage.update(.05, i * .05)
  assert.ok(mesh.scale.x < original * 1.04)
  context.emit('theatre:hover', null)
  for (let i = 0; i < 100; i++) stage.update(.05, 5 + i * .05)
  assert.ok(Math.abs(mesh.scale.x - original) < .001)
  stage.uninstall()
})

test('immersive viewing enlarges the work and restores its authored frame without losing navigation', () => {
  const { context, stage } = fixture()
  Object.assign(context.renderer.domElement, { clientWidth: 390, clientHeight: 844 })
  ;(context.camera as THREE.PerspectiveCamera).aspect = 390 / 844
  stage.install(context)
  const original = context.photos[0].scale.x
  context.emit('stage:immersive', true)
  stage.update(.05, 1)
  assert.ok(context.photos[0].scale.x > original * 1.4)
  context.emit('stage:step', 1)
  stage.update(.05, 2)
  assert.ok((context.photos[1].material as THREE.Material).opacity === 1)
  assert.equal((context.photos[0].material as THREE.Material).opacity, 1, 'photographs should stay opaque instead of showing the works behind them')
  assert.ok((context.photos[0].material as THREE.MeshStandardMaterial).emissiveIntensity < .65, 'neighbouring works should recede behind the active photograph')
  context.emit('stage:step', -1)
  context.emit('stage:immersive', false)
  stage.update(.05, 3)
  assert.ok(Math.abs(context.photos[0].scale.x - original) < .001)
  stage.uninstall()
})

test('embedded previews reserve their own small safe area instead of the hidden visitor controls', () => {
  const scales: number[] = []
  for (const preview of [false, true]) {
    const { context, stage } = fixture()
    Object.assign(context.renderer.domElement, { clientWidth: 600, clientHeight: 320, dataset: { presentation: preview ? 'preview' : '' } })
    ;(context.camera as THREE.PerspectiveCamera).aspect = 600 / 320
    stage.install(context)
    scales.push(context.photos[0].scale.x)
    const frame = stageFraming(600, 320, (context.camera as THREE.PerspectiveCamera).fov, 750, false, preview)
    const worldHeight = (context.photos[0].geometry as THREE.PlaneGeometry).parameters.height * context.photos[0].scale.y
    assert.ok(worldHeight <= frame.height + .001)
    stage.uninstall()
  }
  assert.ok(scales[1] > scales[0] * 2.5, 'a short preview must display the photograph at a readable size')
})
