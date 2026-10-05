import type { ParticleType } from '@vie/gallery-contracts'
export const PARTICLE_TYPES: readonly ParticleType[] = ['stars', 'hearts', 'sakura', 'snow', 'fireflies', 'meteors']
export function allocateParticleCounts(base: Record<ParticleType, number>, types: ParticleType[], density: number, budget: number): Record<ParticleType, number> {
  const counts = Object.fromEntries(PARTICLE_TYPES.map(key => [key, types.includes(key) ? Math.round(base[key] * density) : 0])) as Record<ParticleType, number>
  const sum = Object.values(counts).reduce((a, b) => a + b, 0)
  if (sum <= budget) return counts
  const desired = { ...counts }
  for (const key of PARTICLE_TYPES) counts[key] = Math.floor(desired[key] * budget / sum)
  let remaining = budget - Object.values(counts).reduce((a, b) => a + b, 0)
  for (const key of PARTICLE_TYPES) if (remaining > 0 && counts[key] < desired[key]) { counts[key]++; remaining-- }
  return counts
}
