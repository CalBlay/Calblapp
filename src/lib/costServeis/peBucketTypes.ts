/** Tipus client-safe: buckets PE precalculats (any × LN × servei × Propi/Extern). */

import type { SpaceKind } from '@/lib/costServeis/spaceOwnership'
import type { PeStatus } from '@/lib/costServeis/peCalc'

export const SERVICE_COST_PE_BUCKETS_COL = 'serviceCostPeBuckets'
export const PE_CALCULATION_VERSION = 2

export type PeBucketKey = {
  year: number
  ln: string
  serviceType: string
  spaceKind: SpaceKind
}

export type PeBucketDoc = PeBucketKey & {
  id: string
  calculationVersion?: number
  /** Totals del període de càlcul (any). */
  billing: number
  cvOperatiu: number
  numPax: number
  eventCount: number
  /** Mitjanes / PE. */
  preuMitjaPax: number | null
  cvOperatiuPerPax: number | null
  pctCompres: number
  pctGestio: number
  /** Cost fix directe normalitzat per un esdeveniment d'aquest perfil. */
  fixDirecte: number
  /** Cost fix indirecte normalitzat per un esdeveniment d'aquest perfil. */
  fixIndirecte: number
  fixos: number
  margePerPax: number | null
  pePax: number | null
  peEuro: number | null
  status: PeStatus
  headline: string
  opsiaLnCodi: string | null
  pctSource: 'ln' | 'general' | 'none'
  monthsUsed: string[]
  computedAt: string
}

export type PeBucketMetaDoc = {
  id: string
  calculationVersion?: number
  year: number
  bucketCount: number
  eventCount: number
  skippedNoSpace: number
  monthsMissingFixed: string[]
  monthsMissingEstructura: string[]
  computedAt: string
  computedBy?: string
}

export type PeLookupResponse = {
  year: number
  meta: PeBucketMetaDoc | null
  options: {
    /** LNs disponibles (sempre completes). */
    lns: string[]
    /** Centres disponibles (filtrats per LN si n’hi ha). */
    spaceKinds: SpaceKind[]
    /** Serveis actius disponibles (filtrats per LN + centre). */
    serviceTypes: string[]
  }
  bucket?: PeBucketDoc | null
  error?: string
}
