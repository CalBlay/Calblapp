'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AuditTemplateDetail } from '@/types/auditoria'

export default function AuditoriaPlantillaViewPage() {
  const params = useParams()
  const templateId = String((params as Record<string, string> | null)?.id || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AuditTemplateDetail | null>(null)

  const load = async () => {
    const res = await fetch(`/api/auditoria/templates/${templateId}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar la plantilla'))
    setData(json as AuditTemplateDetail)
  }

  useEffect(() => {
    if (!templateId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        if (!cancelled) await load()
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error carregant plantilla')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [templateId])

  const weightTotal = useMemo(() => {
    if (!data?.blocks) return 0
    return data.blocks.reduce((sum, b) => sum + (Number(b.weight) || 0), 0)
  }, [data])

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
        <ModuleHeader subtitle="Plantilles" />

        <Card className="space-y-4">
          {loading ? (
            <div className="text-sm text-gray-600">Carregant...</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !data ? (
            <div className="text-sm text-gray-600">Plantilla no trobada.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{data.name}</h2>
                  <div className="text-sm text-gray-600">
                    Departament: {data.department} · Pes total: {weightTotal}%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'text-xs rounded-full px-2 py-1',
                      data.isVisible
                        ? 'bg-cyan-100 text-cyan-700'
                        : data.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700',
                    ].join(' ')}
                  >
                    {data.isVisible ? 'Visible' : data.status === 'active' ? 'Activa' : 'Esborrany'}
                  </span>
                  <Link href={`/menu/auditoria/plantilles/${data.id}/editar`}>
                    <Button variant="outline">Editar plantilla</Button>
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                {data.blocks.map((block) => (
                  <div key={block.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">{block.title}</div>
                      <div className="text-sm text-gray-600">
                        Pes: {block.weight}% · {(block.itemWeightMode || 'equal') === 'manual' ? 'Manual' : 'Automatic'}
                      </div>
                    </div>
                    <ul className="mt-2 text-sm text-gray-700 list-disc list-inside space-y-1">
                      {block.items.map((item) => (
                        <li key={item.id}>
                          {item.label}{' '}
                          <span className="text-gray-500">
                            ({item.type}
                            {(block.itemWeightMode || 'equal') === 'manual' ? ` · ${Number(item.weight || 0)}%` : ''}
                            )
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </RoleGuard>
  )
}
