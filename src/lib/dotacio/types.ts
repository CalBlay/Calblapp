/** En Firestore sovint és Timestamp; en API JSON pot ser ISO string. */
export type DotacioDate = Date | string | { toDate?: () => Date }

/**
 * Producte en catàleg / estoc.
 *
 * Obligatoris (negoci): code, supplier, name, size.
 */
export interface DotacioProduct {
  /** Codi intern article (obligatori). */
  code: string
  /** Proveïdor (obligatori). */
  supplier: string
  /** Nom comercial / descripció curta (obligatori). */
  name: string
  /** Talla o variant (obligatori; pot ser "Única" / "N/A" si no aplica). */
  size: string

  supplierSku?: string
  unit?: string
  category?: string
  isActive?: boolean
  minStock?: number
  /** Cache opcional de quantitat; es pot derivar només de moviments. */
  quantityOnHand?: number
  notes?: string
  /** EPI: data límit o revisió, si aplica. */
  epiReviewDueAt?: DotacioDate
  createdAt?: DotacioDate
  updatedAt?: DotacioDate
}

export type DotacioProductCreate = Pick<
  DotacioProduct,
  'code' | 'supplier' | 'name' | 'size'
> &
  Partial<Omit<DotacioProduct, 'code' | 'supplier' | 'name' | 'size'>>

/**
 * Treballador per a dotacions i CSV.
 *
 * Obligatoris (negoci): name, code, department.
 */
export interface DotacioWorker {
  /** Nom complet (obligatori). */
  name: string
  /** Codi treballador (obligatori). */
  code: string
  /** Departament (obligatori). */
  department: string

  email?: string
  phone?: string
  isActive?: boolean
  hiredAt?: DotacioDate
  jobTitle?: string
  notes?: string
  /** Origen del registre: import CSV, manual, etc. */
  source?: 'csv_import' | 'manual' | string
  lastImportBatchId?: string
  createdAt?: DotacioDate
  updatedAt?: DotacioDate
}

export type DotacioWorkerCreate = Pick<
  DotacioWorker,
  'name' | 'code' | 'department'
> &
  Partial<Omit<DotacioWorker, 'name' | 'code' | 'department'>>

/** Moviment d’estoc (entrada manual positiva; sortides via entrega es poden modelar en negatiu o només a deliveries). */
export interface DotacioStockMovement {
  productId: string
  /** Positiu = entrada; negatiu = sortida si es registra aquí. */
  quantityDelta: number
  reason?: string
  reference?: string
  notes?: string
  createdByUserId?: string
  createdAt?: DotacioDate
}

export type DotacioRequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'fulfilled'
  | 'cancelled'

export interface DotacioRequestLine {
  productId: string
  quantity: number
  notes?: string
}

/** Sol·licitud de material (departament → RRHH / magatzem). */
export interface DotacioRequest {
  /** Departament que demana (o id; flexible fins que definiu mestre). */
  requestingDepartment: string
  lines: DotacioRequestLine[]
  status?: DotacioRequestStatus
  requestedByWorkerId?: string
  notes?: string
  createdAt?: DotacioDate
  updatedAt?: DotacioDate
}

export interface DotacioDeliveryLine {
  productId: string
  quantity: number
  notes?: string
}

/** Entrega registrada a treballador. */
export interface DotacioDelivery {
  workerId: string
  lines: DotacioDeliveryLine[]
  deliveredAt?: DotacioDate
  /** Signatura URL, hash, o referència a document. */
  acknowledgmentRef?: string
  notes?: string
  createdByUserId?: string
  createdAt?: DotacioDate
}

/** Registre d’enviament de correu de necessitats a compres (auditoria). */
export interface DotacioPurchaseEmailLog {
  to: string
  subject: string
  bodySummary?: string
  /** Snapshot JSON de línies necessitats (producte, qty suggerida…). */
  payloadSnapshot?: unknown
  sentAt?: DotacioDate
  createdByUserId?: string
}
