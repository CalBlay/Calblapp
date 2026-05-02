/** Prefix de col·leccions Firestore per al mòdul de dotació / estoc (sense ERP). */
export const DOTACIO_COLLECTIONS = {
  products: 'dotacio_products',
  /** Mateix magatzem Firestore que el mòdul Personal (`personnel`); només el mòdul Roba personal escriu camps `workerCode`, `roba*`. */
  workers: 'personnel',
  stockMovements: 'dotacio_stock_movements',
  requests: 'dotacio_requests',
  deliveries: 'dotacio_deliveries',
  purchaseEmailLog: 'dotacio_purchase_email_log',
  /** Valors de classificació (grup / família / subfamília) creats manualment des de Roba personal. */
  productTaxonomy: 'dotacio_roba_taxonomy',
} as const
