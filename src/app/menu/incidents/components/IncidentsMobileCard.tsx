'use client'

import React from 'react'
import { Camera, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import IncidentOperationsPanel from './IncidentOperationsPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Incident } from '@/hooks/useIncidents'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface Props {
  inc: Incident
  isEditing: boolean
  beginEdit: (row: Incident) => void
  applyPatch: (id: string, d: Partial<Incident>) => void | Promise<unknown>
  opsExpanded: boolean
  onToggleOps: (row: Incident) => void
  onIncidentPatch: (id: string, d: Partial<Incident>) => Promise<unknown>
  openImages: (row: Incident) => void
  canDelete: boolean
  onDelete: (row: Incident) => void
  editValues: {
    description?: string
    originDepartment?: string
    priority?: string
  }
  setEditValues: (
    updater: (
      prev: { description?: string; originDepartment?: string; priority?: string }
    ) => { description?: string; originDepartment?: string; priority?: string }
  ) => void
}

export default function IncidentsMobileCard({
  inc,
  isEditing,
  beginEdit,
  applyPatch,
  opsExpanded,
  onToggleOps,
  onIncidentPatch,
  openImages,
  canDelete,
  onDelete,
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

  const workflow = normalizeIncidentStatus(inc.status)
  const statusLabel =
    workflow === 'en_curs'
      ? 'En curs'
      : workflow === 'resolt'
      ? 'Resolt'
      : workflow === 'tancat'
      ? 'Tancat'
      : 'Obert'

  return (
    <article
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      onClick={() => !isEditing && beginEdit(inc)}
    >
      <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className={cn(typography('bodyXs'), 'font-mono text-slate-500')}>
            {inc.incidentNumber || 'Sense codi'}
          </p>
          <p className={cn(typography('bodySm'), 'font-semibold text-slate-900')}>
            {inc.createdBy || 'Sense autor'}
          </p>
          <p className={cn(typography('bodyXs'), 'text-slate-500')}>
            {inc.department || 'Sense departament'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleOps(inc)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
            title={opsExpanded ? 'Plegar seguiment' : 'Desplegar seguiment i accions'}
            aria-label={opsExpanded ? 'Plegar seguiment' : 'Desplegar seguiment i accions'}
            aria-expanded={opsExpanded}
          >
            {opsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {inc.hasImages ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-slate-600"
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
          ) : null}
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
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge
          className={cn(
            typography('bodyXs'),
            normalizedImportance === 'urgent' && 'bg-red-100 text-red-700',
            normalizedImportance === 'alta' && 'bg-orange-100 text-orange-700',
            normalizedImportance === 'normal' && 'bg-slate-100 text-slate-700',
            normalizedImportance === 'baixa' && 'bg-blue-100 text-blue-700'
          )}
        >
          {importanceLabel}
        </Badge>
        <Badge
          className={cn(
            typography('bodyXs'),
            workflow === 'obert' && 'bg-amber-100 text-amber-800',
            workflow === 'en_curs' && 'bg-blue-100 text-blue-800',
            workflow === 'resolt' && 'bg-emerald-100 text-emerald-800',
            workflow === 'tancat' && 'bg-slate-200 text-slate-700'
          )}
        >
          {statusLabel}
        </Badge>
        <Badge className={cn(typography('bodyXs'), 'bg-slate-100 text-slate-700')}>
          {inc.category?.label || inc.category?.id || 'Sense categoria'}
        </Badge>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className={cn(typography('label'), 'mb-1.5 text-slate-500')}>Incidència</p>
          {isEditing ? (
            <Textarea
              value={editValues.description}
              rows={4}
              className="max-h-48 min-h-[3.5rem] resize-y text-base font-medium leading-relaxed text-slate-900"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
              onBlur={(e) => {
                if (e.currentTarget.value !== inc.description) {
                  void applyPatch(inc.id, { description: e.currentTarget.value })
                }
              }}
            />
          ) : (
            <div
              className="max-h-48 min-h-[3rem] overflow-y-auto overscroll-contain rounded-xl border border-slate-100/90 bg-slate-50/60 px-3.5 py-3 text-base font-medium leading-relaxed text-slate-900 whitespace-pre-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              {inc.description || '—'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className={cn(typography('label'), 'mb-1 text-slate-500')}>Origen</p>
            {isEditing ? (
              <Select
                value={editValues.originDepartment}
                onValueChange={(val) => {
                  setEditValues((v) => ({ ...v, originDepartment: val }))
                  void applyPatch(inc.id, { originDepartment: val })
                }}
              >
                <SelectTrigger onClick={(e) => e.stopPropagation()}>
                  <SelectValue placeholder="Dept." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuina">Cuina</SelectItem>
                  <SelectItem value="serveis">Serveis</SelectItem>
                  <SelectItem value="logistica">Logística</SelectItem>
                  <SelectItem value="produccio">Producció</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className={cn(typography('bodySm'), 'text-slate-800')}>{inc.originDepartment || '—'}</p>
            )}
          </div>
          <div>
            <p className={cn(typography('label'), 'mb-1 text-slate-500')}>Prioritat</p>
            {isEditing ? (
              <Select
                value={editValues.priority}
                onValueChange={(val) => {
                  setEditValues((v) => ({ ...v, priority: val }))
                  void applyPatch(inc.id, { priority: val })
                }}
              >
                <SelectTrigger onClick={(e) => e.stopPropagation()}>
                  <SelectValue placeholder="Prioritat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className={cn(typography('bodySm'), 'text-slate-800')}>{inc.priority || '—'}</p>
            )}
          </div>
        </div>
      </div>
      </div>

      {opsExpanded ? (
        <div className="border-t border-slate-200 bg-slate-50/50 px-3 py-2">
          <IncidentOperationsPanel incident={inc} onIncidentPatch={onIncidentPatch} />
        </div>
      ) : null}
    </article>
  )
}
