//file: src/components/events/EventModificationsModal.tsx
'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useModifications } from '@/hooks/useModifications'

interface Props {
  open: boolean
  onClose: () => void
  eventId: string
  eventSummary?: string
}

/* ───────────────────────── Helpers ───────────────────────── */
function importanceColor(level: string) {
  const norm = (level || '').toLowerCase()
  if (norm === 'alta') return 'bg-red-50 text-red-700 border border-red-200'
  if (norm === 'mitjana') return 'bg-orange-50 text-orange-700 border border-orange-200'
  if (norm === 'baixa') return 'bg-green-50 text-green-700 border border-green-200'
  return 'bg-gray-50 text-gray-600 border border-gray-200'
}

function departmentColor(dep: string) {
  const norm = (dep || '').toLowerCase()
  if (norm.includes('log')) return 'bg-blue-50 text-blue-700 border border-blue-200'
  if (norm.includes('cuina')) return 'bg-orange-50 text-orange-700 border border-orange-200'
  if (norm.includes('pro')) return 'bg-green-50 text-green-700 border border-green-200'
  return 'bg-gray-50 text-gray-600 border border-gray-200'
}

// 🔹 Helper per extreure nom i línia de negoci
function parseEventTitle(summary: string) {
  if (!summary) return { name: '', ln: '', code: '' }
  const parts = summary.split('-').map(p => p.trim())
  let ln = ''
  if (summary.startsWith('E-') || summary.startsWith('E -')) ln = 'Empresa'
  else if (summary.startsWith('C-') || summary.startsWith('C -')) ln = 'Casaments'
  else if (summary.startsWith('F-') || summary.startsWith('F -')) ln = 'Foodlovers'
  else if (summary.startsWith('PM')) ln = 'Agenda'
  else ln = 'Altres'
  const name = parts.length > 1 ? parts[1] : summary
  const match = summary.match(/#\s*([A-Z]\d+)/)
  const code = match ? match[1] : ''
  return { name, ln, code }
}

/* ───────────────────────── Component ───────────────────────── */
export default function EventModificationsModal({ open, onClose, eventId, eventSummary = '' }: Props) {
  const { modifications, loading, error } = useModifications({ eventId, enabled: open })
  const { name, ln, code } = parseEventTitle(eventSummary)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {name} – {ln}
          </DialogTitle>
          <div className="text-sm text-gray-600">REGISTRE DE MODIFICACIONS</div>
          {code && (
            <div className="text-xs text-gray-400">
              Codi: {code}
            </div>
          )}
        </DialogHeader>

        {/* ── Estat de càrrega ── */}
        {loading && <p className="text-sm text-gray-500">Carregant modificacions…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* ── Sense resultats ── */}
        {!loading && !error && modifications.length === 0 && (
          <p className="text-sm text-gray-500">
            No hi ha modificacions per aquest esdeveniment.
          </p>
        )}

        {/* ── Llista ── */}
        {!loading && modifications.length > 0 && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {modifications.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl bg-white border border-gray-200 shadow-sm"
              >
                {/* ── Descripció ── */}
                <div className="text-sm font-medium text-gray-900 mb-1">
                  {m.description}
                </div>

                {/* ── Autor i departament ── */}
                <div className="flex flex-wrap gap-2 text-xs mb-2">
                  {m.department && (
                    <span className={`px-2 py-0.5 rounded-full font-medium ${departmentColor(m.department)}`}>
                      {m.department}
                    </span>
                  )}
                  {m.createdBy && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                      {m.createdBy}
                    </span>
                  )}
                  {m.importance && (
                    <span className={`px-2 py-0.5 rounded-full font-medium ${importanceColor(m.importance)}`}>
                      {m.importance}
                    </span>
                  )}
                </div>

                {/* ── Categoria ── */}
                {m.category?.label && (
                  <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 inline-block px-2 py-0.5 rounded-full mb-2">
                    {m.category.id} - {m.category.label}
                  </div>
                )}

                {/* ── Data ── */}
                <div className="text-xs text-gray-400">
                  {new Date(m.createdAt).toLocaleString('ca-ES')}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
