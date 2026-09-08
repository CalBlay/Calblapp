/** Tipus client-safe del PE (sense firebaseAdmin). */

import type { PeMode, PeResult } from '@/lib/costServeis/peCalc'

export type PeSeedOptions = {
  serviceTypes: string[]
  locations: string[]
  lns: string[]
}

export type PeSeedMeta = {
  from: string
  to: string
  serviceType: string
  location: string
  ln: string
  eventCount: number
  eventsWithSheet: number
  monthsMissingFixed: string[]
  monthsMissingEstructura: string[]
  pctYear: number
  pctSource: 'ln' | 'general' | 'none'
  opsiaLnCodi: string | null
}

export type PeSeedInputs = {
  billing: number
  cvOperatiu: number
  pctCompres: number
  pctGestio: number
  fixDirecte: number
  fixIndirecte: number
  numPax: number
  mode: PeMode
}

export type PeSeedResponse = {
  from: string
  to: string
  options: PeSeedOptions
  meta?: PeSeedMeta
  seed?: PeSeedInputs
  result?: PeResult
  error?: string
}
