'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeRole } from '@/lib/roles'
import {
  DEFAULT_SPACES_HEADER_RULE,
  type SpacesHeaderMetricMode,
  type SpacesHeaderRuleConfig,
  type SpacesHeaderStageScope,
} from '@/lib/spacesHeaderRule'

type SessionUser = {
  role?: string
}

export default function SpacesPremissesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const role = normalizeRole(
    String((session?.user as SessionUser | undefined)?.role || '')
  )

  const [config, setConfig] = useState<SpacesHeaderRuleConfig>(
    DEFAULT_SPACES_HEADER_RULE
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    if (role !== 'admin') {
      router.replace('/menu/spaces/reserves')
      return
    }

    let cancelled = false

    const loadConfig = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/spaces/header-rule', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(String(json?.error || 'No s ha pogut carregar la configuracio'))
        }
        if (!cancelled) {
          setConfig(json?.config || DEFAULT_SPACES_HEADER_RULE)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Error carregant configuracio'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadConfig()
    return () => {
      cancelled = true
    }
  }, [role, router, status])

  const saveConfig = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/spaces/header-rule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(String(json?.error || 'No s ha pogut desar la configuracio'))
      }
      setConfig(json?.config || config)
      setSuccess('Premisses desades correctament.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant configuracio')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <div className="p-6 text-sm text-slate-500">Carregant...</div>
  }

  if (role !== 'admin') {
    return null
  }

  return (
    <main className="space-y-6 px-4 pb-12">
      <ModuleHeader
        title="Espais"
        subtitle="Premisses"
        actions={
          <Link
            href="/menu/spaces/reserves"
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tornar
          </Link>
        }
      />

      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Regla de capçalera en vermell
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Configura quan els totals diaris de la capçalera de reserves d espais
            s han de destacar en vermell.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        {loading ? (
          <div className="py-6 text-sm text-slate-500">Carregant premisses...</div>
        ) : (
          <div className="space-y-6">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              Activar ressaltat de capçalera
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="spaces-stage-scope">Comptar sobre</Label>
                <select
                  id="spaces-stage-scope"
                  value={config.stageScope}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      stageScope: event.target.value as SpacesHeaderStageScope,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="confirmed">Només confirmats</option>
                  <option value="all">Tots els estats</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="spaces-metric-mode">Regla de decisió</Label>
                <select
                  id="spaces-metric-mode"
                  value={config.metricMode}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      metricMode: event.target.value as SpacesHeaderMetricMode,
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="pax">Només per pax</option>
                  <option value="events">Només per numero d events</option>
                  <option value="either">Per pax o per events</option>
                  <option value="both">Per pax i per events</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="spaces-pax-threshold">Llindar de pax</Label>
                <Input
                  id="spaces-pax-threshold"
                  type="number"
                  min="0"
                  value={config.paxThreshold}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      paxThreshold: Math.max(0, Number(event.target.value || 0)),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="spaces-events-threshold">
                  Llindar de numero d events
                </Label>
                <Input
                  id="spaces-events-threshold"
                  type="number"
                  min="0"
                  value={config.eventsThreshold}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      eventsThreshold: Math.max(0, Number(event.target.value || 0)),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveConfig} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Desant...' : 'Desar premisses'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
