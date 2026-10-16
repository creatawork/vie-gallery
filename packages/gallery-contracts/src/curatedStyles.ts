import { mergeViewerConfig, type ViewerConfig } from './viewerConfig'
import { PHOTO_ARRANGEMENTS, photoPresentationPatch, resolvePhotoArrangement, type PhotoArrangement } from './photoEffects'

/** Composition changes preserve the gallery's background, lighting and effects. */
export const CURATED_STYLES = [
  { id: 'helix', label: '螺旋', caption: '让回忆沿光线生长', color: '#657eab' },
  { id: 'carousel', label: '环幕', caption: '置身照片的怀抱', color: '#bd906d' },
  { id: 'grid', label: '波浪', caption: '光影如潮汐展开', color: '#689d9a' },
  { id: 'book', label: '翻页', caption: '把光阴，翻成一本书', color: '#c7b68e' },
  { id: 'tunnel', label: '穿行', caption: '穿过光影，走进下一段回忆', color: '#93a7c0' }
] as const
export type CuratedStyle = typeof CURATED_STYLES[number]['id']

const CURATED_STYLE_ARRANGEMENTS = {
  helix: 'ribbon', carousel: 'arc', grid: 'wave', book: 'book', tunnel: 'tunnel'
} as const satisfies Record<CuratedStyle, PhotoArrangement>

/** Apply one visual composition without changing the authored atmosphere or photo treatment. */
export function applyPhotoArrangement(current: ViewerConfig, arrangement: PhotoArrangement): ViewerConfig {
  const definition = PHOTO_ARRANGEMENTS.find(item => item.id === arrangement)!
  return mergeViewerConfig(mergeViewerConfig(current, photoPresentationPatch(current)), {
    customized: true,
    layout: { mode: definition.mode, params: { composition: 'curated', arrangement },
      transition: { style: current.layout.transition?.style === 'none' ? 'none' : 'smooth' } }
  })
}

export function applyCuratedStyle(current: ViewerConfig, mode: CuratedStyle): ViewerConfig {
  return applyPhotoArrangement(current, CURATED_STYLE_ARRANGEMENTS[mode])
}

/** Selection is based on the rendered arrangement; book and tunnel share the helix geometry mode. */
export function resolveCuratedStyle(config: ViewerConfig): CuratedStyle | undefined {
  if (config.layout.params?.composition !== 'curated') return undefined
  const arrangement = resolvePhotoArrangement(config)
  return CURATED_STYLES.find(item => CURATED_STYLE_ARRANGEMENTS[item.id] === arrangement)?.id
}
