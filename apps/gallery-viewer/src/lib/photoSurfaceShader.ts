/** Original GLSL photo treatments. Work is bounded per visible fragment, with no extra render targets. */
export const photoSurfaceUniforms = /* glsl */ `
uniform float uVieStyle;
uniform float uVieAmount;
uniform float uVieTime;
uniform float uVieMotion;
uniform float uVieSeed;
uniform float uVieAspect;
uniform float uVieHover;
uniform vec2 uViePointer;
varying vec2 vVieUv;
`

export const photoSurfaceVertex = /* glsl */ `
vVieUv = uv;
if (uVieStyle > 0.5 && uVieStyle < 1.5) {
  float fold = sin(uv.x * 7.0 + uVieTime * 1.3 + uVieSeed) * sin(uv.y * 3.141593);
  transformed.z += (fold + sin(uv.y * 3.141593)) * 0.5 * uVieAmount * uVieMotion * 4.2;
} else if (uVieStyle > 3.5 && uVieStyle < 4.5) {
  transformed.z += sin(uv.x * 3.141593) * sin(uv.y * 3.141593) * uVieAmount * uVieHover * 3.0;
}
`

export const photoSurfaceFragment = /* glsl */ `
float vieHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vieLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float vieEdge(vec2 uv) { return min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)); }
vec3 vieSpectrum(float t) { return 0.5 + 0.5 * cos(6.283185 * (t + vec3(0.0, 0.33, 0.67))); }
vec4 vieBlur(sampler2D image, vec2 uv, float size) {
  vec2 d = vec2(size / max(uVieAspect, 0.1), size);
  return texture2D(image, uv) * 0.4 + (texture2D(image, clamp(uv + d, 0.0, 1.0))
    + texture2D(image, clamp(uv - d, 0.0, 1.0))
    + texture2D(image, clamp(uv + vec2(d.x, -d.y), 0.0, 1.0))
    + texture2D(image, clamp(uv + vec2(-d.x, d.y), 0.0, 1.0))) * 0.15;
}
vec4 vieFrame(sampler2D image, vec2 uv, float border, float foot, vec3 paper) {
  float fit = min(1.0 - border * 2.0, 1.0 - foot - border);
  vec2 p = (uv - vec2(0.5, (foot + 1.0 - border) * 0.5)) / fit + 0.5;
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  return vec4(mix(paper, texture2D(image, clamp(p, 0.0, 1.0)).rgb, inside), 1.0);
}
vec4 viePhoto(sampler2D image, vec2 uv) {
  vec4 original = texture2D(image, uv);
  if (uVieAmount <= 0.001 || uVieStyle < 0.5) return original;
  vec2 p = uv;
  float t = uVieTime;
  float edge = vieEdge(uv);
  float grain = vieHash(floor(uv * vec2(720.0, 720.0 / max(uVieAspect, 0.1))) + floor(t * 12.0)) - 0.5;
  vec3 c = original.rgb;
  if (uVieStyle < 1.5) {
    // Silk: broad specular folds move across the actual image surface.
    float band = sin(uv.x * 7.0 + t * 1.3 + uVieSeed);
    c *= 0.84 + 0.16 * band;
    c += vec3(0.13, 0.26, 0.19) * pow(max(0.0, band), 9.0) * (0.6 + uVieHover);
  } else if (uVieStyle < 2.5) {
    float scan = pow(max(0.0, sin(uv.y * 8.0 - t * 1.7)), 24.0);
    float lines = 0.93 + 0.07 * sin(uv.y * 820.0);
    c = mix(c, vec3(vieLuma(c)) * vec3(0.65, 1.12, 1.24), 0.48) * lines;
    c += vieSpectrum(uv.x * 0.5 + t * 0.08) * (scan * 0.36 + pow(1.0 - smoothstep(0.0, 0.045, edge), 2.0) * 0.65);
  } else if (uVieStyle < 3.5) {
    c = vieFrame(image, uv, 0.075, 0.07, vec3(0.025, 0.019, 0.012)).rgb;
    float sprocket = (1.0 - step(0.052, edge)) * step(0.24, fract(uv.y * 16.0)) * (1.0 - step(0.75, fract(uv.y * 16.0)));
    c = mix(c * vec3(1.09, 0.96, 0.76) * (1.0 + grain * 0.12), vec3(0.72, 0.59, 0.36), sprocket);
    c *= 0.98 + 0.02 * sin(t * 3.0);
  } else if (uVieStyle < 4.5) {
    vec2 direction = uv - uViePointer;
    float dispersion = (0.006 + 0.027 * pow(1.0 - edge * 2.0, 3.0)) * (1.0 + uVieHover);
    c.r = texture2D(image, clamp(uv + direction * dispersion, 0.0, 1.0)).r;
    c.b = texture2D(image, clamp(uv - direction * dispersion, 0.0, 1.0)).b;
    float spectral = pow(max(0.0, sin(uv.x * 5.0 + uv.y * 3.0 + t * 0.55)), 18.0);
    c += vieSpectrum(uv.x + uv.y * 0.7 + t * 0.05) * spectral * (0.10 + (1.0 - smoothstep(0.0, 0.2, edge)) * 0.4);
  } else if (uVieStyle < 5.5) {
    vec2 radial = (uv - uViePointer) * vec2(uVieAspect, 1.0);
    float r = length(radial);
    float wave = sin(r * 42.0 - t * 3.2) * exp(-r * 1.8);
    p += normalize(radial + vec2(0.0001)) * wave * 0.024 * (1.0 + uVieHover * 0.8);
    c = texture2D(image, clamp(p, 0.0, 1.0)).rgb;
    c += vec3(0.035, 0.11, 0.13) * pow(max(0.0, wave), 6.0);
  } else if (uVieStyle < 6.5) {
    float silver = pow(max(vieLuma(c), 0.0), 0.87);
    vec2 spot = vec2(0.5 + sin(t * 0.4) * 0.18, 0.5);
    float light = 1.0 - smoothstep(0.15, 0.85, length((uv - spot) * vec2(uVieAspect, 1.0)));
    c = vec3(silver) * vec3(0.91, 0.97, 1.04) * (0.58 + light * 0.5) * (1.0 + grain * 0.08);
  } else if (uVieStyle < 7.5) {
    float l = smoothstep(0.02, 0.9, vieLuma(c));
    c = mix(vec3(0.095, 0.025, 0.19), vec3(0.92, 0.78, 0.64), l);
    vec2 cell = fract(uv * vec2(190.0 * uVieAspect, 190.0)) - 0.5;
    float dotMask = smoothstep(0.12 + l * 0.48, 0.17 + l * 0.48, length(cell));
    c *= 1.0 - dotMask * 0.32;
  } else if (uVieStyle < 8.5) {
    float mist = 1.0 - smoothstep(0.025, 0.28 + sin(t * 0.4) * 0.03, edge);
    c = vieBlur(image, uv, mist * 0.03).rgb;
    c = mix(c, vec3(0.63, 0.75, 0.8), mist * 0.46);
    c += grain * mist * 0.10;
    c += vec3(0.18) * (1.0 - smoothstep(0.002, 0.006, abs(edge - 0.018)));
  } else if (uVieStyle < 9.5) {
    c = vieFrame(image, uv, 0.045, 0.105, vec3(0.90, 0.86, 0.76)).rgb;
    c += grain * 0.008;
    float fiber = sin(uv.x * 1600.0 + sin(uv.y * 1300.0)) * 0.008;
    c += fiber;
  } else if (uVieStyle < 10.5) {
    vec2 leaves = uv * vec2(8.0, 11.0) + vec2(sin(t * 0.5), t * 0.12);
    float shadow = sin(leaves.x + sin(leaves.y * 1.3)) * sin(leaves.y + cos(leaves.x * 0.8));
    float sunlight = smoothstep(0.12, 0.75, shadow);
    c *= 0.60 + sunlight * 0.5;
    c += vec3(0.17, 0.19, 0.055) * sunlight * 0.35;
  } else if (uVieStyle < 11.5) {
    vec2 cell = uv * vec2(150.0 * uVieAspect, 150.0);
    float noise = vieHash(floor(cell) + uVieSeed);
    float dissolve = (1.0 - smoothstep(0.02, 0.22, edge)) * (0.4 + 0.12 * sin(t * 0.6));
    float dotMask = 1.0 - smoothstep(0.27, 0.49, length(fract(cell) - 0.5));
    c *= mix(1.0, dotMask * step(dissolve, noise), 1.0 - smoothstep(0.03, 0.25, edge));
    c += vec3(0.45, 0.62, 1.0) * step(0.991, noise) * pow(max(0.0, sin(t * 1.5 + noise * 160.0)), 12.0);
  } else if (uVieStyle < 12.5) {
    p += vec2(sin(uv.y * 18.0 + t), cos(uv.x * 17.0 - t * 0.8)) * 0.008;
    c = texture2D(image, clamp(p, 0.0, 1.0)).rgb;
    float water = abs(sin(p.x * 24.0 + sin(p.y * 20.0 + t) * 2.0) + sin(p.y * 25.0 - t));
    float caustic = pow(max(0.0, 1.0 - water * 0.55), 16.0);
    c = c * vec3(0.88, 1.0, 1.03) + vec3(0.24, 0.40, 0.38) * caustic;
  } else if (uVieStyle < 13.5) {
    float leak = exp(-uv.x * (5.0 + sin(t * 0.65) * 1.8)) * (0.65 + sin(uv.y * 3.0 + t * 0.3) * 0.25);
    float beam = exp(-abs(uv.y - 0.62 - sin(t * 0.2) * 0.12) * 140.0);
    c = c * vec3(1.04, 0.94, 0.86) + vec3(0.78, 0.16, 0.025) * leak + vec3(0.36, 0.18, 0.08) * beam;
  } else if (uVieStyle < 14.5) {
    float blur = smoothstep(0.12, 0.65, length((uv - 0.5) * vec2(uVieAspect, 1.0)));
    c = vieBlur(image, uv, blur * 0.022).rgb;
    for (int j = 0; j < 5; j++) {
      float f = float(j);
      vec2 center = vec2(fract(f * 0.618 + uVieSeed * 0.13), fract(f * 0.381 + t * 0.018));
      float r = length((uv - center) * vec2(uVieAspect, 1.0));
      float disc = 1.0 - smoothstep(0.025 + f * 0.006, 0.035 + f * 0.006, r);
      c += vec3(0.3, 0.15, 0.2) * disc * blur * 0.65;
    }
    c += vec3(0.04, 0.015, 0.025) * blur;
  } else if (uVieStyle < 15.5) {
    vec2 tiles = uv * vec2(20.0 * uVieAspect, 20.0);
    vec2 id = floor(tiles);
    float crystal = 1.0 - smoothstep(0.015, 0.22, edge);
    vec2 offset = vec2(vieHash(id), vieHash(id + 1.0)) - 0.5;
    c = texture2D(image, clamp(uv + offset * crystal * 0.055, 0.0, 1.0)).rgb;
    vec2 facet = fract(tiles);
    float line = 1.0 - smoothstep(0.015, 0.07, min(min(facet.x, facet.y), abs(facet.x - facet.y)));
    c = mix(c, vec3(0.8, 0.9, 1.0), crystal * (0.22 + line * 0.38));
    c += vec3(0.17, 0.23, 0.30) * crystal * pow(max(0.0, sin(t + id.x * 3.0 + id.y)), 14.0);
  } else {
    vec3 framed = vieFrame(image, uv, 0.055, 0.09, vec3(0.012)).rgb;
    float l = smoothstep(0.015, 0.88, vieLuma(framed));
    c = vec3(l * 0.92 * (1.0 + grain * 0.10));
    float side = 1.0 - step(0.028, min(uv.x, 1.0 - uv.x));
    float marks = step(0.45, fract(uv.y * 28.0));
    c = mix(c, vec3(0.54, 0.31, 0.10), side * marks);
    float code = step(0.96, uv.y) * step(0.5, sin(uv.x * 220.0 + uVieSeed));
    c = mix(c, vec3(0.61, 0.41, 0.16), code * 0.65);
  }
  return vec4(mix(original.rgb, max(c, vec3(0.0)), uVieAmount), original.a);
}
`
