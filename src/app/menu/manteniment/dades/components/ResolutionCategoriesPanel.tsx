'use client'

import { Trash2 } from 'lucide-react'
import { typography } from '@/lib/typography'
import type { ResolutionCategoryRow } from '../types'

type ResolutionCategoriesPanelProps = {
  filteredCategories: ResolutionCategoryRow[]
  categoryForm: {
    id: string
    name: string
    active: boolean
  }
  loading: boolean
  saving: boolean
  onSelectCategory: (category: ResolutionCategoryRow) => void
  onCategoryFormChange: (
    updater: (
      prev: ResolutionCategoriesPanelProps['categoryForm']
    ) => ResolutionCategoriesPanelProps['categoryForm']
  ) => void
  onSaveCategory: () => void
  onDeleteCategory: () => void
}

export default function ResolutionCategoriesPanel({
  filteredCategories,
  categoryForm,
  loading,
  saving,
  onSelectCategory,
  onCategoryFormChange,
  onSaveCategory,
  onDeleteCategory,
}: ResolutionCategoriesPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-2xl border bg-white p-4">
        <div className={`mb-3 ${typography('sectionTitle')}`}>Llistat de categories</div>
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
              Carregant categories...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
              Encara no hi ha categories de resolució desades.
            </div>
          ) : (
            filteredCategories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectCategory(item)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left hover:bg-slate-50"
              >
                <div>
                  <div className="font-semibold text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">Categoria de tancament o resolució</div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.active !== false ? 'Activa' : 'Inactiva'}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className={`mb-3 ${typography('sectionTitle')}`}>
          {categoryForm.id ? 'Editar categoria' : 'Nova categoria'}
        </div>
        <div className="grid gap-3">
          <input
            value={categoryForm.name}
            onChange={(e) => onCategoryFormChange((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Ex.: Consulta tancada"
            className="h-11 rounded-2xl border px-4"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={categoryForm.active}
              onChange={(e) => onCategoryFormChange((prev) => ({ ...prev, active: e.target.checked }))}
            />
            Activa
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            {categoryForm.id ? (
              <button
                type="button"
                onClick={onDeleteCategory}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-red-300 px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
                aria-label="Eliminar categoria"
                title="Eliminar categoria"
              >
                <Trash2 className="h-4 w-4" />
                <span>Eliminar</span>
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={onSaveCategory}
              className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Desant...' : categoryForm.id ? 'Guardar canvis' : 'Crear categoria'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
