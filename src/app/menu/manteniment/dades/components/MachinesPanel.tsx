'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight, Factory, Save, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  corporateFilterBadgeClass,
  corporateFilterFieldClass,
  corporateFilterLabelClass,
} from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'
import type { CenterRow, MachineListStats, MachineRow, MachineView, SupplierRow } from '../types'
import { STATUS_LABELS, formatDateTime, formatTrackedHours } from '../utils'

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
  centers: CenterRow[]
  suppliers: SupplierRow[]
  showCreateMachine: boolean
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
  centers,
  suppliers,
  showCreateMachine,
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
  const activeCenter =
    centers.find((center) => center.name === machineForm.center) || null

  const locationOptions = activeCenter?.locationNodes || []
  const activeLocation =
    locationOptions.find((location) => location.name === machineForm.location) || null
  const zoneOptions = activeLocation?.zones || []

  const machineCards = filteredMachines.map((item) => {
    const stats = machineStatsById.get(item.id)
    return {
      machine: item,
      openCount: stats?.openCount || 0,
      pendingValidation: stats?.pendingValidation || 0,
    }
  })

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-4">
      <div className="text-sm font-bold uppercase tracking-[0.12em] text-slate-800">Maquinaria</div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {showCreateMachine ? (
          <article className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/50 md:col-span-2 xl:col-span-4">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Factory className="h-5 w-5 text-emerald-700" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">Nova maquina</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </div>

            <div className="border-t border-emerald-100 bg-white/80 px-4 py-4">
              <MachineEditor
                machineForm={machineForm}
                centers={centers}
                activeCenter={activeCenter}
                locationOptions={locationOptions}
                zoneOptions={zoneOptions}
                suppliers={suppliers}
                saving={saving}
                selectedMachine={selectedMachine}
                machineStats={machineStats}
                onMachineFormChange={onMachineFormChange}
                onResetMachine={onResetMachine}
                onSaveMachine={onSaveMachine}
              />
            </div>
          </article>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 md:col-span-2 xl:col-span-4">
            Carregant maquinaria...
          </div>
        ) : machineCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 md:col-span-2 xl:col-span-4">
            Encara no hi ha maquinaria desada.
          </div>
        ) : (
          machineCards.map(({ machine: item, openCount, pendingValidation }) => {
            const isOpen = selectedMachineId === item.id
            return (
              <article
                key={item.id}
                className={cn(
                  'overflow-hidden rounded-2xl border border-slate-200 bg-white',
                  isOpen ? 'md:col-span-2 xl:col-span-4' : ''
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => onSelectMachine(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">
                        {item.name || 'Maquina sense nom'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {item.code ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600">
                            {item.code}
                          </span>
                        ) : null}
                        {item.center ? <span className={corporateFilterBadgeClass(true)}>{item.center}</span> : null}
                        <span className="text-sm text-slate-500">
                          {[item.location, item.zone].filter(Boolean).join(' · ') || 'Sense ubicacio'}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {openCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                        {openCount} oberts
                      </span>
                    ) : null}
                    {pendingValidation > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                        {pendingValidation} pendents
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.active !== false
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.active !== false ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>

                {isOpen ? (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                    <MachineEditor
                      machineForm={machineForm}
                      centers={centers}
                      activeCenter={activeCenter}
                      locationOptions={locationOptions}
                      zoneOptions={zoneOptions}
                      suppliers={suppliers}
                      saving={saving}
                      selectedMachine={selectedMachine}
                      machineStats={machineStats}
                      onMachineFormChange={onMachineFormChange}
                      onResetMachine={onResetMachine}
                      onSaveMachine={onSaveMachine}
                    />
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

function SummaryStat({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function MachineEditor({
  machineForm,
  centers,
  activeCenter,
  locationOptions,
  zoneOptions,
  suppliers,
  saving,
  selectedMachine,
  machineStats,
  onMachineFormChange,
  onResetMachine,
  onSaveMachine,
}: {
  machineForm: MachineView
  centers: CenterRow[]
  activeCenter: CenterRow | null
  locationOptions: NonNullable<CenterRow['locationNodes']>
  zoneOptions: string[]
  suppliers: SupplierRow[]
  saving: boolean
  selectedMachine: MachineRow | null
  machineStats: MachineStats
  onMachineFormChange: (updater: (prev: MachineView) => MachineView) => void
  onResetMachine: () => void
  onSaveMachine: () => void
}) {
  return (
    <div className="space-y-4">
      {selectedMachine ? (
        <div className="grid gap-3 lg:grid-cols-4">
          <SummaryStat label="Tickets" value={machineStats.total} />
          <SummaryStat
            label="Obert"
            value={machineStats.openStatus ? STATUS_LABELS[machineStats.openStatus] || machineStats.openStatus : 'No'}
          />
          <SummaryStat label="Hores reals" value={formatTrackedHours(machineStats.trackedMinutes)} />
          <SummaryStat
            label="Ultima actuacio"
            value={machineStats.lastMovement ? formatDateTime(machineStats.lastMovement) : '-'}
          />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={corporateFilterLabelClass}>Codi</label>
          <input
            value={machineForm.code}
            onChange={(event) => onMachineFormChange((prev) => ({ ...prev, code: event.target.value }))}
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          />
        </div>
        <div className="xl:col-span-2">
          <label className={corporateFilterLabelClass}>Nom</label>
          <input
            value={machineForm.name}
            onChange={(event) => onMachineFormChange((prev) => ({ ...prev, name: event.target.value }))}
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          />
        </div>
        <div className="flex items-end">
          {selectedMachine ? (
            <Link
              href={`/menu/manteniment/dades/maquinaria/${encodeURIComponent(selectedMachine.id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Wrench className="h-4 w-4" />
              Fitxa completa
            </Link>
          ) : null}
        </div>

        <div>
          <label className={corporateFilterLabelClass}>Centre</label>
          <select
            value={machineForm.center}
            onChange={(event) =>
              onMachineFormChange((prev) => ({
                ...prev,
                center: event.target.value,
                location: '',
                zone: '',
              }))
            }
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          >
            <option value="">Selecciona centre</option>
            {centers.map((center) => (
              <option key={center.id} value={center.name}>
                {center.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={corporateFilterLabelClass}>Ubicacio</label>
          <select
            value={machineForm.location}
            onChange={(event) =>
              onMachineFormChange((prev) => ({
                ...prev,
                location: event.target.value,
                zone: '',
              }))
            }
            disabled={!activeCenter}
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          >
            <option value="">Selecciona ubicacio</option>
            {locationOptions.map((location) => (
              <option key={location.name} value={location.name}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={corporateFilterLabelClass}>Zona</label>
          <select
            value={machineForm.zone}
            onChange={(event) =>
              onMachineFormChange((prev) => ({
                ...prev,
                zone: event.target.value,
              }))
            }
            disabled={!machineForm.location || zoneOptions.length === 0}
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          >
            <option value="">{zoneOptions.length > 0 ? 'Selecciona zona' : 'Sense zones'}</option>
            {zoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={corporateFilterLabelClass}>Marca</label>
          <input
            value={machineForm.brand}
            onChange={(event) => onMachineFormChange((prev) => ({ ...prev, brand: event.target.value }))}
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          />
        </div>
        <div>
          <label className={corporateFilterLabelClass}>Model</label>
          <input
            value={machineForm.model}
            onChange={(event) => onMachineFormChange((prev) => ({ ...prev, model: event.target.value }))}
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          />
        </div>
        <div>
          <label className={corporateFilterLabelClass}>Numero serie</label>
          <input
            value={machineForm.serialNumber}
            onChange={(event) =>
              onMachineFormChange((prev) => ({ ...prev, serialNumber: event.target.value }))
            }
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
          />
        </div>
        <div>
          <label className={corporateFilterLabelClass}>Proveidor</label>
          <select
            value={machineForm.supplierId}
            onChange={(event) =>
              onMachineFormChange((prev) => ({ ...prev, supplierId: event.target.value }))
            }
            className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
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
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={machineForm.active}
            onChange={(event) =>
              onMachineFormChange((prev) => ({ ...prev, active: event.target.checked }))
            }
          />
          Activa
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onResetMachine}>
            Netejar
          </Button>
          <Button type="button" variant="primary" disabled={saving} onClick={onSaveMachine} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Desant...' : machineForm.id ? 'Guardar canvis' : 'Crear maquina'}
          </Button>
        </div>
      </div>
    </div>
  )
}
