/** Keep the reading position clear of the visitor controls, at every screen ratio. */
export function stageFraming(width: number, height: number, fov: number, distance: number, immersive = false, preview = false, extraBottom = 0) {
  const mobile = width / height < .85
  const compact = height < 560
  const top = preview ? 56 : immersive ? 40 : compact ? 108 : mobile ? 190 : 202
  const bottom = (preview ? 24 : immersive ? 58 : compact ? 128 : mobile ? 232 : 188) + (preview || immersive ? 0 : extraBottom)
  const usableHeight = Math.max(height * .26, height - top - bottom)
  const usableWidth = immersive || preview ? width * .9 : mobile ? width - 48 : Math.min(width * .64, 1120)
  const worldHeight = 2 * Math.tan(fov * Math.PI / 360) * distance
  const unitsPerPixel = worldHeight / height
  return {
    width: Math.max(80, usableWidth) * unitsPerPixel,
    height: usableHeight * unitsPerPixel,
    centerY: (height / 2 - top - usableHeight / 2) * unitsPerPixel,
  }
}
