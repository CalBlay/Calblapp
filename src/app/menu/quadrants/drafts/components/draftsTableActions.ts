import { toast } from 'sonner'
import type { DraftInput, Row } from './types'
import { validateEditorRowsNoDuplicatePeople } from '@/lib/manualAssignModel'

type SaveResponse = {
  ok?: boolean
  saved?: {
    normalizedRows?: Row[]
    updateData?: {
      groups?: DraftInput['groups']
      updatedAt?: string | null
    }
  }
}

type SaveParams = {
  draft: DraftInput
  rows: Row[]
  groups: DraftInput['groups']
  vestimentModel?: string | null
  onSaved: (payload: {
    cleanedRows: Row[]
    savedRows: Row[]
    savedGroups?: DraftInput['groups']
    savedUpdatedAt?: string | null
  }) => void
}

export async function saveDraftTable({
  draft,
  rows,
  groups,
  vestimentModel,
  onSaved,
}: SaveParams) {
  try {
    const cleaned = rows.filter((r) => r.name?.trim() !== '' || r.id?.trim() !== '')

    const duplicateError = validateEditorRowsNoDuplicatePeople(cleaned)
    if (duplicateError) {
      toast.error(duplicateError)
      return false
    }

    const draftMeta = draft as DraftInput & {
      phaseType?: string
      phaseLabel?: string
      phaseDate?: string
      code?: string
      eventName?: string
      location?: string | Record<string, unknown>
      meetingPoint?: string
      startDate?: string
      endDate?: string
      startTime?: string
      endTime?: string
    }

    const res = await fetch('/api/quadrantsDraft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: draft.department,
        eventId: draft.id,
        rows: cleaned,
        groups,
        vestimentModel: vestimentModel ?? null,
        phaseType: draftMeta.phaseType ?? null,
        phaseLabel: draftMeta.phaseLabel ?? null,
        phaseDate: draftMeta.phaseDate ?? null,
        code: draftMeta.code ?? null,
        eventName: draftMeta.eventName ?? null,
        location: draftMeta.location ?? null,
        meetingPoint: draftMeta.meetingPoint ?? null,
        startDate: draftMeta.startDate ?? null,
        endDate: draftMeta.endDate ?? null,
        startTime: draftMeta.startTime ?? null,
        endTime: draftMeta.endTime ?? null,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Error en desar quadrant (status ${res.status})`)
    }

    const json = (await res.json()) as SaveResponse
    const savedRows = Array.isArray(json?.saved?.normalizedRows)
      ? json.saved.normalizedRows
      : cleaned
    const savedGroups = Array.isArray(json?.saved?.updateData?.groups)
      ? json.saved.updateData.groups
      : groups

    toast.success('Quadrant desat correctament')
    onSaved({
      cleanedRows: cleaned,
      savedRows,
      savedGroups,
      savedUpdatedAt:
        typeof json?.saved?.updateData?.updatedAt === 'string'
          ? json.saved.updateData.updatedAt
          : null,
    })
    window.dispatchEvent(new Event('quadrant:updated'))
    return true
  } catch (err) {
    console.error('Error desa quadrant', err)
    alert('Error en desar quadrant')
    return false
  }
}

type ConfirmParams = {
  draft: DraftInput
  onConfirmed: () => void
  silent?: boolean
}

export async function confirmDraftTable({ draft, onConfirmed, silent = false }: ConfirmParams) {
  try {
    const res = await fetch('/api/quadrantsDraft/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: draft.department,
        eventId: draft.id,
      }),
    })
    if (!res.ok) throw new Error('Error confirmant quadrant')
    const data = await res.json()
    if (data.ok) {
      onConfirmed()
      if (!silent) {
        alert('Quadrant confirmat correctament i notificacions enviades')
      }
      window.dispatchEvent(new Event('quadrant:created'))
      return true
    }

    if (!silent) alert("No s'ha pogut confirmar")
    return false
  } catch (err) {
    console.error('Error confirmant quadrant', err)
    if (!silent) alert('Error confirmant quadrant')
    return false
  }
}

type UnconfirmParams = {
  draft: DraftInput
  onUnconfirmed: () => void
}

export async function unconfirmDraftTable({
  draft,
  onUnconfirmed,
}: UnconfirmParams) {
  try {
    const res = await fetch('/api/quadrantsDraft/unconfirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: draft.department,
        eventId: draft.id,
      }),
    })
    if (!res.ok) throw new Error('Error reobrint quadrant')
    onUnconfirmed()
    alert('Quadrant reobert')
    window.dispatchEvent(new Event('quadrant:created'))
    return true
  } catch (err) {
    console.error('Error reobrint quadrant', err)
    alert('Error reobrint quadrant')
    return false
  }
}

type DeleteParams = {
  draft: DraftInput
  rows: Row[]
}

export async function deleteDraftTable({ draft, rows }: DeleteParams) {
  if (!confirm('Segur que vols eliminar aquest quadrant?')) return false

  try {
    const res = await fetch('/api/quadrantsDraft/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: draft.department,
        eventId: draft.id,
        rows,
      }),
    })
    if (!res.ok) throw new Error('Error eliminant quadrant')
    alert('Quadrant eliminat correctament')
    window.dispatchEvent(new Event('quadrant:updated'))
    return true
  } catch (err) {
    console.error('Error eliminant quadrant', err)
    alert('Error eliminant quadrant')
    window.dispatchEvent(new Event('quadrant:updated'))
    return false
  }
}
