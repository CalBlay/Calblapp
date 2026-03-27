'use client'

import type { SupplierRow } from '../types'
import { typography } from '@/lib/typography'

type SuppliersPanelProps = {
  filteredSuppliers: SupplierRow[]
  supplierForm: {
    id: string
    name: string
    email: string
    phone: string
    specialty: string
    notes: string
    active: boolean
  }
  loading: boolean
  saving: boolean
  onSelectSupplier: (supplier: SupplierRow) => void
  onSupplierFormChange: (updater: (prev: SuppliersPanelProps['supplierForm']) => SuppliersPanelProps['supplierForm']) => void
  onResetSupplier: () => void
  onSaveSupplier: () => void
}

export default function SuppliersPanel({
  filteredSuppliers,
  supplierForm,
  loading,
  saving,
  onSelectSupplier,
  onSupplierFormChange,
  onResetSupplier,
  onSaveSupplier,
}: SuppliersPanelProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className={typography('sectionTitle')}>Llistat de proveidors</div>
        </div>
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
              Carregant proveidors...
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
              Encara no hi ha proveidors desats.
            </div>
          ) : (
            filteredSuppliers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSupplier(item)}
                className="w-full rounded-2xl border px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {[item.email, item.phone, item.specialty].filter(Boolean).join(' / ') || 'Sense dades extra'}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {item.active !== false ? 'Actiu' : 'Inactiu'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className={`mb-3 ${typography('sectionTitle')}`}>
          {supplierForm.id ? 'Editar proveidor' : 'Nou proveidor'}
        </div>
        <div className="grid gap-3">
          <input
            value={supplierForm.name}
            onChange={(e) => onSupplierFormChange((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Nom"
            className="h-11 rounded-2xl border px-4"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={supplierForm.email}
              onChange={(e) => onSupplierFormChange((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email"
              className="h-11 rounded-2xl border px-4"
            />
            <input
              value={supplierForm.phone}
              onChange={(e) => onSupplierFormChange((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Telefon"
              className="h-11 rounded-2xl border px-4"
            />
          </div>
          <input
            value={supplierForm.specialty}
            onChange={(e) => onSupplierFormChange((prev) => ({ ...prev, specialty: e.target.value }))}
            placeholder="Especialitat"
            className="h-11 rounded-2xl border px-4"
          />
          <textarea
            value={supplierForm.notes}
            onChange={(e) => onSupplierFormChange((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Notes"
            className="min-h-[120px] rounded-2xl border px-4 py-3"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={supplierForm.active}
              onChange={(e) => onSupplierFormChange((prev) => ({ ...prev, active: e.target.checked }))}
            />
            Actiu
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onResetSupplier}
              className="min-h-[44px] rounded-full border px-4 text-sm"
            >
              Netejar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onSaveSupplier}
              className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Desant...' : supplierForm.id ? 'Guardar canvis' : 'Crear proveidor'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
