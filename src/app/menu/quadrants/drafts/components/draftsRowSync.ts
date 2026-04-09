import type { DraftInput, Row } from './types'

type AvailableLists = {
  responsables: Array<{ id: string; name: string; alias?: string }>
  conductors: Array<{ id: string; name: string; alias?: string }>
  treballadors: Array<{ id: string; name: string; alias?: string }>
}

const normKey = (s?: string) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

const normPlate = (s?: string) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '')

/** Localitza el conductor al document (després d’Assignacions l’`id` de la fila pot quedar desfasat). */
function findDraftConductorForRow(
  row: Row,
  draft: DraftInput
): {
  id?: string
  name?: string
  plate?: string
  vehicleType?: string
  arrivalTime?: string
} | undefined {
  const list = Array.isArray(draft.conductors) ? draft.conductors : []
  if (list.length === 0) return undefined
  const rid = String(row.id || '').trim()
  if (rid) {
    const byId = list.find((c: { id?: string }) => String(c?.id || '').trim() === rid)
    if (byId) return byId as (typeof list)[0]
  }
  const p = normPlate(row.plate)
  if (p) {
    const byPlate = list.find((c: { plate?: string }) => normPlate(c?.plate) === p)
    if (byPlate) return byPlate as (typeof list)[0]
  }
  const rn = normKey(row.name)
  if (rn) {
    const byName = list.filter((c: { name?: string }) => normKey(c?.name) === rn)
    if (byName.length === 1) return byName[0] as (typeof list)[0]
  }
  if (list.length === 1) return list[0] as (typeof list)[0]
  return undefined
}

function rosterLookup(
  id: string,
  available: AvailableLists
): { name: string } | null {
  const all = [
    ...(available.responsables || []),
    ...(available.conductors || []),
    ...(available.treballadors || []),
  ]
  const hit = all.find((p) => String(p.id || '').trim() === id)
  if (!hit) return null
  const name = String(hit.name || hit.alias || '').trim()
  return name ? { name } : null
}

/**
 * Alinea `name` (i dades de vehicle del conductor) amb `draft.*` i el roster de personal,
 * quan `row.id` és consistent però el text del model d’editor queda desfasat (p. ex. després
 * d’editar des d’Assignacions).
 */
export function syncRowsWithDraftAndRoster(
  rows: Row[],
  draft: DraftInput,
  available: AvailableLists
): Row[] {
  const next = rows.map((row) => {
    const id = String(row.id || '').trim()
    if (!id || row.isExternal) return row

    const roster = rosterLookup(id, available)
    const patches: Partial<Row> = {}

    if (row.role === 'conductor') {
      const dc = findDraftConductorForRow(row, draft)
      const rosterName = roster?.name?.trim()
      const draftName = String(dc?.name || '').trim()
      /** El document del quadrant (Assignacions) preval sobre el roster per `id`. */
      const bestName = draftName || rosterName || row.name
      if (bestName && normKey(bestName) !== normKey(row.name)) {
        patches.name = bestName
      }
      const draftId = String(dc?.id || '').trim()
      if (draftId && draftId !== id) {
        patches.id = draftId
      }
      if (dc) {
        const p = String(dc.plate ?? '').trim()
        if (p && p !== String(row.plate || '').trim()) {
          patches.plate = p
        }
        const vt = String(dc.vehicleType ?? '').trim()
        if (vt && vt !== String(row.vehicleType || '').trim()) {
          patches.vehicleType = vt
        }
        const at = String(dc.arrivalTime ?? '').trim()
        if (at && at !== String(row.arrivalTime || '').trim()) {
          patches.arrivalTime = at
        }
      }
      return Object.keys(patches).length ? { ...row, ...patches } : row
    }

    if (row.role === 'treballador' && !row.isExternal) {
      const dw = (draft.treballadors || []).find(
        (t: { id?: string; name?: string }) => String(t?.id || '').trim() === id
      )
      const rosterName = roster?.name?.trim()
      const draftName = String(dw?.name || '').trim()
      const bestName = draftName || rosterName || row.name
      if (bestName && normKey(bestName) !== normKey(row.name)) {
        return { ...row, name: bestName }
      }
      return row
    }

    if (row.role === 'responsable') {
      const respId = String(
        (draft as { responsableId?: string; responsable?: { id?: string } }).responsableId ||
          (draft as { responsable?: { id?: string } }).responsable?.id ||
          ''
      ).trim()
      const rosterName = roster?.name?.trim()
      const draftName = String(
        (draft as { responsableName?: string; responsable?: { name?: string } }).responsableName ||
          (draft as { responsable?: { name?: string } }).responsable?.name ||
          ''
      ).trim()
      const sameResp = respId && respId === id
      const bestName = (sameResp ? draftName || rosterName : rosterName || '') || row.name
      if (bestName && normKey(bestName) !== normKey(row.name)) {
        return { ...row, name: bestName }
      }
      return row
    }

    return row
  })
  const changed = next.some((row, i) => row !== rows[i])
  return changed ? next : rows
}
