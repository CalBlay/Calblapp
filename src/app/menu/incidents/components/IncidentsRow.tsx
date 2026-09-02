// file: src/app/menu/incidents/components/IncidentsRow.tsx
'use client'

import React from 'react'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Incident, type IncidentAction } from '@/hooks/useIncidents'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'
import { typography } from '@/lib/typography'
import { Camera, ChevronDown, ChevronUp, MessageSquareText, Trash2 } from 'lucide-react'
import IncidentOperationsPanel from './IncidentOperationsPanel'
import type { IncidentMeetingComment, IncidentMeetingSessionStatus } from '@/lib/incidentMeetingSession'

declare global {
  interface Window {
    openEventModal?: (eventCode: string) => void
  }
}

interface Props {
  inc: Incident
  isEditing: boolean
  /** Referències estables (per `React.memo`): la fila passa `inc` a la crida. */
  beginEdit: (row: Incident) => void
  applyPatch: (id: string, d: Partial<Incident>) => void | Promise<unknown>
  opsExpanded: boolean
  onToggleOps: (row: Incident) => void
  onIncidentPatch: (id: string, d: Partial<Incident>) => Promise<unknown>
  onIncidentLocalPatch: (id: string, d: Partial<Incident>) => void
  initialActions?: IncidentAction[]
  onIncidentActionsLocalPatch: (id: string, actions: IncidentAction[]) => void
  openImages: (row: Incident) => void
  canDelete: boolean
  canEditCategory: boolean
  categoryOptions: Array<{ id: string; label: string }>
  meetingSessionId?: string | null
  meetingSessionStatus?: IncidentMeetingSessionStatus | null
  initialMeetingComment?: string
  onMeetingCommentSaved?: (incidentId: string, comment: IncidentMeetingComment | null) => void
  onDelete: (row: Incident) => void
  editValues: {
    originDepartment?: string
    priority?: string
    status?: string
    categoryId?: string
  }
  setEditValues: (
    updater: (
      prev: { originDepartment?: string; priority?: string; status?: string; categoryId?: string }
    ) => { originDepartment?: string; priority?: string; status?: string; categoryId?: string }
  ) => void
}

