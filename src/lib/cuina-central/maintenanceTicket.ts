import type { CuinaCentralMachine } from './types'
import type { ManualTicketRouting } from '@/lib/maintenanceTicketCreators'

/** Ubicació estàndard per tickets des del mòdul Cuina central. */
export const CUINA_CENTRAL_TICKET_LOCATION = 'Cuina Central'

export const CUINA_CENTRAL_TICKET_ROUTING: ManualTicketRouting = {
  source: 'manual_cuina_central',
  intakeChannel: 'manual_cuina_central',
  workflowStage: 'planner_queue',
}

export function machineLabel(machine: Pick<CuinaCentralMachine, 'code' | 'name'>) {
  const code = String(machine.code || '').trim()
  const name = String(machine.name || '').trim()
  if (code && name) return `${code} · ${name}`
  return code || name
}
