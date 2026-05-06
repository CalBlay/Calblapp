'use client'

import React, { useState, useEffect, useCallback } from 'react'
import IncidentsRow from './IncidentsRow'
import IncidentsMobileCard from './IncidentsMobileCard'
import IncidentsEventHeader from './IncidentsEventHeader'
import type { GroupedIncidentEvent } from '@/lib/incidentsMeetingMinutes'
import { Incident } from '@/hooks/useIncidents'
import FincaModal from '@/components/spaces/FincaModal'
import UserEventInfoModal from '@/components/incidents/UserEventInfoModal'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type IncidentEditValues = {
  description?: string
  originDepartment?: string
  priority?: string
}

type WindowWithEventModal = Window & { openEventModal?: (code: string) => void }

interface Props {
  event: GroupedIncidentEvent
  onUpdate: (id: string, d: Partial<Incident>) => Promise<unknown>
  onDelete: (inc: Incident) => void
  onOpenOperations: (inc: Incident) => void
  onOpenImages: (inc: Incident) => void
  canDeleteIncident: (inc: Incident) => boolean
}

export default function IncidentsEventGroup({
  event,
  onUpdate,
  onDelete,
  onOpenOperations,
  onOpenImages,
  canDeleteIncident,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<IncidentEditValues>({})
  const [openFincaModal, setOpenFincaModal] = useState(false)
  const [openEventModal, setOpenEventModal] = useState(false)
  const [selectedEventCode, setSelectedEventCode] = useState<string | null>(null)

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
    })
  }, [])

  const applyPatch = useCallback(
    async (id: string, data: Partial<Incident>) => {
      await onUpdate(id, data)
      setEditingId(null)
    },
    [onUpdate]
  )

  return (
    <div
      className="border-b last:border-0 px-3 py-3 sm:px-4"
      style={
        {
          contentVisibility: 'auto',
          containIntrinsicSize: 'auto 360px',
        } as React.CSSProperties
      }
    >
      <IncidentsEventHeader
        title={event.eventTitle ?? ''}
        code={event.eventCode ?? ''}
        ln={event.ln ?? ''}
        location={event.location ?? ''}
        commercial={event.commercial}
        service={event.serviceType ?? ''}
        pax={Number(event.pax ?? 0)}
        count={event.rows.length}
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

      <div className="mt-3 space-y-3 md:hidden">
        {event.rows.map((inc: Incident) => (
          <IncidentsMobileCard
            key={inc.id}
            inc={inc}
            isEditing={editingId === inc.id}
            beginEdit={beginEdit}
            applyPatch={applyPatch}
            onDelete={onDelete}
            openOps={onOpenOperations}
            openImages={onOpenImages}
            canDelete={canDeleteIncident(inc)}
            editValues={editValues}
            setEditValues={setEditValues}
          />
        ))}
      </div>

      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className={cn('w-full min-w-[1140px] table-fixed', typography('bodySm'))}>
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className={cn('w-12 p-2 text-left font-semibold', typography('bodySm'))}>Seg.</th>
              <th className={cn('w-20 p-2 text-left font-semibold', typography('bodySm'))}>Fotos</th>
              <th className={cn('w-20 p-2 text-left font-semibold', typography('bodySm'))}>Nº</th>
              <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Autor</th>
              <th className={cn('w-32 p-2 text-left font-semibold', typography('bodySm'))}>Dept</th>
              <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Importància</th>
              <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Estat</th>
              <th className={cn('w-auto p-2 text-left font-semibold', typography('bodySm'))}>Incidència</th>
              <th className={cn('w-36 p-2 text-left font-semibold', typography('bodySm'))}>Categoria</th>
              <th className={cn('w-32 p-2 text-left font-semibold', typography('bodySm'))}>Origen</th>
              <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Prioritat</th>
              <th className={cn('w-14 p-2 text-left font-semibold', typography('bodySm'))}>Del.</th>
            </tr>
          </thead>

          <tbody>
            {event.rows.map((inc: Incident) => (
              <IncidentsRow
                key={inc.id}
                inc={inc}
                isEditing={editingId === inc.id}
                beginEdit={beginEdit}
                applyPatch={applyPatch}
                onDelete={onDelete}
                openOps={onOpenOperations}
                openImages={onOpenImages}
                canDelete={canDeleteIncident(inc)}
                editValues={editValues}
                setEditValues={setEditValues}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
