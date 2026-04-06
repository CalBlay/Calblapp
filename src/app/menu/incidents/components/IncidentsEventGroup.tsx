// file: src/app/menu/incidents/components/IncidentsEventGroup.tsx
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import IncidentsRow from './IncidentsRow'
import IncidentsEventHeader from './IncidentsEventHeader'
import { Incident } from '@/hooks/useIncidents'
import FincaModal from '@/components/spaces/FincaModal'
import UserEventInfoModal from '@/components/incidents/UserEventInfoModal'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface Props {
  event: any
  onUpdate: (id: string, d: Partial<Incident>) => Promise<unknown>
  onOpenOperations: (inc: Incident) => void
}

export default function IncidentsEventGroup({ event, onUpdate, onOpenOperations }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<any>({})
  const [openFincaModal, setOpenFincaModal] = useState(false)

  // ───────────────────────────────
  // MODAL D’AUTOR (Comercial + Responsables)
  // ───────────────────────────────
  const [openEventModal, setOpenEventModal] = useState(false)
  const [selectedEventCode, setSelectedEventCode] = useState<string | null>(null)

  // Handler global (accessible des de IncidentsRow)
  useEffect(() => {
    ;(window as any).openEventModal = (code: string) => {
      setSelectedEventCode(code)
      setOpenEventModal(true)
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
      className="border-b last:border-0 px-4 py-3"
      style={
        {
          contentVisibility: 'auto',
          containIntrinsicSize: 'auto 360px',
        } as React.CSSProperties
      }
    >

      <IncidentsEventHeader
        title={event.eventTitle}
        code={event.eventCode}
        ln={event.ln}
        location={event.location}
        commercial={event.commercial}
        service={event.serviceType}
        pax={event.pax}
        count={event.rows.length}
        onLocationClick={() => setOpenFincaModal(true)}
      />

      {/* Modal de FINCA */}
      <FincaModal
        open={openFincaModal}
        onOpenChange={setOpenFincaModal}
        fincaId={event.fincaId || null}
      />

      {/* Modal d’INFO COMPLETA (Comercial + Responsables) */}
      <UserEventInfoModal
        open={openEventModal}
        onOpenChange={setOpenEventModal}
        eventCode={selectedEventCode}
      />

      <table className={cn('w-full table-fixed mt-3', typography('bodySm'))}>
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className={cn('w-12 p-2 text-left font-semibold', typography('bodySm'))}>Seg.</th>
            <th className={cn('w-20 p-2 text-left font-semibold', typography('bodySm'))}>Nº</th>
            <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Autor</th>
            <th className={cn('w-32 p-2 text-left font-semibold', typography('bodySm'))}>Dept</th>
            <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Importància</th>
            <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Estat</th>
            <th className={cn('w-auto p-2 text-left font-semibold', typography('bodySm'))}>Incidència</th>
            <th className={cn('w-32 p-2 text-left font-semibold', typography('bodySm'))}>Origen</th>
            <th className={cn('w-28 p-2 text-left font-semibold', typography('bodySm'))}>Prioritat</th>
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
              openOps={onOpenOperations}
              editValues={editValues}
              setEditValues={setEditValues}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
