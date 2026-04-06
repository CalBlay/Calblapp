// file: src/app/menu/incidents/components/IncidentsRow.tsx
'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Incident } from '@/hooks/useIncidents'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'
import { ListChecks } from 'lucide-react'

interface Props {
  inc: Incident
  isEditing: boolean
  onStartEdit: () => void
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
  onUpdate: (d: Partial<Incident>) => void | Promise<unknown>
  onOpenOperations: () => void
}

export default function IncidentsRow({
  inc,
  isEditing,
  onStartEdit,
  editValues,
  setEditValues,
  onUpdate,
  onOpenOperations,
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
    <tr
      className="border-b last:border-0 hover:bg-slate-50"
      onClick={() => !isEditing && onStartEdit()}
    >
      <td className="p-1 align-middle">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-slate-600"
          title="Seguiment i accions"
          aria-label="Seguiment i accions"
          onClick={(e) => {
            e.stopPropagation()
            onOpenOperations()
          }}
        >
          <ListChecks className="h-4 w-4" />
        </Button>
      </td>
      {/* Nº */}
      <td className="p-2">
  <span className="text-[11px] font-mono tracking-tight block max-w-[80px] truncate">
    {inc.incidentNumber || '—'}
  </span>
</td>


     {/* Autor */}
<td
  className="p-2 truncate text-blue-700 font-medium cursor-pointer hover:underline"
  onClick={(e) => {
    e.stopPropagation()
    if (inc.eventCode) {
      // Obrirem el modal superior
      if (typeof (window as any).openEventModal === "function") {
        ;(window as any).openEventModal(inc.eventCode)
      }
    }
  }}
>
  {inc.createdBy || '—'}
</td>


      {/* Dept */}
      <td className="p-2 truncate">{inc.department || '—'}</td>

      {/* Importància */}
      <td className="p-2">
        <Badge
          className={cn(
            'text-[10px] px-2 py-0.5',
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
      <td className="p-2" onClick={(e) => e.stopPropagation()}>
        <Badge
          className={cn(
            'text-[10px] px-2 py-0.5',
            workflow === 'obert' && 'bg-amber-100 text-amber-800',
            workflow === 'en_curs' && 'bg-blue-100 text-blue-800',
            workflow === 'resolt' && 'bg-emerald-100 text-emerald-800',
            workflow === 'tancat' && 'bg-slate-200 text-slate-700'
          )}
        >
          {statusLabel}
        </Badge>
      </td>

      {/* Incidència (editable) */}
      <td className="p-2 truncate">
        {isEditing ? (
          <Input
            value={editValues.description}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdate({ description: e.currentTarget.value })
              }
            }}
            onBlur={(e) => {
              if (e.currentTarget.value !== inc.description) {
                onUpdate({ description: e.currentTarget.value })
              }
            }}
          />
        ) : (
          inc.description
        )}
      </td>

      {/* Origen */}
      <td className="p-2 truncate">
        {isEditing ? (
          <Select
            value={editValues.originDepartment}
            onValueChange={(val) => {
              setEditValues((v) => ({ ...v, originDepartment: val }))
              onUpdate({ originDepartment: val })
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
      <td className="p-2 truncate">
        {isEditing ? (
          <Select
            value={editValues.priority}
            onValueChange={(val) => {
              setEditValues((v) => ({ ...v, priority: val }))
              onUpdate({ priority: val })
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
    </tr>
  )
}
