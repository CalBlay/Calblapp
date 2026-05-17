'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AllergenItem, AllergenValue, FormState } from '../types'

type Props = {
  form: FormState
  loading: boolean
  allergensSource: 'default' | 'db'
  allergenItems: AllergenItem[]
  customAllergens: AllergenItem[]
  newAllergen: string
  emptySelect: string
  allergenOptions: Array<{ value: AllergenValue | string; label: string }>
  onVeganToggle: (checked: boolean) => void
  onVegetarianChange: (checked: boolean) => void
  onSeedDefaultAllergens: () => void | Promise<void>
  onAllergenChange: (key: string, value: AllergenValue) => void
  onNewAllergenChange: (value: string) => void
  onAddAllergen: () => void | Promise<void>
  onDeleteAllergen: (item: AllergenItem) => void | Promise<void>
}

export function AllergensPanel({
  form,
  loading,
  allergensSource,
  allergenItems,
  customAllergens,
  newAllergen,
  emptySelect,
  allergenOptions,
  onVeganToggle,
  onVegetarianChange,
  onSeedDefaultAllergens,
  onAllergenChange,
  onNewAllergenChange,
  onAddAllergen,
  onDeleteAllergen,
}: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Al.lergens</h2>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm font-medium text-slate-700">Model de consum</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.vegan}
              onChange={e => onVeganToggle(e.target.checked)}
            />
            Vega (activa vegetaria)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.vegetarian}
              disabled={form.vegan}
              onChange={e => onVegetarianChange(e.target.checked)}
            />
            Vegetaria
          </label>
        </div>
      </div>

      {allergensSource === 'default' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Llista base carregada. Pots guardar-la a Firestore per poder editar-la.
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void onSeedDefaultAllergens()}
            disabled={loading}
          >
            Guardar allergens base
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        {allergenItems.map(allergen => (
          <div key={allergen.key}>
            <label className="text-sm font-medium text-slate-700">{allergen.label}</label>
            <Select
              value={form.allergens[allergen.key] || emptySelect}
              onValueChange={value =>
                onAllergenChange(
                  allergen.key,
                  (value === emptySelect ? '' : value) as AllergenValue
                )
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {allergenOptions.map(option => (
                  <SelectItem key={option.label} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          value={newAllergen}
          onChange={e => onNewAllergenChange(e.target.value)}
          placeholder="Nou allergen"
        />
        <Button variant="secondary" onClick={() => void onAddAllergen()} disabled={loading}>
          Afegir allergen
        </Button>
      </div>

      {customAllergens.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">
            Allergens personalitzats
          </p>
          <div className="flex flex-wrap gap-2">
            {customAllergens.map(item => (
              <Button
                key={item.key}
                variant="destructive"
                className="h-7 px-3 text-xs"
                onClick={() => void onDeleteAllergen(item)}
                disabled={loading}
              >
                Elimina {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
