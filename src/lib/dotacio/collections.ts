/** Prefix de col·leccions Firestore per al mòdul de dotació / estoc (sense ERP). */
export const DOTACIO_COLLECTIONS = {
  products: 'dotacio_products',
  workers: 'dotacio_workers',
  stockMovements: 'dotacio_stock_movements',
  requests: 'dotacio_requests',
  deliveries: 'dotacio_deliveries',
  purchaseEmailLog: 'dotacio_purchase_email_log',
} as const
