'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FormState, OptionItem } from '../types'

type Props = {
  form: FormState
  families: OptionItem[]
  categories: OptionItem[]
  menuItems: OptionItem[]
  newFamily: string
  newCategory: string
  newMenu: string
  emptySelect: string
  onChange: (key: keyof FormState, value: string | boolean) => void
  onNewFamilyChange: (value: string) => void
  onNewCategoryChange: (value: string) => void
  onNewMenuChange: (value: string) => void
  onToggleMenu: (menuId: string) => void
}

export function ClassificationPanel({
  form,
  families,
  categories,
  menuItems,
  newFamily,
  newCategory,
  newMenu,
  emptySelect,
  onChange,
  onNewFamilyChange,
  onNewCategoryChange,
  onNewMenuChange,
  onToggleMenu,
}: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Classificacio</h2>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Grup</label>
            <Select
              value={form.familyId || ''}
              onValueChange={value =>
                onChange('familyId', value === emptySelect ? '' : value)
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona grup" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={emptySelect}>Sense grup</SelectItem>
                {families.map(fam => (
                  <SelectItem key={fam.id} value={fam.id}>
                    {fam.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Tipus</label>
            <Select
              value={form.categoryId || ''}
              onValueChange={value =>
                onChange('categoryId', value === emptySelect ? '' : value)
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecciona tipus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={emptySelect}>Sense tipus</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Nou grup</label>
            <Input
              className="mt-1"
              value={newFamily}
              onChange={e => onNewFamilyChange(e.target.value)}
              placeholder="Nou grup"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Nou tipus</label>
            <Input
              className="mt-1"
              value={newCategory}
              onChange={e => onNewCategoryChange(e.target.value)}
              placeholder="Nou tipus"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Menus</label>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {menuItems.length > 0 ? (
              menuItems.map(menu => (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => onToggleMenu(menu.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    form.menus.includes(menu.id)
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  {menu.label}
                </button>
              ))
            ) : (
              <p className="text-xs text-slate-500">Encara no hi ha menus registrats.</p>
            )}

            <Input
              className="min-w-[240px] flex-1 max-w-md"
              value={newMenu}
              onChange={e => onNewMenuChange(e.target.value)}
              placeholder="Nou menu (C1, CH2, CELIAC)"
            />
          </div>

          <p className="text-xs text-slate-500 mt-1">
            Selecciona els menus on apareix el plat.
          </p>
        </div>
      </div>
    </div>
  )
}
