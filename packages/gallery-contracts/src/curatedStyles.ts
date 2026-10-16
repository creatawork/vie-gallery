import { mergeViewerConfig, type ViewerConfig } from './viewerConfig'
import { photoPresentationPatch } from './photoEffects'

/** Composition changes preserve the gallery's background, lighting and effects. */
export const CURATED_STYLES = [
  { id: 'helix', label: '螺旋', caption: '让回忆沿光线生长', color: '#657eab' },
  { id: 'carousel', label: '环幕', caption: '置身照片的怀抱', color: '#bd906d' },
  { id: 'grid', label: '波浪', caption: '光影如潮汐展开', color: '#689d9a' }
] as const
export type CuratedStyle = typeof CURATED_STYLES[number]['id']

export function applyCuratedStyle(current: ViewerConfig, mode: CuratedStyle): ViewerConfig {
  return mergeViewerConfig(mergeViewerConfig(current, photoPresentationPatch(current)), {
    customized: true,
    layout: { mode, params: { composition: 'curated', arrangement: ({ helix: 'ribbon', carousel: 'arc', grid: 'wave' } as const)[mode] } }
  })
}
