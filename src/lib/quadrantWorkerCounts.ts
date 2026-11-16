export function getTargetInternalWorkerCount(params: {
  totalWorkers: number
  numDrivers: number
  responsibleCount: number
  externalWorkerCount: number
}): number {
  return Math.max(
    Number(params.totalWorkers || 0) -
      Number(params.numDrivers || 0) -
      Number(params.responsibleCount || 0) -
      Number(params.externalWorkerCount || 0),
    0
  )
}
