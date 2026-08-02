'use client'

import React from 'react'
import { GraduationCap, Loader2, Truck, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import type { Role } from './types'

type Props = {
  startDate: string
  startTime: string
  endTime: string
  meetingPoint: string
  vestimentModel: string
  vestimentOptions: string[]
  showVestiment: boolean
  loadingAvailability: boolean
  isLocked: boolean
  showAddRowButtons?: boolean
  showAddGroupButton?: boolean
  groupLabel?: 'cotxe' | 'grup'
  onStartDateChange: (value: string) => void
  onStartTimeChange: (value: string) => void
  onEndTimeChange: (value: string) => void
  onMeetingPointChange: (value: string) => void
  onVestimentChange: (value: string) => void
  onApplyToAll: () => void
  onAddRow: (role: Role) => void
  onAddGroup?: () => void
}

export default function DraftManualToolbar({
  startDate,
  startTime,
  endTime,
  meetingPoint,
  vestimentModel,
  vestimentOptions,
  showVestiment,
  loadingAvailability,
  isLocked,
  showAddRowButtons = true,
  showAddGroupButton = false,
  groupLabel = 'grup',
  onStartDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onMeetingPointChange,
  onVestimentChange,
  onApplyToAll,
  onAddRow,
  onAddGroup,
}: Props) {
  const groupLabelCapitalized = groupLabel === 'cotxe' ? 'Cotxe' : 'Grup'
  return (
    <div className="space-y-2.5 border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 sm:px-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[repeat(6,minmax(0,1fr))_auto] lg:items-end">
        <div>
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Data</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            disabled={isLocked}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Inici</label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            disabled={isLocked}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Fi</label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => onEndTimeChange(e.target.value)}
            disabled={isLocked}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 sm:col-span-1 lg:col-span-1">
          <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Lloc</label>
          <Input
            type="text"
            value={meetingPoint}
            onChange={(e) => onMeetingPointChange(e.target.value)}
            placeholder="Convocatòria"
            disabled={isLocked}
            className="h-8 text-sm"
          />
        </div>
        {showVestiment ? (
          <div>
            <label className={cn('mb-0.5 block text-slate-500', typography('bodyXs'))}>Vestiment</label>
            <select
              value={vestimentModel}
              onChange={(e) => onVestimentChange(e.target.value)}
              disabled={isLocked}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="">—</option>
              {vestimentModel && !vestimentOptions.includes(vestimentModel) ? (
                <option value={vestimentModel}>{vestimentModel}</option>
              ) : null}
              {vestimentOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className={showVestiment ? '' : 'col-span-2 lg:col-span-1'}>
          <button
            type="button"
            onClick={onApplyToAll}
            disabled={isLocked}
            className={cn(
              'h-8 w-full rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50',
              typography('bodyXs')
            )}
          >
            Aplicar tot
          </button>
        </div>
      </div>

      {!isLocked && (showAddRowButtons || showAddGroupButton) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {loadingAvailability ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
          ) : null}
          {showAddRowButtons ? (
            <>
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
            </>
          ) : null}
          {showAddGroupButton && onAddGroup ? (
            <button
              type="button"
              onClick={onAddGroup}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Truck className="h-3.5 w-3.5" aria-hidden />
              + {groupLabelCapitalized}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
