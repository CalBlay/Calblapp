'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import IncidentsRow from './IncidentsRow'
import IncidentsMobileCard from './IncidentsMobileCard'
import IncidentsEventHeader from './IncidentsEventHeader'
import type { GroupedIncidentEvent } from '@/lib/incidentsMeetingMinutes'
import { Incident, type IncidentAction } from '@/hooks/useIncidents'
import { getIncidentEventGroupMeta, getEventBlockVisualStyle } from '@/lib/incidentEventGroupMeta'
import FincaModal from '@/components/spaces/FincaModal'
import UserEventInfoModal from '@/components/incidents/UserEventInfoModal'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type IncidentEditValues = {
  description?: string
  originDepartment?: string
  priority?: string
  categoryId?: string
}

type WindowWithEventModal = Window & { openEventModal?: (code: string) => void }

interface Props {
  event: GroupedIncidentEvent
  actionsByIncident: Record<string, IncidentAction[]>
  onUpdate: (id: string, d: Partial<Incident>) => Promise<unknown>
  onLocalPatch: (id: string, d: Partial<Incident>) => void
  onActionsLocalPatch: (id: string, actions: IncidentAction[]) => void
  onDelete: (inc: Incident) => void
  onOpenImages: (inc: Incident) => void
  canDeleteIncident: (inc: Incident) => boolean
  canEditCategory: boolean
  categoryOptions: Array<{ id: string; label: string }>
}

