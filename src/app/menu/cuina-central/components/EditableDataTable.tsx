'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type ColumnDef<T> = {
  key: keyof T | string
  label: string
  render?: (row: T) => ReactNode
  edit?: 'text' | 'number' | 'readonly'
}

type Props<T extends { id: string }> = {
  rows: T[]
  columns: ColumnDef<T>[]
  onChange: (id: string, patch: Partial<T>) => void
  onSave: (row: T) => Promise<void>
  onDelete: (id: string) => Promise<void>
  emptyLabel?: string
}

export default function EditableDataTable<T extends { id: string }>({
  rows,
  columns,
  onChange,
  onSave,
  onDelete,
  emptyLabel = 'Sense registres',
}: Props<T>) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className="px-3 py-2 font-medium">
                {col.label}
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Accions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              {columns.map((col) => {
                const key = col.key as keyof T
                const value = row[key]
                if (col.render) {
                  return (
                    <td key={String(col.key)} className="px-3 py-2">
                      {col.render(row)}
                    </td>
                  )
                }
                if (col.edit === 'readonly') {
                  return (
                    <td key={String(col.key)} className="px-3 py-2 text-slate-600">
                      {String(value ?? '')}
                    </td>
                  )
                }
                return (
                  <td key={String(col.key)} className="px-3 py-2">
                    <Input
                      className="h-8 min-w-[7rem]"
                      type={col.edit === 'number' ? 'number' : 'text'}
                      value={String(value ?? '')}
                      onChange={(e) => {
                        const raw = e.target.value
                        onChange(row.id, {
                          [key]: col.edit === 'number' ? Number(raw) : raw,
                        } as Partial<T>)
                      }}
                    />
                  </td>
                )
              })}
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => void onSave(row)}>
                    Desar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => void onDelete(row.id)}
                  >
                    Esborrar
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
