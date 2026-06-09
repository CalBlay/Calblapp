'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Person {
  id?: string
  name?: string
  role?: 'responsable' | 'conductor' | 'treballador'
  phone?: string
  department?: string
  meetingPoint?: string
  time?: string
  plate?: string
}

interface EventPersonnelModalProps {
  open: boolean
  onClose: () => void
  eventName: string
  code?: string
  responsables?: Person[]
  conductors?: Person[]
  treballadors?: Person[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

function roleIcon(role?: string) {
  if (role === 'responsable') return '🎓'
  if (role === 'conductor') return '🚚'
  return '👤'
}

function parseEventTitle(summary: string) {
  if (!summary) return { name: '', ln: '', code: '' }

  const parts = summary.split('-').map((p) => p.trim())

  let ln = 'Altres'
  if (summary.startsWith('E-') || summary.startsWith('E -')) ln = 'Empresa'
  else if (summary.startsWith('C-') || summary.startsWith('C -')) ln = 'Casaments'
  else if (summary.startsWith('F-') || summary.startsWith('F -')) ln = 'Foodlovers'
  else if (summary.startsWith('PM')) ln = 'Agenda'

  const name = parts.length > 1 ? parts[1] : summary
  const match = summary.match(/#\s*([A-Z]\d+)/)
  const code = match ? match[1] : ''

  return { name, ln, code }
}

function normalizePhoneHref(phone?: string) {
  const raw = String(phone || '').trim()
  if (!raw) return null
  const normalized = raw.replace(/[^\d+]/g, '')
  return normalized ? `tel:${normalized}` : null
}

function sortWorkers(list: Person[]) {
  const priority = { responsable: 3, conductor: 2, treballador: 1 }
  return [...list].sort((a, b) => {
    const pa = priority[(a.role || 'treballador') as keyof typeof priority] || 0
    const pb = priority[(b.role || 'treballador') as keyof typeof priority] || 0
    if (pa !== pb) return pb - pa
    return String(a.name || '').localeCompare(String(b.name || ''), 'ca')
  })
}

function dedupeWorkers(workers: Person[]) {
  const byKey = new Map<string, Person>()
  const priority = { responsable: 3, conductor: 2, treballador: 1 }

  workers.forEach((worker) => {
    const key = `${String(worker.department || '').trim().toLowerCase()}|${String(worker.id || worker.name || '')
      .trim()
      .toLowerCase()}`
    if (!key) return

    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, worker)
      return
    }

    const existingPriority =
      priority[(existing.role || 'treballador') as keyof typeof priority] || 0
    const nextPriority =
      priority[(worker.role || 'treballador') as keyof typeof priority] || 0

    if (nextPriority > existingPriority) {
      byKey.set(key, {
        ...worker,
        phone: worker.phone || existing.phone,
        plate: worker.plate || existing.plate,
      })
      return
    }

    byKey.set(key, {
      ...existing,
      phone: existing.phone || worker.phone,
      plate: existing.plate || worker.plate,
      time: existing.time || worker.time,
      meetingPoint: existing.meetingPoint || worker.meetingPoint,
      department: existing.department || worker.department,
    })
  })

  return Array.from(byKey.values())
}

function groupByDepartment(workers: Person[]) {
  const map = new Map<string, Person[]>()

  workers.forEach((worker) => {
    const depRaw = String(worker.department || '').trim()
    const dep = depRaw
      ? depRaw.charAt(0).toUpperCase() + depRaw.slice(1)
      : 'Sense departament'
    const list = map.get(dep) || []
    list.push(worker)
    map.set(dep, list)
  })

  return Array.from(map.entries()).map(([dep, list]) => [dep, sortWorkers(list)] as const)
}

export default function EventPersonnelModal({
  open,
  onClose,
  eventName,
  code,
  responsables = [],
  conductors = [],
  treballadors = [],
  loading = false,
  error = null,
  onRetry,
}: EventPersonnelModalProps) {
  if (!open) return null

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Personal assignat
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">Carregant personal...</p>
        </DialogContent>
      </Dialog>
    )
  }

  const responsablesWorkers: Person[] = responsables.map((responsable) => ({
    ...responsable,
    role: 'responsable',
  }))

  const conductorsWorkers: Person[] = conductors.map((conductor) => ({
    ...conductor,
    role: 'conductor',
  }))

  const treballadorsWorkers: Person[] = treballadors.map((treballador) => ({
    ...treballador,
    role: 'treballador',
  }))

  const allWorkers: Person[] = [
    ...responsablesWorkers,
    ...conductorsWorkers,
    ...treballadorsWorkers,
  ]

  const grouped = groupByDepartment(dedupeWorkers(allWorkers))
  const { name, ln, code: parsedCode } = parseEventTitle(eventName)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {name} - {ln}
          </DialogTitle>
          <div className="text-sm font-medium text-gray-600">
            Llistat de personal assignat
          </div>
          {(parsedCode || code) && (
            <div className="text-xs text-gray-400">
              Codi: {parsedCode || code}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {error ? (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>No s&apos;ha pogut carregar el personal assignat.</p>
              <p className="text-xs text-red-600">{error}</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                >
                  Torna-ho a provar
                </button>
              ) : null}
            </div>
          ) : allWorkers.length === 0 ? (
            <div className="rounded-lg border p-3 text-sm text-gray-500">
              Sense personal assignat en aquest esdeveniment.
            </div>
          ) : (
            grouped.map(([dep, list]) => (
              <section key={dep} className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase text-gray-600">
                    {dep}
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {list.length} persones
                  </span>
                </div>

                <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {list.map((worker, index) => {
                    const phoneHref = normalizePhoneHref(worker.phone)

                    return (
                      <li
                        key={worker.id || `${index}-${worker.name}`}
                        className="flex flex-col gap-2 border-b border-slate-100 px-3 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-base" aria-hidden>
                            {roleIcon(worker.role)}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 sm:truncate">
                            {worker.name || '-'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pl-7 text-xs sm:shrink-0 sm:justify-end sm:pl-0">
                          {worker.role === 'conductor' && worker.plate ? (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 whitespace-nowrap">
                              {worker.plate}
                            </span>
                          ) : null}
                          {worker.meetingPoint ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 whitespace-nowrap">
                              {worker.meetingPoint}
                            </span>
                          ) : null}
                          {worker.time ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 whitespace-nowrap">
                              {worker.time}
                            </span>
                          ) : null}
                          {worker.role === 'responsable' && worker.phone ? (
                            phoneHref ? (
                              <a
                                href={phoneHref}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700 transition hover:bg-slate-100 whitespace-nowrap"
                              >
                                {worker.phone}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-500 whitespace-nowrap">
                                {worker.phone}
                              </span>
                            )
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
