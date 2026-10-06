// Core plugins
export { LayoutPlugin } from './LayoutPlugin'
export { ClickRipplePlugin } from './ClickRipplePlugin'
export { LightingPlugin } from './LightingPlugin'
export { PhotoFadePlugin } from './PhotoFadePlugin'
export { CursorTrailPlugin } from './CursorTrailPlugin'

// Visual effects plugins (from vie-mei)
export { ParticlesPlugin } from './ParticlesPlugin'
export { BackgroundPlugin } from './BackgroundPlugin'
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
import { pluginRegistry } from './registry'
export { pluginRegistry }

export type PluginName = keyof typeof pluginRegistry
