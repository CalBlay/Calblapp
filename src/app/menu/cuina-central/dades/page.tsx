'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Factory, Pencil, Search, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { CuinaCentralMachine } from '@/lib/cuina-central/types'
import ExcelImportButton from '../components/ExcelImportButton'
import { MachineMaintenanceTicketButton } from '../components/CuinaCentralMaintenanceTicket'

type MachineDraft = {
  code: string
  name: string
  zone: string
  location: string
  mapX: string
  mapY: string
}

type MachineTicket = {
  id: string
  ticketCode?: string | null
  incidentNumber?: string | null
  createdAt?: string | number | null
  status?: string | null
  priority?: string | null
  description?: string | null
  assignedToNames?: string[] | null
}

const EMPTY_MACHINE = { code: '', name: '', zone: '', location: '' }

function machineToDraft(machine: CuinaCentralMachine): MachineDraft {
  return {
    code: machine.code || '',
    name: machine.name || '',
    zone: machine.zone || '',
    location: machine.location || '',
    mapX: machine.mapX == null ? '' : String(machine.mapX),
    mapY: machine.mapY == null ? '' : String(machine.mapY),
  }
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export default function CuinaCentralDadesPage() {
  const [status, setStatus] = useState('')
  const [machines, setMachines] = useState<CuinaCentralMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedMachine, setSelectedMachine] = useState<CuinaCentralMachine | null>(null)
  const [machineDraft, setMachineDraft] = useState<MachineDraft | null>(null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [machineTickets, setMachineTickets] = useState<MachineTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [ticketsError, setTicketsError] = useState('')
  const [newMachine, setNewMachine] = useState(EMPTY_MACHINE)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredMachines = useMemo(() => {
    const tokens = normalizeSearchValue(searchQuery).split(/\s+/).filter(Boolean)
    if (!tokens.length) return machines

    return machines.filter((machine) => {
      const searchable = normalizeSearchValue(
        [machine.code, machine.name, machine.zone, machine.location].filter(Boolean).join(' ')
      )
      return tokens.every((token) => searchable.includes(token))
    })
  }, [machines, searchQuery])

  const loadMachines = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/cuina-central/machines', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok) throw new Error(json?.error || 'Error carregant màquines')
      setMachines(Array.isArray(json?.machines) ? json.machines : [])
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Error carregant màquines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMachines()
  }, [loadMachines])

  useEffect(() => {
    if (!historyVisible || !selectedMachine?.code) return

    let cancelled = false
    const loadMachineTickets = async () => {
      setTicketsLoading(true)
      setTicketsError('')
      try {
        const params = new URLSearchParams({
          scope: 'cuina_central',
          ticketType: 'maquinaria',
          machineCode: selectedMachine.code,
          limit: '200',
        })
        const response = await fetch(`/api/maintenance/tickets?${params}`, {
          cache: 'no-store',
        })
        const json = await response.json()
        if (!response.ok) throw new Error(json?.error || 'Error carregant l’historial')
        if (!cancelled) {
          setMachineTickets(Array.isArray(json?.tickets) ? json.tickets : [])
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setMachineTickets([])
          setTicketsError(error instanceof Error ? error.message : 'Error carregant l’historial')
        }
      } finally {
        if (!cancelled) setTicketsLoading(false)
      }
    }

    void loadMachineTickets()
    return () => {
      cancelled = true
    }
  }, [historyVisible, selectedMachine?.code])

  const openMachine = (machine: CuinaCentralMachine) => {
    setSelectedMachine(machine)
    setMachineDraft(machineToDraft(machine))
    setHistoryVisible(false)
    setMachineTickets([])
    setTicketsError('')
  }

  const closeMachine = () => {
    if (saving) return
    setSelectedMachine(null)
    setMachineDraft(null)
    setHistoryVisible(false)
    setMachineTickets([])
    setTicketsError('')
  }

  const createMachine = async () => {
    const response = await fetch('/api/cuina-central/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMachine),
    })
    const json = await response.json()
    if (!response.ok) {
      setStatus(json?.error || 'No s’ha pogut crear la màquina')
      return
    }
    setNewMachine(EMPTY_MACHINE)
    setStatus('Màquina creada')
    await loadMachines()
  }

  const saveMachine = async () => {
    if (!selectedMachine || !machineDraft) return
    setSaving(true)
    try {
      const patch = {
        code: machineDraft.code.trim(),
        name: machineDraft.name.trim(),
        zone: machineDraft.zone.trim(),
        location: machineDraft.location.trim(),
        mapX: machineDraft.mapX.trim() === '' ? null : Number(machineDraft.mapX),
        mapY: machineDraft.mapY.trim() === '' ? null : Number(machineDraft.mapY),
      }
      const response = await fetch(`/api/cuina-central/machines/${selectedMachine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'No s’ha pogut desar la màquina')

      setMachines((rows) =>
        rows.map((machine) =>
          machine.id === selectedMachine.id ? { ...machine, ...patch } : machine
        )
      )
      setStatus('Màquina desada')
      setSelectedMachine(null)
      setMachineDraft(null)
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'No s’ha pogut desar la màquina')
    } finally {
      setSaving(false)
    }
  }

  const deleteMachine = async () => {
    if (!selectedMachine) return
    if (!window.confirm(`Vols eliminar la màquina ${selectedMachine.code || selectedMachine.name}?`)) {
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/cuina-central/machines/${selectedMachine.id}`, {
        method: 'DELETE',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'No s’ha pogut eliminar la màquina')

      setMachines((rows) => rows.filter((machine) => machine.id !== selectedMachine.id))
      setStatus('Màquina eliminada')
      setSelectedMachine(null)
      setMachineDraft(null)
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'No s’ha pogut eliminar la màquina')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <ModuleHeader
        title="Cuina central · Dades"
        subtitle="Gestió de les màquines de Cuina Central. Clica una targeta per editar-la."
        icon={<Factory className="h-5 w-5 text-slate-700" aria-hidden />}
      />

      {status ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {status}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ExcelImportButton entity="machines" onDone={setStatus} />
          <Input
            placeholder="Codi"
            className="h-8 w-28"
            value={newMachine.code}
            onChange={(event) => setNewMachine((state) => ({ ...state, code: event.target.value }))}
          />
          <Input
            placeholder="Nom"
            className="h-8 w-40"
            value={newMachine.name}
            onChange={(event) => setNewMachine((state) => ({ ...state, name: event.target.value }))}
          />
          <Input
            placeholder="Zona"
            className="h-8 w-28"
            value={newMachine.zone}
            onChange={(event) => setNewMachine((state) => ({ ...state, zone: event.target.value }))}
          />
          <Input
            placeholder="Ubicació"
            className="h-8 w-36"
            value={newMachine.location}
            onChange={(event) =>
              setNewMachine((state) => ({ ...state, location: event.target.value }))
            }
          />
          <Button size="sm" onClick={() => void createMachine()}>
            Afegir
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void loadMachines()}>
            Actualitzar
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cerca per codi, nom, zona o ubicació…"
              className="h-10 pl-9 pr-10"
              aria-label="Cercar màquines"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Netejar cerca"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="shrink-0 text-xs text-slate-500" aria-live="polite">
            {filteredMachines.length} de {machines.length} màquines
          </p>
        </div>

        {loading ? <p className="text-sm text-slate-500">Carregant…</p> : null}

        {!loading ? (
          filteredMachines.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredMachines.map((machine) => (
              <button
                key={machine.id}
                type="button"
                onClick={() => openMachine(machine)}
                className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={`Editar màquina ${machine.code || machine.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{machine.code}</p>
                    <p className="text-sm text-slate-600">{machine.name}</p>
                  </div>
                  <Pencil className="h-4 w-4 text-slate-400 transition group-hover:text-emerald-600" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {machine.zone || '—'} · {machine.location || '—'}
                </p>
                <p className="mt-2 text-[11px] font-medium text-emerald-700">Clica per editar</p>
              </button>
            ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No s’ha trobat cap màquina</p>
              <p className="mt-1 text-xs text-slate-500">
                Prova un altre codi, nom, zona o ubicació.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setSearchQuery('')}
              >
                Netejar cerca
              </Button>
            </div>
          )
        ) : null}
      </section>

      <Dialog open={Boolean(selectedMachine && machineDraft)} onOpenChange={(open) => !open && closeMachine()}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Editar màquina</DialogTitle>
            <DialogDescription>
              Modifica les dades, crea un tiquet de manteniment o elimina la màquina.
            </DialogDescription>
          </DialogHeader>

          {selectedMachine && machineDraft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <MachineField label="Codi">
                <Input
                  value={machineDraft.code}
                  onChange={(event) =>
                    setMachineDraft((draft) =>
                      draft ? { ...draft, code: event.target.value } : draft
                    )
                  }
                />
              </MachineField>
              <MachineField label="Nom">
                <Input
                  value={machineDraft.name}
                  onChange={(event) =>
                    setMachineDraft((draft) =>
                      draft ? { ...draft, name: event.target.value } : draft
                    )
                  }
                />
              </MachineField>
              <MachineField label="Zona">
                <Input
                  value={machineDraft.zone}
                  onChange={(event) =>
                    setMachineDraft((draft) =>
                      draft ? { ...draft, zone: event.target.value } : draft
                    )
                  }
                />
              </MachineField>
              <MachineField label="Ubicació">
                <Input
                  value={machineDraft.location}
                  onChange={(event) =>
                    setMachineDraft((draft) =>
                      draft ? { ...draft, location: event.target.value } : draft
                    )
                  }
                />
              </MachineField>
              <MachineField label="Coordenada X">
                <Input
                  type="number"
                  value={machineDraft.mapX}
                  onChange={(event) =>
                    setMachineDraft((draft) =>
                      draft ? { ...draft, mapX: event.target.value } : draft
                    )
                  }
                />
              </MachineField>
              <MachineField label="Coordenada Y">
                <Input
                  type="number"
                  value={machineDraft.mapY}
                  onChange={(event) =>
                    setMachineDraft((draft) =>
                      draft ? { ...draft, mapY: event.target.value } : draft
                    )
                  }
                />
              </MachineField>
              <div className="sm:col-span-2">
                <MachineMaintenanceTicketButton machine={selectedMachine} />
              </div>

              <section className="sm:col-span-2 border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Historial de tiquets</h3>
                    <p className="text-xs text-slate-500">
                      Incidències de manteniment associades a aquesta màquina.
                    </p>
                  </div>
                  {historyVisible && !ticketsLoading ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {machineTickets.length}
                    </span>
                  ) : null}
                </div>

                {!historyVisible ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setHistoryVisible(true)}
                  >
                    Veure historial
                  </Button>
                ) : null}
                {historyVisible && ticketsLoading ? (
                  <p className="text-sm text-slate-500">Carregant historial…</p>
                ) : null}
                {historyVisible && ticketsError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {ticketsError}
                  </p>
                ) : null}
                {historyVisible && !ticketsLoading && !ticketsError && machineTickets.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                    Aquesta màquina encara no té tiquets de manteniment.
                  </p>
                ) : null}
                {historyVisible && machineTickets.length > 0 ? (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {machineTickets.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={`/menu/cuina-central/manteniment/tickets?ticketId=${encodeURIComponent(ticket.id)}`}
                        className="block rounded-xl border border-slate-200 px-3 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {ticket.ticketCode || ticket.incidentNumber || ticket.id}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {formatTicketStatus(ticket.status)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {ticket.description || 'Sense descripció'}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatTicketDate(ticket.createdAt)}
                          {ticket.assignedToNames?.length
                            ? ` · ${ticket.assignedToNames.join(', ')}`
                            : ''}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteMachine()}
              disabled={saving}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Eliminar
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={closeMachine} disabled={saving}>
                Cancel·lar
              </Button>
              <Button type="button" onClick={() => void saveMachine()} disabled={saving}>
                {saving ? 'Desant…' : 'Desar canvis'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MachineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  )
}

function formatTicketDate(value?: string | number | null) {
  if (value == null || value === '') return 'Data no disponible'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data no disponible'
  return date.toLocaleDateString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTicketStatus(value?: string | null) {
  const labels: Record<string, string> = {
    nou: 'Nou',
    assignat: 'Assignat',
    reassignat: 'Reassignat',
    en_curs: 'En curs',
    espera: 'En espera',
    fet: 'Fet',
    no_fet: 'No fet',
    validat: 'Validat',
  }
  const key = String(value || 'nou').trim().toLowerCase()
  return labels[key] || value || 'Nou'
}
