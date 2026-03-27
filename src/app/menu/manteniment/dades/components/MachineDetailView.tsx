'use client'

import { Activity, History, ListChecks, TicketIcon } from 'lucide-react'
import { maintenanceStatusBadge } from '@/lib/colors'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import type { MachineRow, MachineTimelineItem, MachineView, MachineViewTab, SupplierRow } from '../types'
import { STATUS_LABELS, formatDateTime, formatTrackedHours, getDaysOpen, getLastMovementAt, getPlannedMinutes, getTrackedMinutes } from '../utils'

function SummaryCard({
  title,
  value,
  note,
  tone = 'default',
}: {
  title: string
  value: string | number
  note?: string
  tone?: 'default' | 'highlight'
}) {
  return (
    <article className={`rounded-2xl border px-4 py-3 ${tone === 'highlight' ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950 xl:text-xl">{value}</div>
      {note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}
    </article>
  )
}

type MachineStats = {
  total: number
  currentStatus: string | null
  plannedMinutes: number
  trackedMinutes: number
  lastMovement: number
}

type Props = {
  selectedMachine: MachineRow | null
  machineForm: MachineView
  machineViewTab: MachineViewTab
  machineTickets: Ticket[]
  machineTimeline: MachineTimelineItem[]
  machineStats: MachineStats
  suppliers: SupplierRow[]
  saving: boolean
  onMachineViewTabChange: (tab: MachineViewTab) => void
  onMachineFormChange: (updater: (prev: MachineView) => MachineView) => void
  onResetMachine: () => void
  onSaveMachine: () => void
}

export default function MachineDetailView({
  selectedMachine,
  machineForm,
  machineViewTab,
  machineTickets,
  machineTimeline,
  machineStats,
  suppliers,
  saving,
  onMachineViewTabChange,
  onMachineFormChange,
  onResetMachine,
  onSaveMachine,
}: Props) {
  if (!selectedMachine) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500">
        Selecciona una maquina per veure la seva fitxa d&apos;actiu.
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 border-b border-slate-100 pb-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)] xl:items-start">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                selectedMachine.active !== false
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {selectedMachine.active !== false ? 'Activa' : 'Inactiva'}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-950 xl:text-2xl">
              {[selectedMachine.name, selectedMachine.code].filter(Boolean).join(' · ') || 'Maquina sense nom'}
            </h2>
            {[
              selectedMachine.location,
              selectedMachine.brand,
              selectedMachine.model,
              selectedMachine.serialNumber,
            ].filter(Boolean).length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                {[
                  selectedMachine.location,
                  selectedMachine.brand,
                  selectedMachine.model,
                  selectedMachine.serialNumber,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.35fr)]">
          <SummaryCard title="Tickets totals" value={machineStats.total} />
          <SummaryCard
            title="Estat actual"
            value={machineStats.currentStatus ? STATUS_LABELS[machineStats.currentStatus] || machineStats.currentStatus : 'Sense ticket'}
            tone={machineStats.currentStatus === 'fet' ? 'highlight' : 'default'}
          />
          <SummaryCard title="Hores planificades" value={formatTrackedHours(machineStats.plannedMinutes)} />
          <SummaryCard title="Hores reals" value={formatTrackedHours(machineStats.trackedMinutes)} />
          <SummaryCard
            title="Ultima actuacio"
            value={machineStats.lastMovement ? formatDateTime(machineStats.lastMovement) : '-'}
          />
        </div>
      </div>

      <div className="mt-3 border-b border-slate-100 pb-4" />

      <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
        {[
          { id: 'summary', label: 'Resum', icon: Activity },
          { id: 'tickets', label: 'Tickets', icon: TicketIcon },
          { id: 'timeline', label: 'Cronologia', icon: History },
          { id: 'data', label: 'Dades', icon: ListChecks },
        ].map((item) => {
          const Icon = item.icon
          const active = machineViewTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onMachineViewTabChange(item.id as MachineViewTab)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </div>

      {machineViewTab === 'summary' ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Activitat recent</div>
            <div className="mt-3 space-y-3">
              {machineTickets.slice(0, 5).map((ticket) => (
                <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${maintenanceStatusBadge(ticket.status)}`}>
                      {STATUS_LABELS[String(ticket.status)] || ticket.status}
                    </span>
                    {ticket.ticketCode ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {ticket.ticketCode}
                      </span>
                    ) : null}
                    {typeof getDaysOpen(ticket.createdAt) === 'number' ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                        {getDaysOpen(ticket.createdAt)} dies
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-900">
                    {ticket.description || 'Sense descripcio'}
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-500 md:grid-cols-2">
                    <div>Operari: {(ticket.assignedToNames || []).join(', ') || '-'}</div>
                    <div>Ultim moviment: {formatDateTime(getLastMovementAt(ticket))}</div>
                    <div>Hores planificades: {formatTrackedHours(getPlannedMinutes(ticket))}</div>
                    <div>Hores reals: {formatTrackedHours(getTrackedMinutes(ticket))}</div>
                  </div>
                </article>
              ))}
              {machineTickets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                  Aquesta maquina encara no te tickets relacionats.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Fitxa rapida</div>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ubicacio</div>
                <div className="mt-1 text-slate-900">{selectedMachine.location || '-'}</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Marca / model</div>
                <div className="mt-1 text-slate-900">
                  {[selectedMachine.brand, selectedMachine.model].filter(Boolean).join(' Â· ') || '-'}
                </div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Numero de serie</div>
                <div className="mt-1 text-slate-900">{selectedMachine.serialNumber || '-'}</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Proveidor habitual</div>
                <div className="mt-1 text-slate-900">{selectedMachine.supplierName || '-'}</div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {machineViewTab === 'tickets' ? (
        <div className="mt-5 space-y-3">
          {machineTickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
              Aquesta maquina encara no te tickets relacionats.
            </div>
          ) : (
            machineTickets.map((ticket) => (
              <article key={ticket.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${maintenanceStatusBadge(ticket.status)}`}>
                      {STATUS_LABELS[String(ticket.status)] || ticket.status}
                    </span>
                    {ticket.ticketCode ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {ticket.ticketCode}
                      </span>
                    ) : null}
                    {typeof getDaysOpen(ticket.createdAt) === 'number' ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                        {getDaysOpen(ticket.createdAt)} dies oberts
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-base font-semibold text-slate-900">
                    {ticket.description || 'Sense descripcio'}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-500 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ubicacio</div>
                      <div className="mt-1 text-slate-700">{ticket.location || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Operari</div>
                      <div className="mt-1 text-slate-700">{(ticket.assignedToNames || []).join(', ') || '-'}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Data alta</div>
                      <div className="mt-1 text-slate-700">{formatDateTime(ticket.createdAt)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hores planificades</div>
                      <div className="mt-1 text-slate-700">{formatTrackedHours(getPlannedMinutes(ticket))}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Hores reals</div>
                      <div className="mt-1 text-slate-700">{formatTrackedHours(getTrackedMinutes(ticket))}</div>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {machineViewTab === 'timeline' ? (
        <div className="mt-5 space-y-3">
          {machineTimeline.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
              Aquesta maquina encara no te cronologia registrada.
            </div>
          ) : (
            machineTimeline.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${maintenanceStatusBadge(item.status)}`}>
                    {STATUS_LABELS[String(item.status)] || item.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {formatDateTime(item.at)}
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{item.label}</div>
                <div className="mt-2 grid gap-2 text-sm text-slate-500 md:grid-cols-3">
                  <div>Operari: {item.byName || '-'}</div>
                  <div>Hora: {item.startTime || item.endTime ? `${item.startTime || '--:--'}-${item.endTime || '--:--'}` : '-'}</div>
                  <div>Observacions: {item.note || '-'}</div>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {machineViewTab === 'data' ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-900">
            {machineForm.id ? 'Editar maquina' : 'Nova maquina'}
          </div>
          <div className="grid gap-3">
            <input
              value={machineForm.code}
              onChange={(e) => onMachineFormChange((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="Codi"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <input
              value={machineForm.name}
              onChange={(e) => onMachineFormChange((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nom"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <input
              value={machineForm.location}
              onChange={(e) => onMachineFormChange((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="Ubicacio"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={machineForm.brand}
                onChange={(e) => onMachineFormChange((prev) => ({ ...prev, brand: e.target.value }))}
                placeholder="Marca"
                className="h-11 rounded-2xl border border-slate-200 px-4"
              />
              <input
                value={machineForm.model}
                onChange={(e) => onMachineFormChange((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="Model"
                className="h-11 rounded-2xl border border-slate-200 px-4"
              />
            </div>
            <input
              value={machineForm.serialNumber}
              onChange={(e) => onMachineFormChange((prev) => ({ ...prev, serialNumber: e.target.value }))}
              placeholder="Numero serie"
              className="h-11 rounded-2xl border border-slate-200 px-4"
            />
            <select
              value={machineForm.supplierId}
              onChange={(e) => onMachineFormChange((prev) => ({ ...prev, supplierId: e.target.value }))}
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
                onChange={(e) => onMachineFormChange((prev) => ({ ...prev, active: e.target.checked }))}
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
      ) : null}
    </div>
  )
}
