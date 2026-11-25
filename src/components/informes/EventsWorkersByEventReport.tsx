import { useMemo } from 'react'
import { Calendar, PencilLine } from 'lucide-react'
import type { EventsWorkersEntryRow } from '@/lib/informes/eventsWorkersOverview'
import { groupEventsWorkersByEvent } from '@/lib/informes/eventsWorkersByEvent'
import { colorByDepartment, dotByDepartment } from '@/lib/colors'
import { formatTornsDayDate, parseDateValue } from '@/lib/date-format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function formatCorporateDate(value: string) {
  const parsed = parseDateValue(value)
  const weekdays = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds']
  const weekday = parsed ? weekdays[parsed.getDay()] : ''
  return [weekday, formatTornsDayDate(value, value || '—')].filter(Boolean).join(' ')
}

function formatHours(value: number) {
  return `${value.toFixed(1)} h`
}

function roleLabel(role: string) {
  if (role === 'responsable') return 'Responsable'
  if (role === 'conductor') return 'Conductor/a'
  return 'Treballador/a'
}

export function EventsWorkersByEventReport({
  entries,
  onCorrectEvent,
}: {
  entries: EventsWorkersEntryRow[]
  onCorrectEvent?: (event: { eventId: string; eventName: string }) => void
}) {
  const events = useMemo(() => groupEventsWorkersByEvent(entries), [entries])

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
        No hi ha personal assignat als esdeveniments del període seleccionat.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <article key={event.key} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/80 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-sm font-bold tabular-nums text-fuchsia-700">
                    <Calendar className="h-4 w-4" aria-hidden />
                    {formatCorporateDate(event.eventDate)}
                  </span>
                  {event.eventCode ? (
                    <span className="text-sm font-bold text-indigo-700">{event.eventCode}</span>
                  ) : null}
                  <h3 className="text-lg font-semibold text-slate-900">
                    {event.eventName || 'Esdeveniment'}
                  </h3>
                  {event.location ? (
                    <span className="text-sm font-medium text-slate-500">· {event.location}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                {onCorrectEvent ? (
                  <button
                    type="button"
                    onClick={() => onCorrectEvent({ eventId: event.eventId, eventName: event.eventName })}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 font-semibold text-violet-700 hover:bg-violet-100"
                  >
                    <PencilLine className="h-3.5 w-3.5" aria-hidden />
                    Corregir hores
                  </button>
                ) : null}
                <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5">
                  {event.departments.length} departaments
                </span>
                <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5">
                  {event.workersCount} personal intern
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
                  {event.ettCount} ETT
                </span>
                <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1.5">
                  {event.closedCount}/{event.departments.reduce((sum, item) => sum + item.rows.length + item.ettRows.length, 0)} tancats
                </span>
              </div>
            </div>
          </header>

          <div className="divide-y">
            {event.departments.map((department) => (
              <section key={department.department} className="border-l-4 border-l-slate-300">
                <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 ${colorByDepartment(department.department)}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${dotByDepartment(department.department)}`} />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">Departament</p>
                      <h4 className="text-base font-bold">{department.department}</h4>
                    </div>
                  </div>
                  <p className="text-xs opacity-70">
                    {department.workersCount} interns · {department.ettCount} ETT · {department.closedCount}/{department.rows.length + department.ettRows.length} amb tancament
                  </p>
                </div>
                {department.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader className="bg-slate-50/80">
                      <TableRow className="border-slate-200 hover:bg-transparent">
                        <TableHead className="h-10 min-w-[220px] bg-white/70 text-xs font-bold uppercase tracking-[0.1em] text-slate-700">Personal</TableHead>
                        <TableHead className="h-10 min-w-[135px] bg-blue-50/80 text-xs font-bold uppercase tracking-[0.1em] text-blue-800">Hora inici</TableHead>
                        <TableHead className="h-10 min-w-[170px] bg-indigo-50/80 text-xs font-bold uppercase tracking-[0.1em] text-indigo-800">Hora final</TableHead>
                        <TableHead className="h-10 min-w-[140px] bg-emerald-50/80 text-xs font-bold uppercase tracking-[0.1em] text-emerald-800">Total hores</TableHead>
                        <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Rol</TableHead>
                        <TableHead className="h-10 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Acumulat període</TableHead>
                        <TableHead className="h-10 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Estat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {department.rows.map((row, index) => {
                        const closed = Boolean(row.realEndTime)
                        return (
                          <TableRow key={`${row.eventId}-${row.workerName}-${row.role}-${index}`}>
                            <TableCell className="bg-white/70 py-4 text-base font-bold text-slate-950">
                              {row.workerName}
                            </TableCell>
                            <TableCell className="bg-blue-50/40 py-4 text-lg font-bold tabular-nums text-blue-950">
                              {row.actualStartTime || row.plannedStartTime || '—'}
                            </TableCell>
                            <TableCell
                              className={`bg-indigo-50/40 py-4 text-lg font-bold tabular-nums ${
                                closed ? 'text-indigo-950' : 'text-amber-700'
                              }`}
                            >
                              {row.realEndTime || 'Pendent'}
                            </TableCell>
                            <TableCell className="bg-emerald-50/40 py-4 text-lg font-extrabold tabular-nums text-emerald-900">
                              {closed ? formatHours(row.actualHours) : '—'}
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-wrap gap-1">
                                {row.roles.map((role) => (
                                  <span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                    {roleLabel(role)}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="py-4 text-right text-sm font-medium tabular-nums text-slate-500">
                              {formatHours(row.periodActualHours)}
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex flex-col items-start gap-1">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    row.wasCorrected
                                      ? 'bg-violet-50 text-violet-700'
                                      : closed
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {row.wasCorrected
                                    ? 'Corregit'
                                    : row.lateArrival
                                      ? 'Arribada tardana'
                                      : closed
                                        ? 'Tancat'
                                        : 'Pendent de tancament'}
                                </span>
                                {row.wasCorrected && row.correctionReason ? (
                                  <span className="max-w-48 text-xs text-slate-500" title={row.correctionReason}>
                                    {row.correctionReason}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                ) : null}
                {department.ettRows.length > 0 ? (
                  <div className="border-t border-amber-200 bg-amber-50/30 px-4 py-4 sm:px-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                          Personal extern
                        </p>
                        <h5 className="text-base font-bold text-amber-950">ETT</h5>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                        {department.ettCount} places
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
                      <Table className="min-w-[720px]">
                        <TableHeader className="bg-amber-50/80">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="min-w-[240px] text-xs font-bold uppercase tracking-[0.1em] text-amber-900">Plaça i empresa ETT</TableHead>
                            <TableHead className="min-w-[130px] text-xs font-bold uppercase tracking-[0.1em] text-slate-700">Hora inici</TableHead>
                            <TableHead className="min-w-[150px] text-xs font-bold uppercase tracking-[0.1em] text-slate-700">Hora final</TableHead>
                            <TableHead className="min-w-[130px] text-xs font-bold uppercase tracking-[0.1em] text-slate-700">Total hores</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-[0.1em] text-slate-700">Estat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {department.ettRows.map((row, index) => {
                            const closed = Boolean(row.realEndTime)
                            return (
                              <TableRow key={`${row.eventId}-${row.workerId || index}-ett`}>
                                <TableCell className="py-3 font-bold text-amber-950">{row.workerName}</TableCell>
                                <TableCell className="py-3 font-semibold tabular-nums text-slate-900">
                                  {row.actualStartTime || row.plannedStartTime || '—'}
                                </TableCell>
                                <TableCell className={`py-3 font-semibold tabular-nums ${closed ? 'text-slate-900' : 'text-amber-700'}`}>
                                  {row.realEndTime || 'Pendent'}
                                </TableCell>
                                <TableCell className="py-3 font-bold tabular-nums text-emerald-800">
                                  {closed ? formatHours(row.actualHours) : '—'}
                                </TableCell>
                                <TableCell className="py-3">
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${closed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                    {row.wasCorrected ? 'Corregit' : closed ? 'Tancat' : 'Pendent de tancament'}
                                  </span>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
