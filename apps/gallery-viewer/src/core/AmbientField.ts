import * as THREE from 'three'

/** Screen-space atmosphere: two broad pools of light, never a texture download. */
export class AmbientField {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private target = new THREE.Color()
  constructor() {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uAngle: { value: 0 }, uBase: { value: new THREE.Color('#111a17') }, uTone: { value: new THREE.Color('#263b32') } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.999,1.0);}',
      fragmentShader: `varying vec2 vUv; uniform float uTime,uEnergy,uAngle; uniform vec3 uBase,uTone;
      void main(){
        vec2 p=vUv-.5;
        vec2 uv=mat2(cos(uAngle),-sin(uAngle),sin(uAngle),cos(uAngle))*p+.5;
        vec2 drift=vec2(sin(uTime*.09),cos(uTime*.07))*.08;
        float pool=exp(-length((uv-vec2(.65,.47)-drift)*vec2(1.1,1.8))*4.0);
        float rim=exp(-length((uv-vec2(.15,.28)+drift)*vec2(1.,2.))*5.0);
        vec3 color=uBase+uTone*pool*(1.7+uEnergy*1.8)+vec3(.11,.065,.035)*rim;
        float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
        gl_FragColor=vec4(color+grain*.004,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    }))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1000
  }
  setColors(base: string, tone: string, angle = 135) { this.mesh.material.uniforms.uBase.value.set(base); this.target.set(tone); this.mesh.material.uniforms.uTone.value.copy(this.target); this.mesh.material.uniforms.uAngle.value = (angle - 135) * Math.PI / 180 }
  update(delta: number, time: number, energy: number) {
    const u = this.mesh.material.uniforms
    u.uTime.value = time; u.uEnergy.value = energy
    u.uTone.value.lerp(this.target, 1 - Math.exp(-Math.min(delta, .1) * 2))
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}
