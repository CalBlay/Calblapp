import type { InformesDomainMeta } from './types'

/** Registre únic de dominis; afegir-ne aquí quan es vagin obrint àrees. */
export const INFORMES_DOMAINS: InformesDomainMeta[] = [
  {
    id: 'rrhh',
    label: 'RRHH',
    sources: ['app', 'mcp_file'],
    comingSoon: false,
  },
  {
    id: 'transports',
    label: 'Transports',
    sources: ['app'],
    comingSoon: false,
  },
  {
    id: 'finances',
    label: 'Finances',
    sources: ['app', 'mcp_file', 'hybrid'],
    comingSoon: true,
  },
  {
    id: 'compres',
    label: 'Compres',
    sources: ['app', 'erp', 'hybrid'],
    comingSoon: true,
  },
  {
    id: 'events',
    label: 'Esdeveniments',
    sources: ['app', 'hybrid'],
    comingSoon: true,
  },
]

export function informesDomainLabel(id: string): string {
  return INFORMES_DOMAINS.find((d) => d.id === id)?.label ?? id
}
