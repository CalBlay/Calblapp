'use client'

import { useEffect, useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import MachineDetailView from '../../components/MachineDetailView'
import type { MachineRow, MachineView, MachineViewTab, SupplierRow } from '../../types'
import { emptyMachine } from '../../types'
import { buildMachineForm, buildMachineTimeline, getLastMovementAt, getPlannedMinutes, getTrackedMinutes, machineMatchesTicket } from '../../utils'
import { parseFetchJson } from '@/lib/parseFetchJson'

export default function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [machineId, setMachineId] = useState('')
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [machineForm, setMachineForm] = useState<MachineView>(emptyMachine)
  const [machineViewTab, setMachineViewTab] = useState<MachineViewTab>('summary')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void params.then((value) => setMachineId(value.id))
  }, [params])

  const loadData = async () => {
    try {
      setLoading(true)
      const [machinesRes, suppliersRes, ticketsRes] = await Promise.all([
        fetch('/api/maintenance/data/machines', { cache: 'no-store' }),
        fetch('/api/maintenance/data/suppliers', { cache: 'no-store' }),
        fetch('/api/maintenance/tickets?ticketType=maquinaria&limit=300', { cache: 'no-store' }),
      ])
      const machinesJson = await parseFetchJson(machinesRes, { machines: [] as MachineRow[] })
      const suppliersJson = await parseFetchJson(suppliersRes, { suppliers: [] as SupplierRow[] })
      const ticketsJson = await parseFetchJson(ticketsRes, { tickets: [] as Ticket[] })
      const nextMachines = Array.isArray(machinesJson?.machines) ? machinesJson.machines : []
      const nextSuppliers = Array.isArray(suppliersJson?.suppliers) ? suppliersJson.suppliers : []
      const nextTickets = Array.isArray(ticketsJson?.tickets) ? ticketsJson.tickets : []

      setMachines(nextMachines)
      setSuppliers(nextSuppliers)
      setTickets(nextTickets)

      const selected = nextMachines.find((item: MachineRow) => item.id === machineId)
      setMachineForm(selected ? buildMachineForm(selected) : emptyMachine)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!machineId) return
    void loadData()
  }, [machineId])

  const selectedMachine = useMemo(
    () => machines.find((item) => item.id === machineId) || null,
    [machineId, machines]
  )

  const machineTickets = useMemo(() => {
    if (!selectedMachine) return []
    return tickets
      .filter((ticket) => machineMatchesTicket(selectedMachine, ticket))
      .sort((a, b) => getLastMovementAt(b) - getLastMovementAt(a))
  }, [selectedMachine, tickets])

  const machineTimeline = useMemo(() => buildMachineTimeline(machineTickets), [machineTickets])

  const machineStats = useMemo(() => {
    const totals = machineTickets.reduce(
      (acc, ticket) => {
        acc.total += 1
        if (!acc.currentStatus) {
          acc.currentStatus = String(ticket.status || '') || null
        }
        acc.plannedMinutes += getPlannedMinutes(ticket)
        acc.trackedMinutes += getTrackedMinutes(ticket)
        return acc
      },
      {
        total: 0,
        currentStatus: null as string | null,
        plannedMinutes: 0,
        trackedMinutes: 0,
      }
    )

    const lastMovement = machineTickets[0] ? getLastMovementAt(machineTickets[0]) : 0
    return { ...totals, lastMovement }
  }, [machineTickets])

  const saveMachine = async () => {
    setSaving(true)
    try {
      const selectedSupplier = suppliers.find((item) => item.id === machineForm.supplierId)
      const payload = {
        ...machineForm,
        supplierName: selectedSupplier?.name || '',
      }
      const url = machineForm.id
        ? `/api/maintenance/data/machines/${encodeURIComponent(machineForm.id)}`
        : '/api/maintenance/data/machines'
      const method = machineForm.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('save_failed')
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="mx-auto w-full max-w-7xl space-y-4 p-4">
        <ModuleHeader title="Manteniment" subtitle="Fitxa de maquina" mainHref="/menu/manteniment/dades" />

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-10 text-sm text-slate-500">
            Carregant fitxa de maquina...
          </div>
        ) : (
          <MachineDetailView
            selectedMachine={selectedMachine}
            machineForm={machineForm}
            machineViewTab={machineViewTab}
            machineTickets={machineTickets}
            machineTimeline={machineTimeline}
            machineStats={machineStats}
            suppliers={suppliers}
            saving={saving}
            onMachineViewTabChange={setMachineViewTab}
            onMachineFormChange={(updater) => setMachineForm((prev) => updater(prev))}
            onResetMachine={() => setMachineForm(selectedMachine ? buildMachineForm(selectedMachine) : emptyMachine)}
            onSaveMachine={() => void saveMachine()}
          />
        )}
      </div>
    </RoleGuard>
  )
}
