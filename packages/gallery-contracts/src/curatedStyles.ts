import { mergeViewerConfig, type ViewerConfig } from './viewerConfig'

/** Three authored compositions; legacy layouts remain readable. */
export const CURATED_STYLES = [
  { id: 'helix', label: '螺旋', caption: '让回忆沿光线生长', color: '#657eab' },
  { id: 'carousel', label: '环幕', caption: '置身照片的怀抱', color: '#bd906d' },
  { id: 'grid', label: '波浪', caption: '光影如潮汐展开', color: '#689d9a' }
] as const
export type CuratedStyle = typeof CURATED_STYLES[number]['id']

export function applyCuratedStyle(current: ViewerConfig, mode: CuratedStyle): ViewerConfig {
  const tone = { helix: '#263951', carousel: '#443127', grid: '#183d42' }[mode]
  return mergeViewerConfig(current, {
    customized: true,
    layout: { mode, params: { composition: 'curated', scale: 2, spacing: 1, radius: 340, height: 430, turns: 1.15, columns: 4, cellW: 235, cellH: 230 }, transition: { style: 'smooth', duration: 1.6 } },
    background: { mode: 'gradient', motion: true, color: '#080c15', secondaryColor: tone, angle: 135 },
    particles: { enabled: true, types: ['stars', 'fireflies'], density: .45, speed: .3, size: 1.4 },
    effects: { bloom: { enabled: false, strength: .16, radius: .6, threshold: .8 }, fog: { enabled: false }, postGrade: { enabled: false }, vignette: { enabled: false, strength: .2 }, photoFloat: true, floatAmplitude: .6, floatSpeed: .45, photoEntrance: 'fade', entranceDuration: .6 },
    camera: { autoRotate: true, rotateSpeed: .12, introFlight: false },
    lighting: { timeOfDay: 'noon', autoColorAdapt: false },
    interaction: { clickRipple: false, cursorTrail: false }
  })
}
