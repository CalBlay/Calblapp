import type { CuinaCentralMachine } from './types'
import type { MachineItem } from '@/app/menu/manteniment/tickets/types'
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

export function cuinaCentralMachineToTicketItem(
  machine: CuinaCentralMachine
): MachineItem {
  const code = String(machine.code || '').trim()
  const name = String(machine.name || '').trim()
  const label = machineLabel(machine)
  return { code, name, label, location: CUINA_CENTRAL_TICKET_LOCATION }
}

export function mergeTicketMachines(
  maintenance: MachineItem[],
  cuinaCentral: CuinaCentralMachine[]
): MachineItem[] {
  const byLabel = new Map<string, MachineItem>()
  for (const item of maintenance) {
    const label = String(item.label || '').trim()
    if (label) byLabel.set(label.toLowerCase(), item)
  }
  for (const machine of cuinaCentral) {
    const item = cuinaCentralMachineToTicketItem(machine)
    if (item.label) byLabel.set(item.label.toLowerCase(), item)
  }
  return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label, 'ca'))
}

export function ensureCuinaCentralLocation(locations: string[]) {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
  const key = norm(CUINA_CENTRAL_TICKET_LOCATION)
  if (locations.some((loc) => norm(loc) === key)) return locations
  return [CUINA_CENTRAL_TICKET_LOCATION, ...locations]
}
