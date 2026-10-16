import * as THREE from 'three'
import type { PhotoMesh } from './types'

const TAU = Math.PI * 2
const wrap = (value: number, count: number) => ((value % count) + count) % count

/** A flexible sheet, hinged at x=0. The changing tangent lets the fore edge lag behind the spine. */
export function paperPoint(u: number, v: number, angle: number, curl: number, width: number, height: number, lift = 0) {
  const start = angle - curl
  const tangent = start + curl * u
  const x = Math.abs(curl) < .0001 ? Math.cos(angle) * u * width
    : width * (Math.sin(tangent) - Math.sin(start)) / curl
  const z = Math.abs(curl) < .0001 ? Math.sin(angle) * u * width
    : width * (Math.cos(start) - Math.cos(tangent)) / curl
  return [x - Math.sin(tangent) * lift, (v - .5) * height,
    z + Math.cos(tangent) * lift + Math.sin(u * Math.PI) * 1.8] as const
}

interface Leaf {
  paper: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  front: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  back: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
}

/** Three reusable leaves share the resident photo textures, with no extra texture or render-target budget. */
export class PaperBook {
  readonly group = new THREE.Group()
  private leaves: Leaf[] = []
  private sources: PhotoMesh[] = []
  private savedVisible = new Map<PhotoMesh, boolean>()

  constructor(scene: THREE.Scene) {
    this.group.name = 'paper-book'
    this.group.visible = false
    for (let i = 0; i < 3; i++) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 40, 6), new THREE.ShaderMaterial({
        side: THREE.DoubleSide, uniforms: { uShade: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `varying vec2 vUv; uniform float uShade;
          void main(){
            float gutter=exp(-vUv.x*32.0)*.22;
            float fiber=sin(vUv.x*1600.0+sin(vUv.y*900.0))*.003;
            float edge=smoothstep(.0,.012,min(vUv.y,1.0-vUv.y));
            vec3 paper=vec3(.94,.916,.85)*(uShade-gutter+fiber)*(.96+.04*edge);
            gl_FragColor=vec4(paper,1.0);
            #include <colorspace_fragment>
          }`
      }))
      const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 40, 6), new THREE.MeshBasicMaterial({ side: THREE.FrontSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }))
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 40, 6), new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }))
      const uv = back.geometry.attributes.uv
      for (let j = 0; j < uv.count; j++) uv.setX(j, 1 - uv.getX(j))
      this.group.add(paper, front, back)
      this.leaves.push({ paper, front, back })
    }
    scene.add(this.group)
  }

  render(photos: PhotoMesh[], cursor: number, width: number, height: number, scale = 1) {
    this.group.visible = photos.length > 0
    if (this.sources !== photos) {
      this.release()
      this.sources = photos
    }
    for (const photo of photos) {
      if (!this.savedVisible.has(photo)) this.savedVisible.set(photo, photo.visible)
      photo.visible = false
      photo.userData.presentation = []
    }
    if (!photos.length) return
    // A wide spread fills the stage; portrait screens retain the same book proportions.
    const pageWidth = Math.min(width * .445, height * .76)
    const pageW = pageWidth * scale
    const pageH = Math.min(height * .88, pageWidth * 1.34) * scale
    this.group.position.set(0, 24, 60)
    this.group.rotation.set(-.09, 0, -.018)
    const base = Math.floor(cursor), progress = cursor - base
    const angles = [Math.PI + .025, -.025, progress * Math.PI]
    const indices = [wrap(base - 1, photos.length), wrap(base + 1, photos.length), wrap(base, photos.length)]
    for (let i = 0; i < 3; i++) {
      const leaf = this.leaves[i], photo = photos[indices[i]]
      const angle = angles[i]
      const curl = i === 2 ? Math.sin(progress * Math.PI) * .85 : 0
      const isBlank = photos.length === 1 && i !== 2
      leaf.paper.visible = true
      leaf.paper.material.uniforms.uShade.value = i === 2 ? 1 - Math.sin(progress * Math.PI) * .07 : .96
      this.bend(leaf.paper.geometry, angle, curl, pageW, pageH, 0, 1, 0, 1, i === 2 ? 1.5 : 0)
      const material = photo.material as THREE.MeshStandardMaterial
      const geometry = photo.geometry as THREE.PlaneGeometry
      const ratio = (geometry.parameters.width || 80) / (geometry.parameters.height || 60)
      const imageH = Math.min(pageH * .79, pageW * .84 / ratio)
      const imageW = imageH * ratio
      const x0 = (pageW - imageW) / 2 / pageW, y0 = (pageH - imageH) / 2 / pageH + .025
      for (const [face, sign] of [[leaf.front, 1], [leaf.back, -1]] as const) {
        face.visible = !isBlank
        if (face.material.map !== material.map) { face.material.map = material.map; face.material.needsUpdate = true }
        face.material.color.set(material.map ? '#ffffff' : '#d6d1c5')
        Object.assign(face.userData, { index: photo.userData.index, title: photo.userData.title })
        this.bend(face.geometry, angle, curl, pageW, pageH, x0, imageW / pageW, y0, imageH / pageH, (i === 2 ? 1.5 : 0) + sign * .7)
        if (!isBlank) photo.userData.presentation!.push(face)
      }
    }
    this.group.updateMatrixWorld(true)
  }

  private bend(geometry: THREE.PlaneGeometry, angle: number, curl: number, width: number, height: number,
    x0: number, sx: number, y0: number, sy: number, lift: number) {
    const positions = geometry.attributes.position
    const cols = geometry.parameters.widthSegments + 1, rows = geometry.parameters.heightSegments + 1
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const p = paperPoint(x0 + i / (cols - 1) * sx, y0 + (1 - j / (rows - 1)) * sy, angle % TAU, curl, width, height, lift)
      positions.setXYZ(j * cols + i, ...p)
    }
    positions.needsUpdate = true
    geometry.computeBoundingSphere()
  }

  private release() {
    for (const [photo, visible] of this.savedVisible) {
      photo.visible = visible
      delete photo.userData.presentation
    }
    this.savedVisible.clear()
  }
  hide() { this.group.visible = false; this.release(); this.sources = [] }
  dispose() {
    this.hide(); this.group.removeFromParent()
    for (const leaf of this.leaves) for (const mesh of [leaf.paper, leaf.front, leaf.back]) { mesh.geometry.dispose(); mesh.material.dispose() }
    this.leaves = []
  }
}
