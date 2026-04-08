'use client'

import { Trash2 } from 'lucide-react'
import { typography } from '@/lib/typography'
import { formatDateOnly } from '@/lib/date-format'
import { displayMaintenanceTemplateName } from '@/lib/maintenanceTemplateDisplay'
import { PERIODICITY_OPTIONS, type Template } from '../types'

type Props = {
  filtered: Template[]
  selectedTemplate: Template | null
  selectedTemplateTaskCount: number
  selectedTemplateLastNotes: string
  onSelectTemplate: (id: string) => void
  onOpenTemplate: (id: string) => void
  onDeleteTemplate: (template: Template) => void
}

export default function EmbeddedTemplatesLayout({
  filtered,
  selectedTemplate,
  selectedTemplateTaskCount,
  selectedTemplateLastNotes,
  onSelectTemplate,
  onOpenTemplate,
  onDeleteTemplate,
}: Props) {
  const openTemplateHistory = (id: string) => {
    const url = `/menu/manteniment/preventius/plantilles/${id}/historial`
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.7fr)]">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y">
          {filtered.length === 0 ? (
            <div className={`px-4 py-6 ${typography('bodySm')}`}>No hi ha plantilles.</div>
          ) : (
            filtered.map((template) => {
              const isSelected = selectedTemplate?.id === template.id
              return (
                <div
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectTemplate(template.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectTemplate(template.id)
                    }
                  }}
                  className={`px-4 py-3 transition ${isSelected ? 'bg-violet-50/80' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className={`${typography('cardTitle')} text-left hover:underline`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onOpenTemplate(template.id)
                        }}
                      >
                        {displayMaintenanceTemplateName(template)}
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openTemplateHistory(template.id)
                        }}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        Historial
                      </button>
                      <button
                        type="button"
                        title="Eliminar plantilla"
                        aria-label="Eliminar plantilla"
                        className="rounded-full border border-red-300 p-2 text-red-700 transition hover:bg-red-50"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeleteTemplate(template)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {selectedTemplate ? (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-4">
                <div className={typography('sectionTitle')}>Resum del preventiu</div>
                <button
                  type="button"
                  className={`mt-2 ${typography('pageTitle')} text-left hover:underline`}
                  onClick={() => onOpenTemplate(selectedTemplate.id)}
                >
                  {displayMaintenanceTemplateName(selectedTemplate)}
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className={typography('eyebrow')}>Temporalitat</div>
                    <div className={`mt-2 ${typography('kpiValue')}`}>
                      {PERIODICITY_OPTIONS.find((option) => option.value === selectedTemplate.periodicity)?.label ||
                        selectedTemplate.periodicity ||
                        '-'}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className={typography('eyebrow')}>Ultima revisio</div>
                    <div className={`mt-2 ${typography('kpiValue')}`}>{formatDateOnly(selectedTemplate.lastDone)}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className={typography('eyebrow')}>Observacions ultima revisio</div>
                  <div
                    className={`mt-2 min-h-[2.75rem] whitespace-pre-wrap ${typography('bodyMd').replace('text-slate-700', 'text-slate-900')}`}
                  >
                    {selectedTemplateLastNotes || ''}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className={typography('label')}>Ubicacio</div>
                  <div className={`mt-1 ${typography('bodyMd').replace('text-slate-700', 'text-slate-900')}`}>
                    {selectedTemplate.location || 'Sense ubicacio definida'}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className={typography('label')}>Operaris</div>
                  <div className={`mt-1 ${typography('bodyMd').replace('text-slate-700', 'text-slate-900')}`}>
                    {[selectedTemplate.primaryOperator, selectedTemplate.backupOperator].filter(Boolean).join(' / ') ||
                      'Sense operaris assignats'}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className={typography('label')}>Distribucio</div>
                  <div className={`mt-1 ${typography('bodyMd').replace('text-slate-700', 'text-slate-900')}`}>
                    {(selectedTemplate.sections || [])
                      .slice(0, 4)
                      .map((section) => section.location || 'GENERAL')
                      .join(' / ') || 'Sense seccions'}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className={typography('label')}>Seccions</div>
                    <div className={`mt-1 ${typography('bodyMd').replace('text-slate-700', 'text-slate-900')}`}>
                      {(selectedTemplate.sections || []).length}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className={typography('label')}>Tasques</div>
                    <div className={`mt-1 ${typography('bodyMd').replace('text-slate-700', 'text-slate-900')}`}>
                      {selectedTemplateTaskCount}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-2 w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50"
                  onClick={() => onDeleteTemplate(selectedTemplate)}
                >
                  Eliminar plantilla
                </button>
              </div>
            </div>
          ) : (
            <div className={`rounded-2xl border border-dashed border-slate-200 px-4 py-8 ${typography('bodySm')}`}>
              Selecciona un preventiu per veure&apos;n el resum.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
