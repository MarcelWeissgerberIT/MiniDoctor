import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// colour grade in linear HDR: desaturated war palette, cool shadows, warm highlights, vignette
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, shock: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float shock; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      // chromatic aberration grows towards the edges and on impacts
      float ca = (0.0012 + shock * 0.004) * dot(c, c) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 0.82);
      col *= mix(vec3(0.94, 0.98, 1.04), vec3(1.05, 1.0, 0.94), smoothstep(0.02, 0.6, l));
      float v = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.9)));
      col *= mix(0.55, 1.0, v);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// display-space film grain
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.045 } },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float n = h(vUv * vec2(1920.0, 1080.0)) - 0.5;
      c += n * amount * (1.0 - dot(c, vec3(0.33)) * 0.6);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  constructor(renderer, world, worldCam, cockpit, cockpitCam, { msaa = 4 } = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.worldPass = new RenderPass(world, worldCam);
    this.cockpitPass = new RenderPass(cockpit, cockpitCam);
    this.cockpitPass.clear = false;
    this.cockpitPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.6, 0.9);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    this.grain = new ShaderPass(GrainShader);
    for (const p of [this.worldPass, this.cockpitPass, this.bloom, this.grade, this.output, this.grain]) this.composer.addPass(p);
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  render(time, shock) {
    this.grain.uniforms.time.value = time % 100;
    this.grade.uniforms.shock.value = shock;
    this.composer.render();
  }
}
