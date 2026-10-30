let generation = 0

export const getQuadrantOverlapCacheGeneration = () => generation

export function invalidateQuadrantOverlapCache() {
  generation += 1
}

