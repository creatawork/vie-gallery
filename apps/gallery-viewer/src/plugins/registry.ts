/** Lazy factories used by the viewer engine without eagerly re-exporting effects. */
export const pluginRegistry = {
  Layout: () => import('./LayoutPlugin').then(m => new m.LayoutPlugin()),
  ClickRipple: () => import('./ClickRipplePlugin').then(m => new m.ClickRipplePlugin()),
  Lighting: () => import('./LightingPlugin').then(m => new m.LightingPlugin()),
  PhotoFade: () => import('./PhotoFadePlugin').then(m => new m.PhotoFadePlugin()),
  CursorTrail: () => import('./CursorTrailPlugin').then(m => new m.CursorTrailPlugin()),
  Particles: () => import('./ParticlesPlugin').then(m => new m.ParticlesPlugin()),
  Background: () => import('./BackgroundPlugin').then(m => new m.BackgroundPlugin()),
  Fog: () => import('./FogPlugin').then(m => new m.FogPlugin())
}

export async function preloadVisualEffects(enabled: {
  particles: boolean
  fog: boolean
  clickRipple: boolean
  cursorTrail: boolean
}): Promise<void> {
  await Promise.all([
    import('./BackgroundPlugin'),
    ...(enabled.particles ? [import('./ParticlesPlugin')] : []),
    ...(enabled.fog ? [import('./FogPlugin')] : []),
    ...(enabled.clickRipple ? [import('./ClickRipplePlugin')] : []),
    ...(enabled.cursorTrail ? [import('./CursorTrailPlugin')] : [])
  ])
}
