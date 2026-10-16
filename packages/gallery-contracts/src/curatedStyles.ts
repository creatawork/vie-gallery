import { mergeViewerConfig, type ViewerConfig } from './viewerConfig'
import { photoPresentationPatch } from './photoEffects'

/** Composition changes preserve the gallery's background, lighting and effects. */
export const CURATED_STYLES = [
  { id: 'helix', label: '螺旋', caption: '让回忆沿光线生长', color: '#657eab' },
  { id: 'carousel', label: '环幕', caption: '置身照片的怀抱', color: '#bd906d' },
  { id: 'grid', label: '波浪', caption: '光影如潮汐展开', color: '#689d9a' },
  { id: 'book', label: '翻页', caption: '把光阴，翻成一本书', color: '#c7b68e' },
  { id: 'tunnel', label: '穿行', caption: '穿过光影，走进下一段回忆', color: '#93a7c0' }
] as const
export type CuratedStyle = typeof CURATED_STYLES[number]['id']

export function applyCuratedStyle(current: ViewerConfig, mode: CuratedStyle): ViewerConfig {
  return mergeViewerConfig(mergeViewerConfig(current, photoPresentationPatch(current)), {
    customized: true,
    layout: { mode: mode === 'book' || mode === 'tunnel' ? 'helix' : mode,
      params: { composition: 'curated', arrangement: ({ helix: 'ribbon', carousel: 'arc', grid: 'wave', book: 'book', tunnel: 'tunnel' } as const)[mode] } }
  })
}
