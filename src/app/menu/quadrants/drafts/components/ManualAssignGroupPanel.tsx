'use client'

import React from 'react'
import { GraduationCap, Truck, User, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import type { EditorGroup } from '@/lib/quadrantsDraftEditor'
import type { Role } from './types'

type Props = {
  group: EditorGroup
  groupIndex: number
  groupLabel: 'cotxe' | 'grup'
  rowCount: number
  isLocked: boolean
  canRemove: boolean
  children: React.ReactNode
  onPatchGroup: (patch: Partial<EditorGroup>) => void
  onApplyGroup: () => void
  onRemoveGroup: () => void
  onAddRow: (role: Role) => void
}

export default function ManualAssignGroupPanel({
  group,
  groupIndex,
  groupLabel,
  rowCount,
  isLocked,
  canRemove,
  children,
  onPatchGroup,
  onApplyGroup,
  onRemoveGroup,
  onAddRow,
}: Props) {
  const label = groupLabel === 'cotxe' ? 'Cotxe' : 'Grup'
  const Icon = groupLabel === 'cotxe' ? Truck : Users

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon className="h-4 w-4 text-slate-500" aria-hidden />
          <span>
            {label} {groupIndex + 1}
          </span>
          <span className={cn('font-normal text-slate-500', typography('bodyXs'))}>
            · {rowCount} {rowCount === 1 ? 'persona' : 'persones'}
          </span>
        </div>
        {!isLocked && canRemove ? (
          <button
            type="button"
            onClick={onRemoveGroup}
            className="text-xs font-medium text-rose-600 hover:text-rose-700"
          >
            Eliminar
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/40 px-3 py-2.5 sm:grid-cols-[repeat(5,minmax(0,1fr))_auto] sm:items-end">
        <div>
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>
            Data servei
          </label>
          <Input
            type="date"
            value={group.serviceDate || ''}
            onChange={(e) => onPatchGroup({ serviceDate: e.target.value })}
            disabled={isLocked}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Inici</label>
          <Input
            type="time"
            value={group.startTime || ''}
            onChange={(e) => onPatchGroup({ startTime: e.target.value })}
            disabled={isLocked}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Fi</label>
          <Input
            type="time"
            value={group.endTime || ''}
            onChange={(e) => onPatchGroup({ endTime: e.target.value })}
            disabled={isLocked}
            className="h-8 text-xs"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>
            Convocatòria
          </label>
          <Input
            type="text"
            value={group.meetingPoint || ''}
            onChange={(e) => onPatchGroup({ meetingPoint: e.target.value })}
            placeholder="Lloc"
            disabled={isLocked}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <button
            type="button"
            onClick={onApplyGroup}
            disabled={isLocked}
            className={cn(
              'h-8 w-full rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50',
              typography('bodyXs')
            )}
          >
            Aplicar al {label.toLowerCase()}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-2">{children}</div>

      {!isLocked ? (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50/50 px-3 py-2">
          <button
            type="button"
            onClick={() => onAddRow('responsable')}
            className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200"
          >
            <GraduationCap className="h-3.5 w-3.5" aria-hidden />
            Responsable
          </button>
          <button
            type="button"
            onClick={() => onAddRow('conductor')}
            className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800 hover:bg-orange-200"
          >
            <Truck className="h-3.5 w-3.5" aria-hidden />
            Conductor
          </button>
          <button
            type="button"
            onClick={() => onAddRow('treballador')}
            className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-200"
          >
            <User className="h-3.5 w-3.5" aria-hidden />
            Treballador
          </button>
        </div>
      ) : null}
    </section>
  )
}
