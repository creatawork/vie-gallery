// Core plugins
export { LayoutPlugin } from './LayoutPlugin'
export { GradientBackgroundPlugin } from './GradientBackgroundPlugin'
export { ClickRipplePlugin } from './ClickRipplePlugin'

// Visual effects plugins (from vie-mei)
export { SkyDomePlugin } from './SkyDomePlugin'
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
 *   'SkyDome',
 *   'Particles',
 *   'Bloom'
 * ])
 * ```
 */
export const pluginRegistry = {
  // Core
  Layout: () => import('./LayoutPlugin').then(m => new m.LayoutPlugin()),
  GradientBackground: () => import('./GradientBackgroundPlugin').then(m => new m.GradientBackgroundPlugin()),
  ClickRipple: () => import('./ClickRipplePlugin').then(m => new m.ClickRipplePlugin()),

  // Visual effects
  SkyDome: () => import('./SkyDomePlugin').then(m => new m.SkyDomePlugin()),
  Particles: () => import('./ParticlesPlugin').then(m => new m.ParticlesPlugin()),
  Bloom: () => import('./BloomPlugin').then(m => new m.BloomPlugin()),
  Fog: () => import('./FogPlugin').then(m => new m.FogPlugin())
}

export type PluginName = keyof typeof pluginRegistry
