'use client'

import { Button } from '@/components/ui/button'
import type { ImportConflictItem } from '../types'

type Props = {
  conflicts: ImportConflictItem[]
  loading: boolean
  onDeleteConflict: (conflictId: string) => void | Promise<void>
}

export function ImportConflictsPanel({ conflicts, loading, onDeleteConflict }: Props) {
  if (conflicts.length === 0) return null

  return (
    <div className="bg-white border border-rose-200 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Conflictes d'importacio</h2>
          <p className="text-sm text-slate-500">
            Codis no importats o pendents de revisio.
          </p>
        </div>
        <p className="text-sm text-rose-700">{conflicts.length} pendents</p>
      </div>

      <div className="flex flex-col gap-3">
        {conflicts.map(conflict => (
          <div
            key={conflict.id}
            className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {conflict.code || conflict.id}
                </p>
                <p className="text-xs text-slate-500">
                  Motiu: {conflict.reason || 'sense motiu informat'}
                </p>
                {conflict.existingNameCa && (
                  <p className="text-xs text-slate-500">
                    Ja existeix a la base com: {conflict.existingNameCa}
                  </p>
                )}
                {conflict.entries && conflict.entries.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {conflict.entries.map((entry, index) => (
                      <p key={`${conflict.id}-${index}`} className="text-xs text-slate-600">
                        Codi {entry.code || conflict.code || '-'} · {entry.sheet || 'sense full'} ·
                        {' '}fila {entry.row || '-'} · {entry.nameCa || 'sense nom'}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => void onDeleteConflict(conflict.id)}
                disabled={loading}
              >
                Eliminar conflicte
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
