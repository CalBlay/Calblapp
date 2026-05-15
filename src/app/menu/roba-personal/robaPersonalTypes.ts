export type { RobaProductDepartmentId } from '@/data/departments'

export type TabId =
  | 'productes'
  | 'treballadors'
  | 'estoc'
  | 'sollicituds'
  | 'preparacio'
  | 'recollides'
  | 'entregues'
  | 'compres'

export type RobaPersonalRequestNotification = {
  id: string
  type?: string
  read?: boolean
  title?: string
  body?: string
  requestId?: string
  deliveryId?: string
  reference?: string
  requestingDepartment?: string
  requestedByWorkerName?: string | null
  linesSummary?: string | null
  lineCount?: number
  createdByUserName?: string | null
}

export type ProductRow = {
  id: string
  code: string
  supplier: string
  supplierId?: string | null
  supplierSku?: string | null
  name: string
  size?: string
  grup?: string | null
  familia?: string | null
  subfamilia?: string | null
  departments?: string[] | null
  magatzem?: string
  quantityOnHand?: number
  quantityReserved?: number
  minStock?: number | null
  isActive?: boolean
}

export type WorkerRow = {
  id: string
  name: string
  code: string
  department: string
  isActive?: boolean
  hasAppUser?: boolean
}

export type StockOverviewRow = {
  productId: string
  code: string
  name: string
  size?: string
  supplier: string
  magatzem: string
  quantityOnHand: number
  quantityReserved?: number
  quantityAvailable?: number
  quantityPendingTheoretical?: number
  quantityAvailableAfterTheoretical?: number
  minStock: number | null
  gapToMin: number
  consumption6m: number
  annualDeliveredCurrentYear: number
  annualDeliveredPreviousYear: number
  avgDaily: number
  avgDailySource?: 'since_last_inbound' | 'last_180_days'
  avgDailyWindowDays?: number
  daysUntilMin: number | null
  atOrBelowMin: boolean
  hasConsumptionHistory: boolean
  suggestedSemesterQty: number | null
}

export type RequestRow = {
  id: string
  reference?: string
  requestingDepartment: string
  requestingDepartmentNorm?: string
  requestedByWorkerId?: string
  requestedByWorkerName?: string
  createdByUserId?: string
  createdByUserName?: string | null
  pickupDate?: string
  pickupAvailabilityMessage?: string | null
  preparedWithStockReservation?: boolean
  notes?: string | null
  status: string
  originalRequestedLines?: { productId: string; quantity: number; notes?: string }[] | null
  lines: { productId: string; quantity: number }[]
  createdAt?: string
}

export type DeliveryRow = {
  id: string
  reference?: string
  workerId: string
  lines: { productId: string; quantity: number }[]
  requestedLines?: { productId: string; quantity: number; notes?: string }[] | null
  deliveredAt?: string
  requestId?: string | null
  requestCreatedByUserName?: string | null
  requestCreatedByUserEmail?: string | null
  requestPreparedByName?: string | null
  requestRequestingDepartment?: string | null
  deliveryWithoutRequest?: boolean
  workerReceiptAckExpected?: boolean
  workerReceiptAckAt?: string | null
  workerReceiptAckByUserId?: string | null
  acknowledgmentSignatureDataUrl?: string | null
  workerReceiptAckSignatureDataUrl?: string | null
  workerReceiptCorrectionOpen?: boolean
  /** Quantitats que el treballador proposa en una sol·licitud de rectificació (pendent de revisió per roba). */
  workerReceiptDisputeProposedLines?: { productId: string; quantity: number }[] | null
}
