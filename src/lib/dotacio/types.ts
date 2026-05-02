/** En Firestore sovint és Timestamp; en API JSON pot ser ISO string. */
export type DotacioDate = Date | string | { toDate?: () => Date }

/**
 * Producte en catàleg / estoc.
 *
 * Obligatoris (negoci): code, supplier (nom denormalitzat), name.
 * La talla va dins la descripció; `size` és opcional (llegat).
 */
export interface DotacioProduct {
  /** Codi intern article (obligatori). */
  code: string
  /** Proveïdor (nom denormalitzat). */
  supplier: string
  /** Id document `maintenanceSuppliers` (catàleg compartit amb Manteniment). */
  supplierId?: string | null
  /** Nom comercial / descripció curta (obligatori). */
  name: string
  /** Talla o variant (opcional). */
  size?: string

  grup?: string | null
  familia?: string | null
  subfamilia?: string | null
  departments?: string[]

  supplierSku?: string
  unit?: string
  category?: string
  /** Magatzem físic o lògic (per defecte «Roba personal» als nous articles). */
  magatzem?: string
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

export type DotacioProductCreate = Pick<DotacioProduct, 'code' | 'supplier' | 'name'> &
  Partial<Omit<DotacioProduct, 'code' | 'supplier' | 'name'>>

/**
 * Treballador per a dotacions i CSV.
 * Emmagatzemat a Firestore com a document de la col·lecció `personnel` (camps `workerCode`, `roba*`).
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
  | 'receipt_confirmed'
  | 'cancelled'

export interface DotacioRequestLine {
  productId: string
  quantity: number
  notes?: string
}

/** Sol·licitud de material (departament → RRHH / magatzem). */
export interface DotacioRequest {
  /** Referència automàtica visible (p. ex. S-{idFirestore}). */
  reference?: string
  /** Departament que demana (o id; flexible fins que definiu mestre). */
  requestingDepartment: string
  lines: DotacioRequestLine[]
  status?: DotacioRequestStatus
  requestedByWorkerId?: string
  /** Nom del treballador (denormalitzat des de `personnel`). */
  requestedByWorkerName?: string
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
  /** Referència automàtica de l’entrega (p. ex. E-{idFirestore}). */
  reference?: string
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
