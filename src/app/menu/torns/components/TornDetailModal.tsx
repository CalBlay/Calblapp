// filename: src/app/menu/torns/components/TornDetailModal.tsx
'use client'
import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
/** ───────────────────────── Types ───────────────────────── */
export interface Worker {
  id?: string
  name?: string
  role?: string
  startTime?: string
  endTime?: string
  meetingPoint?: string
  department?: string
  plate?: string
}
export interface TornDetailModalProps {
  open: boolean
  onClose: () => void
  torn: {
    id: string
    eventName: string
    code?: string
    vestimentModel?: string
    __rawWorkers?: Worker[]
  } | null
  role?: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador'
}
/** ───────────────────────── Helpers ───────────────────────── */

function cleanEventName(s?: string) {
  if (!s) return ''
  return s.replace(/^[A-Z]\s*-\s*/i, '').trim()
}
function timeRange(a?: string, b?: string) {
  const left = (a || '').trim()
  const right = (b || '').trim()
  if (left && right) return `${left} - ${right}`
  return left || right || ''
}
function roleIcon(role?: string) {
  const r = String(role || '').toLowerCase()
  if (r === 'responsable') return '🎓'
  if (r === 'conductor') return '🚗'
  return '👤'
}
function groupByDepartment(workers: Worker[]) {
  const map = new Map<string, Worker[]>()
  workers.forEach(w => {
    let dep = (w.department || '').trim()
    if (!dep) dep = 'Sense departament'

    // 👇 Capitalitzem la primera lletra
    const pretty = dep.charAt(0).toUpperCase() + dep.slice(1)

    if (!map.has(pretty)) map.set(pretty, [])
    map.get(pretty)!.push(w)
  })

  return Array.from(map.entries())
}
/** ───────────────────────── Component ───────────────────────── */
export default function TornDetailModal({ open, onClose, torn, role: _role, }: TornDetailModalProps) {
  if (!torn) return null

  const workers: Worker[] = Array.isArray(torn.__rawWorkers) ? torn.__rawWorkers : []

  // agrupació sempre per departament
const grouped = groupByDepartment(workers)
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[min(90dvh,100svh)] overflow-y-auto rounded-2xl p-4 sm:p-6 gap-3 sm:gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg font-semibold pr-2">
            Detall del torn
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Capçalera esdeveniment ── */}
          <div>
            <div className="font-medium text-gray-900 text-base sm:text-[15px] break-words">
              {cleanEventName(torn.eventName)}
            </div>
            {torn.code && (
              <div className="text-xs text-gray-500 mt-1 tabular-nums">{torn.code}</div>
            )}
            {(torn.vestimentModel || '').trim() ? (
              <div className="mt-2 text-sm text-violet-800 break-words">
                <span className="font-medium text-violet-950">Vestimenta: </span>
                {torn.vestimentModel}
              </div>
            ) : null}
          </div>

          {/* ── Llistat ── */}
          {workers.length === 0 ? (
            <div className="text-sm text-gray-500 border rounded-lg p-3">
              Sense treballadors assignats en aquest torn.
            </div>
          ) : (
            grouped.map(([dep, list]) => (
              <div key={dep} className="mb-3">
                {dep && (
                  <div className="text-xs font-semibold text-gray-600 uppercase mb-1">
                    {dep}
                  </div>
                )}
                <ul className="border rounded-xl overflow-hidden bg-white">
                  {list.map((w, i) => {
                    const icon = roleIcon(w.role)
                    const displayTime = timeRange(w.startTime, w.endTime)
                    const displayPoint = (w.meetingPoint || '').trim()
                    const plate =
                      w.role?.toLowerCase() === 'conductor'
                        ? (w.plate || '').trim()
                        : ''
                    return (
                      <li
                        key={`${dep}-${i}-${w.id ?? ''}-${w.startTime ?? ''}-${w.endTime ?? ''}`}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-3 sm:py-2 px-3 sm:px-2 text-sm border-b border-gray-100 last:border-0"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-lg shrink-0" aria-hidden>
                            {icon}
                          </span>
                          <span className="font-medium break-words min-w-0">{w.name || '—'}</span>
                          {plate && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                              {plate}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 sm:pl-0 sm:justify-end sm:text-right">
                          <div className="text-gray-700 tabular-nums font-medium">
                            {displayTime || '—'}
                          </div>
                          <div className="text-gray-500 break-words min-w-0 sm:max-w-[200px] sm:text-right">
                            {displayPoint || '—'}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

