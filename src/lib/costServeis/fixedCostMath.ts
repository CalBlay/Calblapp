/** Reparteix un pot conservant els cèntims exactes. */
export function allocateCostPool<T>(
  rows: T[],
  pool: number,
  driver: (row: T) => number
): Map<T, number> {
  const round2 = (n: number) =>
    Math.round((n + Number.EPSILON) * 100) / 100
  const out = new Map<T, number>()
  const eligible = rows.filter((row) => driver(row) > 0)
  const totalDriver = eligible.reduce((sum, row) => sum + driver(row), 0)
  if (!(pool > 0) || !(totalDriver > 0)) {
    for (const row of rows) out.set(row, 0)
    return out
  }
  let allocated = 0
  eligible.forEach((row, index) => {
    const value =
      index === eligible.length - 1
        ? round2(pool - allocated)
        : round2((pool * driver(row)) / totalDriver)
    allocated = round2(allocated + value)
    out.set(row, value)
  })
  for (const row of rows) if (!out.has(row)) out.set(row, 0)
  return out
}

/** Calcula el personal indirecte real que queda per repartir a la LN. */
export function calculateIndirectPersonnelPool(input: {
  personalTotalLn: number | null | undefined
  fixedDirect: number | null | undefined
  operationalDirectTransfers: number | null | undefined
  mode?: 'FIX_DEPARTAMENTS' | 'RESIDUAL_LN'
  configuredFixed?: number | null
}): number | null {
  if (input.mode === 'FIX_DEPARTAMENTS') {
    if (input.configuredFixed == null || !Number.isFinite(input.configuredFixed)) {
      return null
    }
    return Math.round((Math.max(0, input.configuredFixed) + Number.EPSILON) * 100) / 100
  }
  if (input.personalTotalLn == null || !Number.isFinite(input.personalTotalLn)) {
    return null
  }
  if (input.fixedDirect == null || !Number.isFinite(input.fixedDirect)) return null
  const total = Math.max(0, input.personalTotalLn)
  const direct = Math.max(0, Number(input.fixedDirect) || 0)
  if (
    input.operationalDirectTransfers == null ||
    !Number.isFinite(input.operationalDirectTransfers)
  ) {
    return null
  }
  const operationalDirectTransfers = Math.max(
    0,
    Number(input.operationalDirectTransfers) || 0
  )
  return Math.round(
    (Math.max(0, total - direct - operationalDirectTransfers) + Number.EPSILON) * 100
  ) / 100
}
