// file: src/app/menu/incidents/components/IncidentsEventGroup.tsx
'use client'

import React, { useState, useEffect } from 'react'
import IncidentsRow from './IncidentsRow'
import IncidentsEventHeader from './IncidentsEventHeader'
import { Incident } from '@/hooks/useIncidents'
import FincaModal from '@/components/spaces/FincaModal'
import UserEventInfoModal from '@/components/incidents/UserEventInfoModal'

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

  return (
    <div className="border-b last:border-0 px-4 py-3">

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

      <table className="w-full table-fixed text-base mt-3">
        <thead>
          <tr className="text-sm text-slate-600 bg-slate-50">
            <th className="w-12 p-2 text-left">Seg.</th>
            <th className="w-20 p-2 text-left">Nº</th>
            <th className="w-28 p-2 text-left">Autor</th>
            <th className="w-32 p-2 text-left">Dept</th>
            <th className="w-28 p-2 text-left">Importància</th>
            <th className="w-28 p-2 text-left">Estat</th>
            <th className="w-auto p-2 text-left">Incidència</th>
            <th className="w-32 p-2 text-left">Origen</th>
            <th className="w-28 p-2 text-left">Prioritat</th>
          </tr>
        </thead>

        <tbody>
          {event.rows.map((inc: Incident) => (
            <IncidentsRow
              key={inc.id}
              inc={inc}
              isEditing={editingId === inc.id}
              onStartEdit={() => {
                setEditingId(inc.id)
                setEditValues({
                  description: inc.description,
                  originDepartment: inc.originDepartment || '',
                  priority: inc.priority || inc.importance || '',
                })
              }}
              editValues={editValues}
              setEditValues={setEditValues}
              onUpdate={async (data) => {
                await onUpdate(inc.id, data)
                setEditingId(null)
              }}
              onOpenOperations={() => onOpenOperations(inc)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
