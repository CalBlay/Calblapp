'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { SPACES_PREMISSES_PATH } from '@/lib/spacesPermissions'
import SpacesSectionGate from '../SpacesSectionGate'
import {
  DEFAULT_SPACES_HEADER_RULE,
  parseSpacesManualDateInput,
  type SpacesHeaderMetricMode,
  type SpacesHeaderRuleConfig,
  type SpacesHeaderStage,
} from '@/lib/spacesHeaderRule'

const STAGE_OPTIONS: Array<{ value: SpacesHeaderStage; label: string }> = [
  { value: 'verd', label: 'Confirmats' },
  { value: 'taronja', label: 'Prereserva / Calentet' },
  { value: 'groc', label: 'Pressupost enviat' },
]

export default function SpacesPremissesPage() {
  const router = useRouter()
  const { status } = useSession()
  const { ready: permsReady, canEditPath } = useUiPermissions()
  const canPremisses = !permsReady || canEditPath(SPACES_PREMISSES_PATH)

  const [config, setConfig] = useState<SpacesHeaderRuleConfig>(
    DEFAULT_SPACES_HEADER_RULE
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [manualDate, setManualDate] = useState('')
  const [manualReason, setManualReason] = useState('')
  const parsedManualDate = parseSpacesManualDateInput(manualDate)

  useEffect(() => {
    if (status !== 'authenticated') return
    if (permsReady && !canPremisses) {
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
          throw new Error(
            String(json?.error || 'No s ha pogut carregar la configuracio')
          )
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
  }, [permsReady, canPremisses, router, status])

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
        throw new Error(
          String(json?.error || 'No s ha pogut desar la configuracio')
        )
      }
      setConfig(json?.config || config)
      setSuccess('Premisses desades correctament.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant configuracio')
    } finally {
      setSaving(false)
    }
  }

  const toggleStage = (stage: SpacesHeaderStage) => {
    setConfig((prev) => {
      const exists = prev.stages.includes(stage)
      return {
        ...prev,
        stages: exists
          ? prev.stages.filter((value) => value !== stage)
          : [...prev.stages, stage],
      }
    })
  }

  const addManualDate = () => {
    const reason = manualReason.trim()
    if (!parsedManualDate || !reason) return
    setConfig((prev) => ({
      ...prev,
      manualHighlights: [
        ...prev.manualHighlights.filter((item) => item.date !== parsedManualDate),
        { date: parsedManualDate, reason },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    setManualDate('')
    setManualReason('')
    setSuccess(null)
  }

  const removeManualDate = (date: string) => {
    setConfig((prev) => ({
      ...prev,
      manualHighlights: prev.manualHighlights.filter(
        (item) => item.date !== date
      ),
    }))
    setSuccess(null)
  }

  if (status === 'loading') {
    return <div className="p-6 text-sm text-slate-500">Carregant...</div>
  }

  if (permsReady && !canPremisses) {
    return null
  }

  return (
    <SpacesSectionGate subpath={SPACES_PREMISSES_PATH}>
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
            Regla de capcalera en vermell
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Configura quan els totals diaris de la capcalera de reserves d espais
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
              Activar ressaltat de capcalera
            </label>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Estats a comptar</Label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  {STAGE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={config.stages.includes(option.value)}
                        onChange={() => toggleStage(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                  <p className="text-xs text-slate-500">
                    Pots combinar diversos estats alhora.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="spaces-metric-mode">Regla de decisio</Label>
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
                  <option value="pax">Nomes per pax</option>
                  <option value="events">Nomes per numero d events</option>
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

            <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Dies excepcionals en vermell
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Aquestes dates es marcaran en vermell encara que no compleixin
                  la regla automàtica. Cal indicar-ne el motiu.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={manualDate}
                  onChange={(event) => setManualDate(event.target.value)}
                  placeholder="dd/mm/aaaa"
                  maxLength={10}
                  aria-label="Data excepcional"
                  className="bg-white sm:max-w-56"
                />
                <Input
                  type="text"
                  value={manualReason}
                  onChange={(event) => setManualReason(event.target.value)}
                  placeholder="Motiu de l'excepció"
                  maxLength={300}
                  aria-label="Motiu de l'excepció"
                  className="bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addManualDate}
                  disabled={!parsedManualDate || !manualReason.trim()}
                  className="bg-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Afegir dia
                </Button>
              </div>

              {manualDate && !parsedManualDate ? (
                <p className="text-xs font-medium text-red-700" role="alert">
                  Escriu una data vàlida amb el format dd/mm/aaaa.
                </p>
              ) : null}

              {config.manualHighlights.length > 0 ? (
                <div className="divide-y divide-red-100 rounded-lg border border-red-100 bg-white">
                  {config.manualHighlights.map(({ date, reason }) => (
                    <div
                      key={date}
                      className="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize text-slate-700">
                          {new Date(`${date}T12:00:00`).toLocaleDateString('ca-ES', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="mt-0.5 break-words text-xs text-slate-500">
                          {reason}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeManualDate(date)}
                        aria-label={`Eliminar l'excepció del ${date}`}
                        className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No hi ha cap dia excepcional configurat.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Els canvis s'aplicaran quan desis les premisses.
              </p>
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
    </SpacesSectionGate>
  )
}
