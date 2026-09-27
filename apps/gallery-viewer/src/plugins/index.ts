// Core plugins
export { LayoutPlugin } from './LayoutPlugin'
export { ClickRipplePlugin } from './ClickRipplePlugin'
export { LightingPlugin } from './LightingPlugin'
export { PhotoFadePlugin } from './PhotoFadePlugin'

// Visual effects plugins (from vie-mei)
export { ParticlesPlugin } from './ParticlesPlugin'
export { BloomPlugin } from './BloomPlugin'
export { FogPlugin } from './FogPlugin'

/**
 * 插件注册表
 *
 * 使用方式：
 * ```typescript
 * import { pluginRegistry } from '@/plugins'
 *
 * // 注册插件
 * await engine.getPluginManager().installAll([
 *   'Layout',
 *   'Particles',
 *   'Bloom'
 * ])
 * ```
 */
export const pluginRegistry = {
  // Core
  Layout: () => import('./LayoutPlugin').then(m => new m.LayoutPlugin()),
  ClickRipple: () => import('./ClickRipplePlugin').then(m => new m.ClickRipplePlugin()),
  Lighting: () => import('./LightingPlugin').then(m => new m.LightingPlugin()),
  PhotoFade: () => import('./PhotoFadePlugin').then(m => new m.PhotoFadePlugin()),

  // Visual effects
  Particles: () => import('./ParticlesPlugin').then(m => new m.ParticlesPlugin()),
  Bloom: () => import('./BloomPlugin').then(m => new m.BloomPlugin()),
  Fog: () => import('./FogPlugin').then(m => new m.FogPlugin())
}

export type PluginName = keyof typeof pluginRegistry
