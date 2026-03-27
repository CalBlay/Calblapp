'use client'

import type { ImportPreview, ModelBImportMode } from '../types'
import { typography } from '@/lib/typography'

type Props = {
  preview: ImportPreview | null
  importing: boolean
  modelBMode: ModelBImportMode
  modelBAvailablePeriods: string[]
  modelBSelectedPeriods: string[]
  onFileChange: (file?: File | null) => void
  onClosePreview: () => void
  onImport: () => void
  onModelBModeChange: (mode: ModelBImportMode) => void
  onModelBSelectedPeriodsChange: (updater: (prev: string[]) => string[]) => void
}

export default function ImportTemplatesCard({
  preview,
  importing,
  modelBMode,
  modelBAvailablePeriods,
  modelBSelectedPeriods,
  onFileChange,
  onClosePreview,
  onImport,
  onModelBModeChange,
  onModelBSelectedPeriodsChange,
}: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className={typography('sectionTitle')}>Importar plantilla</div>
          <div className={`mt-1 ${typography('bodyXs')}`}>
            Excel o CSV. Detectem el format i et mostrem una previsualitzacio abans de guardar.
          </div>
        </div>
        <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100">
          Seleccionar fitxer
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => onFileChange(event.target.files?.[0])}
          />
        </label>
      </div>

      {preview ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
          <div className={`flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between ${typography('bodyXs').replace('text-slate-500', 'text-gray-700')}`}>
            <div>
              Fitxer: <span className="font-semibold">{preview.fileName}</span>
            </div>
            <div>
              Model: <span className="font-semibold">{preview.model}</span>
            </div>
          </div>

          <div className={typography('bodyXs').replace('text-slate-500', 'text-gray-700')}>
            Plantilles detectades: <span className="font-semibold">{preview.templates.length}</span>
          </div>

          {preview.warnings.map((warning, idx) => (
            <div key={idx} className="text-xs text-amber-700">
              {warning}
            </div>
          ))}

          {preview.model === 'B' ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className={typography('label').replace('text-slate-500', 'text-gray-700')}>Importacio model B</div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="modelBMode"
                  checked={modelBMode === 'single'}
                  onChange={() => onModelBModeChange('single')}
                />
                Crear una sola plantilla (fusionada)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="modelBMode"
                  checked={modelBMode === 'split'}
                  onChange={() => onModelBModeChange('split')}
                />
                Crear una plantilla per temporalitat
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="modelBMode"
                  checked={modelBMode === 'custom'}
                  onChange={() => onModelBModeChange('custom')}
                />
                Seleccionar temporalitats concretes
              </label>
              {modelBMode === 'custom' ? (
                <div className="flex flex-wrap gap-2 pl-5">
                  {modelBAvailablePeriods.map((period) => {
                    const checked = modelBSelectedPeriods.includes(period)
                    return (
                      <label key={period} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (event.target.checked) {
                              onModelBSelectedPeriodsChange((prev) => Array.from(new Set([...prev, period])))
                            } else {
                              onModelBSelectedPeriodsChange((prev) => prev.filter((value) => value !== period))
                            }
                          }}
                        />
                        {period}
                      </label>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            {preview.templates.slice(0, 4).map((template, idx) => (
              <div
                key={`${template.name}-${idx}`}
                className={typography('bodyXs').replace('text-slate-500', 'text-gray-700')}
              >
                {template.name} / {template.periodicity || 'sense temporalitat'} / {(template.sections || []).length} seccions
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded-full border px-3 py-1 text-xs" onClick={onClosePreview}>
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
              disabled={importing || preview.templates.length === 0}
              onClick={onImport}
            >
              {importing ? 'Important...' : 'Importar'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
