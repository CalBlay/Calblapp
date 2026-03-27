'use client'

import { FileSpreadsheet, Printer, Trash2 } from 'lucide-react'
import { typography } from '@/lib/typography'
import { formatDateOnly } from '@/lib/date-format'
import type { Template } from '../types'

type Props = {
  filtered: Template[]
  onOpenTemplate: (id: string) => void
  onExportPdf: (template: Template) => void
  onExportExcel: (template: Template) => void
  onDeleteTemplate: (template: Template) => void
}

export default function TemplatesListCard({
  filtered,
  onOpenTemplate,
  onExportPdf,
  onExportExcel,
  onDeleteTemplate,
}: Props) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y">
        {filtered.length === 0 ? (
          <div className={`px-4 py-6 ${typography('bodySm')}`}>No hi ha plantilles.</div>
        ) : (
          filtered.map((template) => (
            <div key={template.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button
                    type="button"
                    className={`${typography('cardTitle')} text-left hover:underline`}
                    onClick={() => onOpenTemplate(template.id)}
                  >
                    {template.name}
                  </button>
                  <div
                    className={`mt-2 flex flex-wrap gap-3 ${typography('bodyXs').replace('text-slate-500', 'text-gray-600')}`}
                  >
                    <span>Temporalitat: {template.periodicity || '-'}</span>
                    <span>Ultima revisio: {formatDateOnly(template.lastDone)}</span>
                    <span>Ubicacio: {template.location || '-'}</span>
                    <span>Seccions: {(template.sections || []).length}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Exportar a PDF"
                    aria-label="Exportar a PDF"
                    className="rounded-full border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => onExportPdf(template)}
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Exportar a Excel"
                    aria-label="Exportar a Excel"
                    className="rounded-full border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                    onClick={() => onExportExcel(template)}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Eliminar plantilla"
                    aria-label="Eliminar plantilla"
                    className="rounded-full border border-red-300 p-2 text-red-700 hover:bg-red-50"
                    onClick={() => onDeleteTemplate(template)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
