'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CalendarMailGroup, CalendarMailGroupMember } from '@/lib/calendar/calendarMailGroups'

const LN_OPTIONS = ['', 'Casaments', 'Empresa', 'Foodlovers', 'Grups Restaurants', 'Altres']

type UserOption = {
  id: string
  name: string
  email: string
}

type EditorState = {
  id?: string
  name: string
  description: string
  ln: string
  members: CalendarMailGroupMember[]
}

const emptyEditor = (): EditorState => ({
  name: '',
  description: '',
  ln: '',
  members: [],
})

export default function CalendarMailGroupsPanel() {
  const [groups, setGroups] = useState<CalendarMailGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>(emptyEditor)
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [memberEmail, setMemberEmail] = useState('')
  const [memberName, setMemberName] = useState('')

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/mail-groups', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(String(data?.error || 'No s’han pogut carregar els grups'))
      setGroups(Array.isArray(data?.groups) ? data.groups : [])
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'No s’han pogut carregar els grups')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    let active = true
    const loadUsers = async () => {
      try {
        const res = await fetch('/api/users?view=project-options')
        const data = await res.json()
        if (!Array.isArray(data) || !active) return
        const options = data
          .map((row: { id?: string; name?: string; email?: string }) => ({
            id: String(row.id || ''),
            name: String(row.name || '').trim(),
            email: String(row.email || '').trim().toLowerCase(),
          }))
          .filter((row) => row.email.includes('@'))
        setUserOptions(options)
      } catch (err) {
        console.error('Error carregant usuaris:', err)
      }
    }
    void loadUsers()
    return () => {
      active = false
    }
  }, [])

  const userByEmail = useMemo(() => {
    const map = new Map<string, UserOption>()
    userOptions.forEach((user) => map.set(user.email.toLowerCase(), user))
    return map
  }, [userOptions])

  const openCreate = () => {
    setEditor(emptyEditor())
    setMemberEmail('')
    setMemberName('')
    setEditorOpen(true)
  }

  const openEdit = (group: CalendarMailGroup) => {
    setEditor({
      id: group.id,
      name: group.name,
      description: group.description || '',
      ln: group.ln || '',
      members: group.members,
    })
    setMemberEmail('')
    setMemberName('')
    setEditorOpen(true)
  }

  const addMember = () => {
    const email = memberEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    const matched = userByEmail.get(email)
    const name = String(memberName || matched?.name || email).trim() || email
    setEditor((current) => {
      if (current.members.some((member) => member.email.toLowerCase() === email)) {
        return current
      }
      return {
        ...current,
        members: [...current.members, { name, email }],
      }
    })
    setMemberEmail('')
    setMemberName('')
  }

  const removeMember = (email: string) => {
    const key = email.toLowerCase()
    setEditor((current) => ({
      ...current,
      members: current.members.filter((member) => member.email.toLowerCase() !== key),
    }))
  }

  const saveGroup = async () => {
    const payload = {
      name: editor.name.trim(),
      description: editor.description.trim(),
      ln: editor.ln.trim(),
      members: editor.members,
    }
    if (!payload.name) {
      alert('Cal indicar un nom per al grup.')
      return
    }
    if (payload.members.length === 0) {
      alert('Cal afegir almenys un destinatari.')
      return
    }

    setSaving(true)
    try {
      const isEdit = Boolean(editor.id)
      const res = await fetch(
        isEdit ? `/api/calendar/mail-groups/${editor.id}` : '/api/calendar/mail-groups',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(String(data?.error || 'No s’ha pogut desar el grup'))
      setEditorOpen(false)
      await loadGroups()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'No s’ha pogut desar el grup')
    } finally {
      setSaving(false)
    }
  }

  const deleteGroup = async (group: CalendarMailGroup) => {
    if (!confirm(`Vols eliminar el grup «${group.name}»?`)) return
    try {
      const res = await fetch(`/api/calendar/mail-groups/${group.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'No s’ha pogut eliminar el grup'))
      await loadGroups()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'No s’ha pogut eliminar el grup')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/menu/calendar"
            className="mb-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Tornar al calendari
          </Link>
          <h1 className="text-xl font-semibold">Grups d’enviament</h1>
          <p className="text-sm text-slate-500">
            Creeu llistes de destinataris reutilitzables per enviar documents des del calendari.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" />
          Nou grup
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregant grups…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Encara no teniu cap grup d’enviament. Creeu el primer per estalviar temps en futurs enviaments.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-slate-500" />
                    <h2 className="truncate font-semibold text-slate-900">{group.name}</h2>
                  </div>
                  {group.ln ? (
                    <p className="mt-1 text-xs text-slate-500">Línia de negoci: {group.ln}</p>
                  ) : null}
                  {group.description ? (
                    <p className="mt-2 text-sm text-slate-600">{group.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    {group.members.length} destinatari{group.members.length === 1 ? '' : 's'}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {group.members.map((member) => member.name || member.email).join(', ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(group)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => void deleteGroup(group)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold">
                {editor.id ? 'Editar grup' : 'Nou grup d’enviament'}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Tancar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                <Label>Nom del grup</Label>
                <Input
                  value={editor.name}
                  onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex. Casaments · Producció"
                />
              </div>

              <div className="space-y-2">
                <Label>Línia de negoci (opcional)</Label>
                <select
                  value={editor.ln}
                  onChange={(event) => setEditor((current) => ({ ...current, ln: event.target.value }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Totes les línies</option>
                  {LN_OPTIONS.filter(Boolean).map((ln) => (
                    <option key={ln} value={ln}>
                      {ln}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Descripció (opcional)</Label>
                <Textarea
                  value={editor.description}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, description: event.target.value }))
                  }
                  className="min-h-[72px]"
                />
              </div>

              <div className="space-y-3">
                <Label>Destinataris del grup</Label>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    value={memberEmail}
                    onChange={(event) => {
                      const email = event.target.value
                      setMemberEmail(email)
                      const matched = userByEmail.get(email.trim().toLowerCase())
                      if (matched && !memberName) setMemberName(matched.name)
                    }}
                    placeholder="correu@empresa.com"
                    list="calendar-mail-group-users"
                  />
                  <datalist id="calendar-mail-group-users">
                    {userOptions.map((user) => (
                      <option key={user.id} value={user.email}>
                        {user.name}
                      </option>
                    ))}
                  </datalist>
                  <Input
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                    placeholder="Nom (opcional)"
                  />
                  <Button type="button" variant="outline" onClick={addMember}>
                    Afegir
                  </Button>
                </div>

                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  {editor.members.length === 0 ? (
                    <p className="text-sm text-slate-500">Encara no hi ha destinataris.</p>
                  ) : (
                    editor.members.map((member) => (
                      <div
                        key={member.email}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{member.name}</p>
                          <p className="truncate text-xs text-slate-500">{member.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(member.email)}
                          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Eliminar ${member.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel·lar
              </Button>
              <Button
                type="button"
                disabled={saving}
                className="bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => void saveGroup()}
              >
                {saving ? 'Desant…' : 'Desar grup'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
