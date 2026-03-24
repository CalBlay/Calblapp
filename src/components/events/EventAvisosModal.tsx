//file: src/components/events/EventAvisosModal.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAvisos, Aviso } from '@/hooks/useAvisos'

const norm = (s?: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

interface Props {
  open: boolean
  onClose: () => void
  eventCode: string | null
  user: {
    name?: string
    department?: string
    role?: string
  }
  onAvisosStateChange?: (state: { eventCode: string | null; hasAvisos: boolean; lastAvisoDate?: string }) => void
}

export default function EventAvisosModal({ open, onClose, eventCode, user, onAvisosStateChange }: Props) {
  const { avisos, loading, error, createAviso, updateAviso, deleteAviso } = useAvisos(eventCode)

  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Aviso | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const canEditAviso = (aviso?: Aviso | null) =>
    !!aviso &&
    (user.role === 'admin' ||
      user.role === 'direccio' ||
      norm(aviso.createdBy.name) === norm(user.name))

  const canEditCurrent = canEditAviso(editing)

  const resetForm = () => {
    setText('')
    setEditing(null)
  }

  const handleSave = async () => {
    if (!eventCode) {
      setSaveError('Aquest esdeveniment no té codi disponible per guardar avisos.')
      return
    }

    if (!text.trim()) {
      setSaveError("Escriu l'avís abans de guardar-lo.")
      return
    }

    try {
      setSaving(true)
      setSaveError(null)

      if (editing && canEditCurrent) {
        await updateAviso(editing.id, text.trim())
      } else {
        await createAviso({
          eventCode,
          content: text.trim(),
          userName: user.name || 'Desconegut',
          department: user.department || 'Producció',
        })
      }

      resetForm()
    } catch (err) {
      console.error('Error guardant avís:', err)
      setSaveError("No s'ha pogut guardar l'avís. Torna-ho a provar.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (aviso?: Aviso | null) => {
    const target = aviso ?? editing
    if (!target) return
    if (!canEditAviso(target)) return

    try {
      setSaving(true)
      await deleteAviso(target.id)
      resetForm()
    } catch (err) {
      console.error('Error eliminant avís:', err)
      setSaveError("No s'ha pogut eliminar l'avís.")
    } finally {
      setSaving(false)
    }
  }

  // Notifica l'estat dels avisos (per pintar la icona a la llista sense recarregar)
  useEffect(() => {
    const lastAvisoDate = avisos[0]?.editedAt || avisos[0]?.createdAt
    onAvisosStateChange?.({
      eventCode,
      hasAvisos: avisos.length > 0,
      lastAvisoDate,
    })
  }, [avisos, eventCode, onAvisosStateChange])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[92vw] max-w-md rounded-2xl p-4 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Avisos de producció
          </DialogTitle>
          {eventCode && <p className="text-xs text-gray-400">Codi: {eventCode}</p>}
        </DialogHeader>

        {/* FORM */}
        <div className="space-y-3">
          <Textarea
            placeholder="Escriu l'avís operatiu"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />

          {/* BOTONS FIXOS */}
          <div className="sticky bottom-0 left-0 right-0 bg-white pt-3 border-t border-gray-200">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetForm}>
                Cancel·lar
              </Button>

              {editing && canEditCurrent && (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleDelete()}
                  disabled={saving}
                >
                  Eliminar
                </Button>
              )}

              <Button
                onClick={handleSave}
                className="w-full bg-white-600 text-black hover:bg-grey-700"
                disabled={saving}
              >
                {saving ? 'Guardant…' : editing ? 'Guardar canvis' : 'Guardar avís'}
              </Button>
            </div>
          </div>
        </div>

        {/* ESTATS */}
        {loading && <p className="text-sm text-gray-500">Carregant avisos…</p>}
        {(error || saveError) && <p className="text-sm text-red-600">{error || saveError}</p>}

        {!loading && !error && avisos.length === 0 && (
          <p className="text-sm text-gray-500 mt-2">
            No hi ha avisos per aquest esdeveniment.
          </p>
        )}

        {/* LLISTA */}
        {!loading && !error && avisos.length > 0 && (
          <div className="space-y-3 mt-3">
            {avisos.map((a) => {
              const canEditCard = canEditAviso(a)

              return (
                <div
                  key={a.id}
                  onClick={() => {
                    setEditing(a)
                    setText(a.content)
                  }}
                  className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm cursor-pointer hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium break-words">{a.content}</div>

                    {canEditCard && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditing(a)
                            setText(a.content)
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(a)
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                          disabled={saving}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 mt-1">
                    {a.createdBy.department} · {a.createdBy.name}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(a.editedAt ?? a.createdAt).toLocaleString('ca-ES')}
                    {a.editedAt && ' · editat'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
