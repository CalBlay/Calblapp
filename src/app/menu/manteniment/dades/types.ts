export type MachineRow = {
  id: string
  code: string
  name: string
  label: string
  location?: string
  brand?: string
  model?: string
  serialNumber?: string
  supplierId?: string
  supplierName?: string
  active?: boolean
}

export type CenterRow = {
  id: string
  name: string
  code: string
  tipus: string
  travelMinutes: number
}

export type SupplierRow = {
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  notes?: string
  active?: boolean
  /** Àmbits on s’usa el proveïdor (mateixa col·lecció que Roba personal). */
  supplierDepartments?: string[]
}

export type ResolutionCategoryRow = {
  id: string
  name: string
  active?: boolean
}

export const emptyMachine = {
  id: '',
  code: '',
  name: '',
  location: '',
  brand: '',
  model: '',
  serialNumber: '',
  supplierId: '',
  supplierName: '',
  active: true,
}

export const emptySupplier = {
  id: '',
  name: '',
  email: '',
  phone: '',
  specialty: '',
  notes: '',
  active: true,
  supplierDepartments: ['Manteniment'] as string[],
}

export const emptyResolutionCategory = {
  id: '',
  name: '',
  active: true,
}

export type MachineView = typeof emptyMachine
export type MachineViewTab = 'summary' | 'tickets' | 'timeline' | 'data'
export type ResolutionCategoryView = typeof emptyResolutionCategory

export type MachineListStats = {
  total: number
  openCount: number
  pendingValidation: number
  openStatus: string | null
  trackedMinutes: number
  lastMovement: number
}

export type MachineTimelineItem = {
  id: string
  ticketId: string
  status: string
  label: string
  at: number
  byName?: string
  note?: string
  startTime?: string | null
  endTime?: string | null
}
