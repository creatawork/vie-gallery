import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRecommendedViewerConfig } from '@vie/gallery-contracts'
import { SpatialStagePlugin } from '../src/plugins/SpatialStagePlugin'
import { createViewerContext } from './helpers/viewerContext'
import type { PhotoMesh } from '../src/core/types'

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
  assert.ok(box.x<=241 && box.y<=286)
  assert.ok(Math.abs(box.x/box.y-55/120)<.001)
  stage.uninstall()
})
