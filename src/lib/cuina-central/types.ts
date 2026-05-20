export type CustomFields = Record<string, string | number | boolean | null>

export type CuinaCentralArticle = {
  id: string
  code: string
  name: string
  unit: string
  packagingLabel: string
  packagingQty: number | null
  line: 'bases'
  active: boolean
  customFields: CustomFields
  createdAt: number | null
  updatedAt: number | null
}

export type CuinaCentralMachine = {
  id: string
  code: string
  name: string
  location: string
  zone: string
  mapX: number | null
  mapY: number | null
  active: boolean
  customFields: CustomFields
  createdAt: number | null
  updatedAt: number | null
}

export type CuinaCentralShift = {
  id: string
  code: string
  name: string
  startTime: string
  endTime: string
  durationMinutes: number
  sortOrder: number
  active: boolean
  customFields: CustomFields
  createdAt: number | null
  updatedAt: number | null
}

export type CuinaCentralMachineArticleRate = {
  id: string
  machineId: string
  machineCode: string
  machineName: string
  articleId: string
  articleCode: string
  articleName: string
  unit: string
  qtyPerHour: number
  notes: string
  customFields: CustomFields
  createdAt: number | null
  updatedAt: number | null
}

export type CuinaCentralProductionLog = {
  id: string
  articleId: string
  articleCode: string
  articleName: string
  machineId: string
  machineCode: string
  machineName: string
  shiftId: string
  shiftName: string
  unit: string
  quantityProduced: number
  quantityRejected: number
  startedAt: string
  endedAt: string
  durationMinutes: number
  operatorNames: string
  notes: string
  customFields: CustomFields
  createdAt: number | null
  updatedAt: number | null
}

export type PlanNeedLine = {
  articleId: string
  articleCode: string
  articleName: string
  quantity: number
  unit: string
}

export type PlanSlot = {
  day: string
  shiftId: string
  shiftName: string
  machineId: string
  machineCode: string
  machineName: string
  articleId: string
  articleCode: string
  articleName: string
  quantity: number
  unit: string
  estimatedMinutes: number
  operatorCount: number
}

export type CuinaCentralProductionPlan = {
  id: string
  weekStart: string
  status: 'draft' | 'confirmed'
  operatorCountByShift: Record<string, number>
  needs: PlanNeedLine[]
  slots: PlanSlot[]
  warnings: string[]
  totalEstimatedMinutes: number
  totalCapacityMinutes: number
  overtimeMinutes: number
  createdAt: number | null
  updatedAt: number | null
}

export type ImportEntity = 'articles' | 'machines' | 'shifts' | 'rates'

export type ArticleMachineMetrics = {
  articleId: string
  articleCode: string
  articleName: string
  machineId: string
  machineCode: string
  machineName: string
  unit: string
  sampleCount: number
  medianMinutesPerUnit: number | null
  medianQtyPerHour: number | null
  theoreticalQtyPerHour: number | null
  efficiencyRatio: number | null
  lastLogAt: string | null
}
