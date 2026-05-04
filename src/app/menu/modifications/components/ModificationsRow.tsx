// file: src/app/menu/modifications/components/ModificationsRow.tsx
'use client'

import React, { useState } from 'react'
import { Modification } from '@/hooks/useModifications'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDateString } from '@/lib/formatDate'

interface Props {
  mod: Modification
  onUpdate: (id: string, data: Partial<Modification>) => Promise<any> | void
  onDelete: (id: string) => Promise<any> | void
  canDelete?: boolean
  currentUserId?: string
  currentUserName?: string
  currentUserEmail?: string
}

export default function ModificationsRow({
  mod,
  onUpdate,
  onDelete,
  canDelete = true,
  currentUserEmail,
  currentUserId,
  currentUserName,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftDesc, setDraftDesc] = useState(mod.description || '')

  const norm = (v?: string | null) => (v || '').toLowerCase().trim()
  const matchesOwner = (a?: string | null, b?: string | null) =>
    Boolean(a && b && norm(a) === norm(b))

  const canEdit =
    matchesOwner(mod.createdById, currentUserId) ||
    matchesOwner(mod.createdByEmail, currentUserEmail) ||
    matchesOwner(mod.createdBy, currentUserName) ||
    matchesOwner(mod.createdBy, currentUserEmail)

  const save = async () => {
    if (!canEdit || !canDelete) return
    await onUpdate(mod.id, { description: draftDesc })
    setIsEditing(false)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canEdit) return
    const ok = window.confirm('Eliminar aquesta modificació?')
    if (!ok) return
    await onDelete(mod.id)
  }

  const createdLabel = formatDateString(mod.createdAt, { includeTime: true }) ?? '-'

  return (
    <tr
      className="border-b last:border-0 hover:bg-slate-50"
      onClick={() => {
        if (canEdit && !isEditing) setIsEditing(true)
      }}
    >
      <td className="p-2">
        <span className="text-[11px] font-mono tracking-tight block max-w-[90px] truncate">
          {mod.modificationNumber || '-'}
        </span>
      </td>
      <td className="p-2 truncate text-blue-700 font-medium">{mod.createdBy || '-'}</td>
      <td className="p-2 truncate">{mod.department || '-'}</td>
      <td className="p-2 text-xs text-slate-600 whitespace-nowrap">{createdLabel}</td>
      <td className="p-2">
        <Badge
          className={cn(
            'text-[10px] px-2 py-0.5',
            mod.importance === 'alta' && 'bg-red-100 text-red-700',
            mod.importance === 'mitjana' && 'bg-orange-100 text-orange-700',
            mod.importance === 'baixa' && 'bg-blue-100 text-blue-700'
          )}
        >
          {mod.importance}
        </Badge>
      </td>
      <td className="p-2 truncate">
        {isEditing && canEdit ? (
          <Input
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            onBlur={() => {
              if (draftDesc !== mod.description) save()
              else setIsEditing(false)
            }}
          />
        ) : (
          mod.description || '-'
        )}
      </td>
      <td className="p-2 text-right">
        {canEdit && (
          <div className="flex justify-end gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={(e) => {
                    e.stopPropagation()
                    save()
                  }}
                >
                  Desa
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsEditing(false)
                    setDraftDesc(mod.description || '')
                  }}
                >
                  Cancel·la
                </button>
              </>
            ) : canDelete ? (
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={handleDelete}
              >
                Elimina
              </button>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  )
}
