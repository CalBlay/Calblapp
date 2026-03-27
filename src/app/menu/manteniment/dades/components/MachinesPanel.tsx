'use client'

import Link from 'next/link'
import { Database } from 'lucide-react'
import { typography } from '@/lib/typography'
import type { MachineListStats, MachineRow, MachineView, SupplierRow } from '../types'
import { STATUS_LABELS, formatDateTime, formatTrackedHours } from '../utils'

function SummaryCard({
  title,
  value,
  note,
}: {
  title: string
  value: string | number
  note?: string
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={typography('eyebrow')}>{title}</div>
      <div className={`mt-2 ${typography('kpiValue')}`}>{value}</div>
      {note ? <div className={`mt-1 ${typography('kpiNote')}`}>{note}</div> : null}
    </article>
  )
}

type MachineStats = {
  total: number
  openStatus: string | null
  trackedMinutes: number
  lastMovement: number
}

type Props = {
  loading: boolean
  saving: boolean
  filteredMachines: MachineRow[]
  suppliers: SupplierRow[]
  selectedMachine: MachineRow | null
  selectedMachineId: string | null
  machineForm: MachineView
  machineStats: MachineStats
  machineStatsById: Map<string, MachineListStats>
  onSelectMachine: (machine: MachineRow) => void
  onMachineFormChange: (updater: (prev: MachineView) => MachineView) => void
  onResetMachine: () => void
  onSaveMachine: () => void
}

export default function MachinesPanel({
  loading,
  saving,
  filteredMachines,
  suppliers,
  selectedMachine,
  selectedMachineId,
  machineForm,
  machineStats,
  machineStatsById,
  onSelectMachine,
  onMachineFormChange,
  onResetMachine,
  onSaveMachine,
}: Props) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500" />
          <div className={typography('sectionTitle')}>Llistat de maquinaria</div>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
              Carregant maquinaria...
            </div>
          ) : filteredMachines.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
              Encara no hi ha maquinaria desada.
            </div>
          ) : (
            filteredMachines.map((item) => {
              const stats = machineStatsById.get(item.id)
              const pendingValidation = stats?.pendingValidation || 0
              const openCount = stats?.openCount || 0

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectMachine(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectMachine(item)
                    }
                  }}
                  className={`rounded-2xl border px-4 py-3 transition ${
                    selectedMachineId === item.id
                      ? 'border-cyan-200 bg-cyan-50/80'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/menu/manteniment/dades/maquinaria/${encodeURIComponent(item.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                      >
                        {item.name || 'Maquina sense nom'}
                      </Link>
                      <div className="mt-1 text-sm text-slate-500">
                        {[item.code, item.location].filter(Boolean).join(' / ') || 'Sense dades extra'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {openCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            {openCount} oberts
                          </span>
                        ) : null}
                        {pendingValidation > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                            {pendingValidation} pendents de validar
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          item.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.active !== false ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="xl:self-start xl:sticky xl:top-24">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <div className={typography('sectionTitle')}>
              {machineForm.id ? 'Dades de la maquina' : 'Alta de nova maquina'}
            </div>
            <p className={`mt-1 ${typography('bodyXs')}`}>
              Cataleg de maquinaria amb alta, edicio i indicadors principals de l&apos;actiu seleccionat.
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            <SummaryCard title="Tickets totals" value={selectedMachine ? machineStats.total : 0} />
            <SummaryCard
              title="Ticket obert"
              value={
                selectedMachine
                  ? machineStats.openStatus
                    ? STATUS_LABELS[machineStats.openStatus] || machineStats.openStatus
                    : 'No'
                  : '-'
              }
            />
            <SummaryCard
              title="Hores reals"
              value={selectedMachine ? formatTrackedHours(machineStats.trackedMinutes) : '--'}
            />
            <SummaryCard
              title="Ultima actuacio"
              value={selectedMachine && machineStats.lastMovement ? formatDateTime(machineStats.lastMovement) : '-'}
            />
          </div>

          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5">
            <div className={typography('sectionTitle')}>
              {machineForm.id ? 'Editar maquina' : 'Nova maquina'}
            </div>

            <input
              value={machineForm.code}
              onChange={(event) => onMachineFormChange((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="Codi"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <input
              value={machineForm.name}
              onChange={(event) => onMachineFormChange((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Nom"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <input
              value={machineForm.location}
              onChange={(event) => onMachineFormChange((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="Ubicacio"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={machineForm.brand}
                onChange={(event) => onMachineFormChange((prev) => ({ ...prev, brand: event.target.value }))}
                placeholder="Marca"
                className="h-11 rounded-2xl border border-slate-200 px-4"
              />
              <input
                value={machineForm.model}
                onChange={(event) => onMachineFormChange((prev) => ({ ...prev, model: event.target.value }))}
                placeholder="Model"
                className="h-11 rounded-2xl border border-slate-200 px-4"
              />
            </div>
            <input
              value={machineForm.serialNumber}
              onChange={(event) =>
                onMachineFormChange((prev) => ({ ...prev, serialNumber: event.target.value }))
              }
              placeholder="Numero serie"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <select
              value={machineForm.supplierId}
              onChange={(event) => onMachineFormChange((prev) => ({ ...prev, supplierId: event.target.value }))}
              className="h-11 rounded-2xl border border-slate-200 px-4"
            >
              <option value="">Sense proveidor assignat</option>
              {suppliers
                .filter((item) => item.active !== false)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={machineForm.active}
                onChange={(event) => onMachineFormChange((prev) => ({ ...prev, active: event.target.checked }))}
              />
              Activa
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onResetMachine}
                className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm"
              >
                Netejar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onSaveMachine}
                className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Desant...' : machineForm.id ? 'Guardar canvis' : 'Crear maquina'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
