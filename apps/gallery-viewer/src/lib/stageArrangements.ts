import type { LayoutParams, PhotoArrangement } from '@vie/gallery-contracts'

/** Every path brings d=0 to the reading position; all other photos remain reachable by stepping. */
export function stageArrangement(d: number, arrangement: PhotoArrangement, mobile: boolean, params: LayoutParams = {}) {
  const a = Math.abs(d), offset = d * (params.spacing ?? 1)
  const radius = (params.radius ?? 340) / 340
  let x = 0, y = 0, z = 180, ry = 0, rz = 0
  switch (arrangement) {
    case 'tunnel': {
      // Successive works travel from the distant vanishing point, across the
      // viewport and past the viewer, instead of orbiting a fixed central card.
      const angle = offset * 1.42
      const spread = 1 - Math.exp(-Math.abs(offset) * 1.8)
      x = Math.sin(angle) * (mobile ? 270 : 590) * spread * radius
      y = Math.cos(angle) * (mobile ? 195 : 255) * spread
      z = 80 - offset * (mobile ? 400 : 490)
      ry = -Math.sin(angle) * .22; rz = Math.sin(angle) * .12
      break
    }
    case 'orbit': {
      const angle = offset * .66
      x = Math.sin(angle) * (mobile ? 390 : 730) * radius
      y = Math.sin(angle * 1.3) * (mobile ? 200 : 180)
      z = 180 - (1 - Math.cos(angle)) * 720 * radius
      ry = Math.sin(angle) * .8; rz = Math.sin(angle) * -.12
      break
    }
    case 'filmstrip':
      x = offset * (mobile ? 305 : 445); y = Math.sin(offset * .5) * 18
      z = 130 - a * 65; ry = Math.sin(offset * .3) * .08
      break
    case 'fan':
      x = Math.sin(offset * .38) * (mobile ? 410 : 780) * radius
      y = -Math.pow(Math.min(a, 5), 1.25) * 48
      z = 180 - a * 160; ry = Math.sin(offset * .35) * -.25; rz = -offset * .17
      break
    case 'wave':
      x = offset * (mobile ? 290 : 400); y = Math.sin(offset * .85) * (mobile ? 160 : 155)
      z = 150 - a * 115; ry = Math.sin(d * .65) * .3; rz = Math.sin(d * .85) * -.045
      break
    case 'arc': {
      const angle = offset * .48
      x = Math.sin(angle) * (mobile ? 440 : 840) * radius
      y = (1 - Math.cos(angle)) * 190
      z = 150 - (1 - Math.cos(angle)) * 660 * radius
      ry = Math.sin(angle) * .55
      break
    }
    case 'cascade':
      x = offset * (mobile ? 240 : 330); y = -offset * (mobile ? 210 : 195)
      z = 170 - a * 150; ry = Math.sin(offset * .5) * .2; rz = Math.sin(offset) * .055
      break
    case 'stack':
      x = offset * (mobile ? 75 : 130); y = -offset * 40
      z = 210 - a * 240; ry = Math.sin(offset) * -.15; rz = -offset * .1
      break
    default: {
      const turns = (params.turns ?? 1.15) / 1.15
      x = Math.sin(offset * .78 * turns) * (mobile ? 355 : 710) * radius
      y = Math.sin(offset * .85 * turns) * (mobile ? 275 : 280) * (params.height ?? 430) / 430
      z = 180 - a * (params.spacing ?? 1) * 260 * radius
      ry = Math.sin(offset * .78 * turns) * .48; rz = Math.sin(offset * .6) * -.07
    }
  }
  return { x, y, z, ry, rz }
}