function IncidentsRow({
  inc,
  isEditing,
  beginEdit,
  applyPatch,
  opsExpanded,
  onToggleOps,
  onIncidentPatch,
  onIncidentLocalPatch,
  initialActions,
  onIncidentActionsLocalPatch,
  openImages,
  canDelete,
  canEditCategory,
  categoryOptions,
  onDelete,
  meetingSessionId,
  meetingSessionStatus,
  initialMeetingComment,
  onMeetingCommentSaved,
  editValues,
  setEditValues,
}: Props) {
  const normalizedImportance = (() => {
    const value = (inc.importance || '').toLowerCase().trim()
    if (value === 'mitjana') return 'normal'
    if (value === 'urgent') return 'urgent'
    if (value === 'alta') return 'alta'
    if (value === 'baixa') return 'baixa'
    return value || 'normal'
  })()

  const importanceLabel =
    normalizedImportance === 'urgent'
      ? 'Urgent'
      : normalizedImportance === 'alta'
      ? 'Alta'
      : normalizedImportance === 'baixa'
      ? 'Baixa'
      : 'Normal'

  const cell = cn(typography('bodySm'), 'p-2')
  const cellTrunc = cn(cell, 'truncate')
  const incidentDescRead = cn(
    'max-h-36 min-h-[2.75rem] overflow-y-auto overscroll-contain rounded-lg border border-slate-100/90 bg-slate-50/60 px-3 py-2.5',
    'text-base font-medium leading-relaxed text-slate-900 whitespace-pre-wrap'
  )

  const workflow = normalizeIncidentStatus(inc.status)
  const statusLabel =
    workflow === 'en_curs'
      ? 'En curs'
      : workflow === 'resolt'
      ? 'Resolt'
      : workflow === 'tancat'
      ? 'Tancat'
      : 'Obert'

  const colCount = 13
  const hasMeetingComment = Boolean(initialMeetingComment?.trim())
  const toggleLabel = opsExpanded ? 'Plegar seguiment' : 'Desplegar seguiment i accions'

  return (
    <>
      <tr
        id={`incident-row-${inc.id}`}
        className={cn(
          'border-b hover:bg-slate-50',
          !opsExpanded && 'last:border-0'
        )}
        onClick={() => !isEditing && beginEdit(inc)}
      >
      <td className="p-1 align-middle">
        <div className="relative w-fit">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleOps(inc)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
            title={hasMeetingComment ? `${toggleLabel}. Té comentari de reunió` : toggleLabel}
            aria-label={hasMeetingComment ? `${toggleLabel}. Té comentari de reunió` : toggleLabel}
            aria-expanded={opsExpanded}
          >
            {opsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {hasMeetingComment ? (
            <span
              className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm ring-2 ring-white"
              title="Té comentari de reunió"
              aria-hidden="true"
            >
              <MessageSquareText className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      </td>
      {/* Nº */}
      <td className="p-1 align-middle">
        {inc.hasImages ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-slate-600"
            title={`Obrir fotos${inc.imageCount ? ` (${inc.imageCount})` : ''}`}
            aria-label={`Obrir fotos${inc.imageCount ? ` (${inc.imageCount})` : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              openImages(inc)
            }}
          >
            <Camera className="h-4 w-4" />
            <span className={typography('bodyXs')}>{inc.imageCount || 1}</span>
          </Button>
        ) : (
          <span className={cn(typography('bodyXs'), 'block px-2 text-slate-300')}>—</span>
        )}
      </td>
      {/* NÂº */}
      <td className={cell}>
  <span className={cn(typography('bodyXs'), 'font-mono tracking-tight block max-w-[80px] truncate')}>
    {inc.incidentNumber || '—'}
  </span>
</td>


     {/* Autor */}
<td
  className={cn(cellTrunc, 'text-blue-700 font-medium cursor-pointer hover:underline')}
  onClick={(e) => {
    e.stopPropagation()
    if (inc.eventCode) {
      // Obrirem el modal superior
      if (typeof window.openEventModal === 'function') {
        window.openEventModal(inc.eventCode)
      }
    }
  }}
>
  {inc.createdBy || '—'}
</td>


      {/* Dept */}
      <td className={cellTrunc}>{inc.department || '—'}</td>

      {/* Importància */}
      <td className={cell}>
        <Badge
          className={cn(
            typography('bodyXs'),
            'px-2 py-0.5',
            normalizedImportance === 'urgent' && 'bg-red-100 text-red-700',
            normalizedImportance === 'alta' && 'bg-orange-100 text-orange-700',
            normalizedImportance === 'normal' && 'bg-slate-100 text-slate-700',
            normalizedImportance === 'baixa' && 'bg-blue-100 text-blue-700'
          )}
        >
          {importanceLabel}
        </Badge>
      </td>

      {/* Estat */}
      <td
        className={cell}
        onClick={(e) => {
          if (isEditing) {
            e.stopPropagation()
            return
          }
          beginEdit(inc)
        }}
      >
        {isEditing ? (
          <Select
            value={editValues.status || workflow}
            onValueChange={(val) => {
              setEditValues((v) => ({ ...v, status: val }))
              void applyPatch(inc.id, { status: val })
            }}
          >
            <SelectTrigger onClick={(e) => e.stopPropagation()}>
              <SelectValue placeholder="Estat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="obert">Obert</SelectItem>
              <SelectItem value="en_curs">En curs</SelectItem>
              <SelectItem value="resolt">Resolt</SelectItem>
              <SelectItem value="tancat">Tancat</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge
            className={cn(
              typography('bodyXs'),
              'px-2 py-0.5',
              workflow === 'obert' && 'bg-amber-100 text-amber-800',
              workflow === 'en_curs' && 'bg-blue-100 text-blue-800',
              workflow === 'resolt' && 'bg-emerald-100 text-emerald-800',
              workflow === 'tancat' && 'bg-slate-200 text-slate-700'
            )}
          >
            {statusLabel}
          </Badge>
        )}
      </td>

      {/* La descripció original de la incidència és immutable. */}
      <td className="p-2 align-top">
        <div
          className={incidentDescRead}
          onClick={(e) => e.stopPropagation()}
          title={inc.description || undefined}
        >
          {inc.description || '—'}
        </div>
      </td>

      <td
        className={cellTrunc}
        onClick={(e) => {
          if (isEditing) {
            e.stopPropagation()
            return
          }
          beginEdit(inc)
        }}
      >
        {isEditing && canEditCategory ? (
          <Select
            value={editValues.categoryId || inc.category?.id || ''}
            onValueChange={(val) => {
              setEditValues((v) => ({ ...v, categoryId: val }))
              const selected = categoryOptions.find((option) => option.id === val)
              if (!selected) return
              void applyPatch(inc.id, { category: { id: selected.id, label: selected.label } })
            }}
          >
            <SelectTrigger onClick={(e) => e.stopPropagation()}><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          inc.category?.label || inc.category?.id || '—'
        )}
      </td>

      <td className={cell} onClick={(e) => e.stopPropagation()}>
        {inc.actionsCount ? (
          <span className="inline-flex min-w-10 items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
            {inc.actionsCount}
          </span>
        ) : (
          <span className={cn(typography('bodyXs'), 'text-slate-300')}>—</span>
        )}
      </td>

      {/* Origen */}
      <td className={cellTrunc}>
        {isEditing ? (
          <Select
            value={editValues.originDepartment}
            onValueChange={(val) => {
              setEditValues((v) => ({ ...v, originDepartment: val }))
              void applyPatch(inc.id, { originDepartment: val })
            }}
          >
            <SelectTrigger onClick={(e) => e.stopPropagation()}><SelectValue placeholder="Dept." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cuina">Cuina</SelectItem>
              <SelectItem value="serveis">Serveis</SelectItem>
              <SelectItem value="logistica">Logística</SelectItem>
              <SelectItem value="produccio">Producció</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          inc.originDepartment || '—'
        )}
      </td>

      {/* Prioritat */}
      <td className={cellTrunc}>
        {isEditing ? (
          <Select
            value={editValues.priority}
            onValueChange={(val) => {
              setEditValues((v) => ({ ...v, priority: val }))
              void applyPatch(inc.id, { priority: val })
            }}
          >
            <SelectTrigger onClick={(e) => e.stopPropagation()}><SelectValue placeholder="Prioritat" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          inc.priority || '—'
        )}
      </td>
      <td className="p-1 align-middle">
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-rose-600 hover:text-rose-700"
            title="Eliminar incidència"
            aria-label="Eliminar incidència"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(inc)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <span className={cn(typography('bodyXs'), 'block px-2 text-slate-300')}>—</span>
        )}
      </td>
    </tr>
      {opsExpanded ? (
        <tr className="border-b last:border-0 bg-gradient-to-b from-amber-50/25 to-slate-50/40">
          <td colSpan={colCount} className="border-t border-slate-200 bg-slate-50/50 px-3 py-2">
            <IncidentOperationsPanel
              key={`${meetingSessionId || 'sense-acta'}:${inc.id}`}
              incident={inc}
              onIncidentPatch={onIncidentPatch}
              onIncidentLocalPatch={onIncidentLocalPatch}
              initialActions={initialActions}
              onIncidentActionsLocalPatch={onIncidentActionsLocalPatch}
              meetingSessionId={meetingSessionId}
              meetingSessionStatus={meetingSessionStatus}
              initialMeetingComment={initialMeetingComment}
              onMeetingCommentSaved={onMeetingCommentSaved}
            />
          </td>
        </tr>
      ) : null}
    </>
  )
}

export default React.memo(IncidentsRow)
