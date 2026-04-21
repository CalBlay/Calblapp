import type { DraftInput, Row } from './types'

type SaveParams = {
  draft: DraftInput
  rows: Row[]
  groups: DraftInput['groups']
  vestimentModel?: string | null
  onSaved: (cleanedRows: Row[]) => void
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

    const res = await fetch('/api/quadrantsDraft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: draft.department,
        eventId: draft.id,
        rows: cleaned,
        groups,
        vestimentModel: vestimentModel ?? null,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Error en desar quadrant (status ${res.status})`)
    }

    alert('Quadrant desat correctament')
    onSaved(cleaned)
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
}

export async function confirmDraftTable({ draft, onConfirmed }: ConfirmParams) {
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
      alert('Quadrant confirmat correctament i notificacions enviades')
      window.dispatchEvent(new Event('quadrant:created'))
      return true
    }

    alert("No s'ha pogut confirmar")
    return false
  } catch (err) {
    console.error('Error confirmant quadrant', err)
    alert('Error confirmant quadrant')
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