export default function IncidentsEventGroup({
  event,
  actionsByIncident,
  onUpdate,
  onLocalPatch,
  onActionsLocalPatch,
  onDelete,
  onOpenImages,
  canDeleteIncident,
  canEditCategory,
  categoryOptions,
}: Props) {
  const [expandedOpsId, setExpandedOpsId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<IncidentEditValues>({})
  const [openFincaModal, setOpenFincaModal] = useState(false)
  const [openEventModal, setOpenEventModal] = useState(false)
  const [selectedEventCode, setSelectedEventCode] = useState<string | null>(null)

  const groupMeta = useMemo(() => getIncidentEventGroupMeta(event.rows), [event.rows])
  const actionSummary = useMemo(() => {
    let actionCount = 0
    let incidentsWithActionsCount = 0
    for (const row of event.rows) {
      const count = Number(row.actionsCount || 0)
      actionCount += count
      if (count > 0) incidentsWithActionsCount += 1
    }
    return { actionCount, incidentsWithActionsCount }
  }, [event.rows])
  const [expanded, setExpanded] = useState(false)
  const blockVisual = useMemo(
    () => getEventBlockVisualStyle(groupMeta, expanded),
    [groupMeta, expanded]
  )

  useEffect(() => {
    const w = window as WindowWithEventModal
    w.openEventModal = (code: string) => {
      setSelectedEventCode(code)
      setOpenEventModal(true)
    }
    return () => {
      delete w.openEventModal
    }
  }, [])

  const beginEdit = useCallback((row: Incident) => {
    setEditingId(row.id)
    setEditValues({
      description: row.description,
      originDepartment: row.originDepartment || '',
      priority: row.priority || row.importance || '',
      categoryId: row.category?.id || '',
    })
  }, [])

  const applyPatch = useCallback(
    async (id: string, data: Partial<Incident>) => {
      await onUpdate(id, data)
      setEditingId(null)
    },
    [onUpdate]
  )

  const toggleOps = useCallback((inc: Incident) => {
    setExpandedOpsId((prev) => (prev === inc.id ? null : inc.id))
  }, [])

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border border-l-4 transition-all duration-200',
        blockVisual.accent,
        blockVisual.shell,
        expanded && 'col-span-full',
        !expanded && 'h-full'
      )}
      style={
        expanded
          ? undefined
          : ({
              contentVisibility: 'auto',
              containIntrinsicSize: 'auto 200px',
            } as React.CSSProperties)
      }
    >
      <IncidentsEventHeader
        className={!expanded ? 'h-full' : undefined}
        headerClassName={blockVisual.header}
        title={event.eventTitle ?? ''}
        code={event.eventCode ?? ''}
        ln={event.ln ?? ''}
        location={event.location ?? ''}
        commercial={event.commercial}
        service={event.serviceType ?? ''}
        pax={Number(event.pax ?? 0)}
        count={event.rows.length}
        actionCount={actionSummary.actionCount}
        incidentsWithActionsCount={actionSummary.incidentsWithActionsCount}
        openCount={groupMeta.openCount}
        urgentCount={groupMeta.urgentCount}
        allResolved={groupMeta.allResolved}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        onLocationClick={() => setOpenFincaModal(true)}
      />

      <FincaModal
        open={openFincaModal}
        onOpenChange={setOpenFincaModal}
        fincaId={event.fincaId || null}
      />

      <UserEventInfoModal
        open={openEventModal}
        onOpenChange={setOpenEventModal}
        eventCode={selectedEventCode}
      />

      {expanded ? (
        <div className={cn('min-w-0', blockVisual.body)}>
          <div className="space-y-3 p-3 md:hidden sm:p-4">
            {event.rows.map((inc: Incident) => (
              <IncidentsMobileCard
                key={inc.id}
                inc={inc}
                isEditing={editingId === inc.id}
                beginEdit={beginEdit}
                applyPatch={applyPatch}
                onDelete={onDelete}
                opsExpanded={expandedOpsId === inc.id}
                onToggleOps={toggleOps}
                onIncidentPatch={onUpdate}
                onIncidentLocalPatch={onLocalPatch}
                initialActions={actionsByIncident[inc.id]}
                onIncidentActionsLocalPatch={onActionsLocalPatch}
                openImages={onOpenImages}
                canDelete={canDeleteIncident(inc)}
                canEditCategory={canEditCategory}
                categoryOptions={categoryOptions}
                editValues={editValues}
                setEditValues={setEditValues}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className={cn('w-full min-w-[1200px] table-fixed', typography('bodySm'))}>
              <thead>
                <tr className="border-b border-slate-200 bg-white text-slate-600">
                  <th className={cn('w-12 p-2 text-left font-semibold', typography('bodySm'))}>Seg.</th>
                  <th className={cn('w-20 p-2 text-left font-semibold', typography('bodySm'))}>Fotos</th>
                  <th className={cn('w-20 p-2 text-left font-semibold', typography('bodySm'))}>Nº</th>
                  <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Autor</th>
                  <th className={cn('w-32 p-2 text-left font-semibold', typography('bodySm'))}>Dept</th>
                  <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Importància</th>
                  <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Estat</th>
                  <th className={cn('w-auto p-2 text-left font-semibold', typography('bodySm'))}>Incidència</th>
                  <th className={cn('w-36 p-2 text-left font-semibold', typography('bodySm'))}>Categoria</th>
                  <th className={cn('w-24 p-2 text-left font-semibold', typography('bodySm'))}>Accio</th>
                  <th className={cn('w-32 p-2 text-left font-semibold', typography('bodySm'))}>Origen</th>
                  <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Prioritat</th>
                  <th className={cn('w-14 p-2 text-left font-semibold', typography('bodySm'))}>Del.</th>
                </tr>
              </thead>

              <tbody className="bg-white">
                {event.rows.map((inc: Incident) => (
                  <IncidentsRow
                    key={inc.id}
                    inc={inc}
                    isEditing={editingId === inc.id}
                    beginEdit={beginEdit}
                    applyPatch={applyPatch}
                    onDelete={onDelete}
                    opsExpanded={expandedOpsId === inc.id}
                    onToggleOps={toggleOps}
                    onIncidentPatch={onUpdate}
                    onIncidentLocalPatch={onLocalPatch}
                    initialActions={actionsByIncident[inc.id]}
                    onIncidentActionsLocalPatch={onActionsLocalPatch}
                    openImages={onOpenImages}
                    canDelete={canDeleteIncident(inc)}
                    canEditCategory={canEditCategory}
                    categoryOptions={categoryOptions}
                    editValues={editValues}
                    setEditValues={setEditValues}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </article>
  )
}
