// file: src/app/menu/modifications/components/ModificationsEventGroup.tsx
'use client'

import React from 'react'
import ModificationsRow from './ModificationsRow'
import { Modification } from '@/hooks/useModifications'
import { cn } from '@/lib/utils'
import { formatDateString } from '@/lib/formatDate'

const formatEventTitle = (title?: string) => {
  if (!title) return '(Sense títol)'
  const [firstPart] = title.split('/')
  const trimmed = firstPart.trim()
  return trimmed || '(Sense títol)'
}

interface Props {
  event: {
    eventTitle?: string
    eventCode?: string
    location?: string
    commercial?: string
    count: number
    rows: Modification[]
  }
  onUpdate: (id: string, data: Partial<Modification>) => Promise<any> | void
  onDelete: (id: string) => Promise<any> | void
  canDelete?: boolean
  currentUserId?: string
  currentUserName?: string
  currentUserEmail?: string
}

export default function ModificationsEventGroup({
  event,
  onUpdate,
  onDelete,
  canDelete = true,
  currentUserEmail,
  currentUserId,
  currentUserName,
}: Props) {
  const norm = (v?: string | null) => (v || '').toLowerCase().trim()
  const matchesOwner = (a?: string | null, b?: string | null) =>
    Boolean(a && b && norm(a) === norm(b))

  const canEdit = (mod: Modification) =>
    matchesOwner(mod.createdById, currentUserId) ||
    matchesOwner(mod.createdByEmail, currentUserEmail) ||
    matchesOwner(mod.createdBy, currentUserName) ||
    matchesOwner(mod.createdBy, currentUserEmail)

  return (
    <div className="border-b last:border-0 px-4 py-3">
      <div className="bg-slate-100 rounded-lg px-3 py-2 mb-2 border flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-sm text-slate-900">
              {formatEventTitle(event.eventTitle)}
            </span>
            {event.eventCode && (
              <span className="text-xs text-slate-600">
                Codi: {event.eventCode}
              </span>
            )}
          </div>
          <div className="flex gap-4 text-xs text-slate-600 flex-wrap">
            <span>{event.location || '-'}</span>
            {event.commercial && <span>Comercial: {event.commercial}</span>}
          </div>
        </div>

        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md border border-blue-200">
          {event.count} modificacions
        </span>
      </div>

      {/* Taula desktop */}
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-sm mt-2">
          <thead>
            <tr className="text-xs text-slate-600 bg-slate-50">
              <th className="w-24 p-2 text-left">Nº</th>
              <th className="w-28 p-2 text-left">Autor</th>
              <th className="w-32 p-2 text-left">Dept</th>
              <th className="w-32 p-2 text-left">Creat</th>
              <th className="w-28 p-2 text-left">Importància</th>
              <th className="w-auto p-2 text-left">Descripció</th>
              <th className="w-28 p-2 text-right">Accions</th>
            </tr>
          </thead>
          <tbody>
            {event.rows.map((mod) => (
              <ModificationsRow
                key={mod.id}
                mod={mod}
                onUpdate={onUpdate}
                onDelete={onDelete}
                canDelete={canDelete}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserEmail={currentUserEmail}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Targetes mòbil */}
      <div className="sm:hidden space-y-3 mt-2">
        {event.rows.map((mod) => {
          const editable = canEdit(mod)
          const createdAtLabel = formatDateString(mod.createdAt, { includeTime: true }) ?? '-'
          return (
            <div key={mod.id} className="rounded-xl border bg-white shadow-sm p-3 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-500">Nº</span>
                  <span className="text-sm font-semibold">{mod.modificationNumber || '-'}</span>
                </div>
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full self-start',
                    mod.importance === 'alta' && 'bg-red-100 text-red-700',
                    mod.importance === 'mitjana' && 'bg-orange-100 text-orange-700',
                    mod.importance === 'baixa' && 'bg-blue-100 text-blue-700'
                  )}
                >
                  {mod.importance}
                </span>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <div><span className="font-semibold">Autor:</span> {mod.createdBy || '-'}</div>
                <div><span className="font-semibold">Dept:</span> {mod.department || '-'}</div>
                <div><span className="font-semibold">Creat:</span> {createdAtLabel}</div>
              </div>

              <div className="text-sm text-slate-800">
                {mod.description || '-'}
              </div>

              {editable && (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => {
                      const next = window.prompt('Nova descripció', mod.description || '')
                      if (next === null) return
                      onUpdate(mod.id, { description: next })
                    }}
                  >
                    Edita
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => onDelete(mod.id)}
                    >
                      Elimina
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


