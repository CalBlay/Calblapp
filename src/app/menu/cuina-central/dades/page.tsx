'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Factory } from 'lucide-react'
import type {
  CuinaCentralArticle,
  CuinaCentralMachine,
  CuinaCentralMachineArticleRate,
  CuinaCentralShift,
} from '@/lib/cuina-central/types'
import ExcelImportButton from '../components/ExcelImportButton'
import EditableDataTable from '../components/EditableDataTable'
import { MachineMaintenanceTicketButton } from '../components/CuinaCentralMaintenanceTicket'

type Tab = 'articles' | 'machines' | 'shifts' | 'rates'

export default function CuinaCentralDadesPage() {
  const [tab, setTab] = useState<Tab>('articles')
  const [status, setStatus] = useState('')
  const [articles, setArticles] = useState<CuinaCentralArticle[]>([])
  const [machines, setMachines] = useState<CuinaCentralMachine[]>([])
  const [shifts, setShifts] = useState<CuinaCentralShift[]>([])
  const [rates, setRates] = useState<CuinaCentralMachineArticleRate[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [a, m, s, r] = await Promise.all([
        fetch('/api/cuina-central/articles', { cache: 'no-store' }).then((res) => res.json()),
        fetch('/api/cuina-central/machines', { cache: 'no-store' }).then((res) => res.json()),
        fetch('/api/cuina-central/shifts', { cache: 'no-store' }).then((res) => res.json()),
        fetch('/api/cuina-central/rates', { cache: 'no-store' }).then((res) => res.json()),
      ])
      setArticles(Array.isArray(a?.articles) ? a.articles : [])
      setMachines(Array.isArray(m?.machines) ? m.machines : [])
      setShifts(Array.isArray(s?.shifts) ? s.shifts : [])
      setRates(Array.isArray(r?.rates) ? r.rates : [])
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Error carregant dades')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const machineOptions = useMemo(
    () => machines.filter((m) => m.active !== false),
    [machines]
  )
  const articleOptions = useMemo(
    () => articles.filter((a) => a.active !== false),
    [articles]
  )

  const [newArticle, setNewArticle] = useState({ code: '', name: '', unit: 'kg', packagingLabel: '' })
  const [newMachine, setNewMachine] = useState({ code: '', name: '', zone: '', location: '' })
  const [newShift, setNewShift] = useState({ code: '', name: '', startTime: '06:00', endTime: '14:00' })
  const [newRate, setNewRate] = useState({ machineId: '', articleId: '', qtyPerHour: '' })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'articles', label: 'Articles (Bases)' },
    { id: 'machines', label: 'Màquines' },
    { id: 'shifts', label: 'Torns producció' },
    { id: 'rates', label: 'Rendiment teòric' },
  ]

  return (
    <div>
      <ModuleHeader
        title="Cuina central · Dades"
        subtitle="Importació, mestres editables i rendiments teòrics per màquina (només administradors)."
        icon={<Factory className="h-5 w-5 text-slate-700" aria-hidden />}
      />

      {status ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {status}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? 'default' : 'outline'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => void loadAll()}>
          Actualitzar
        </Button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Carregant…</p> : null}

      {tab === 'articles' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ExcelImportButton entity="articles" onDone={setStatus} />
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Codi"
                className="h-8 w-28"
                value={newArticle.code}
                onChange={(e) => setNewArticle((s) => ({ ...s, code: e.target.value }))}
              />
              <Input
                placeholder="Nom"
                className="h-8 w-48"
                value={newArticle.name}
                onChange={(e) => setNewArticle((s) => ({ ...s, name: e.target.value }))}
              />
              <Input
                placeholder="Unitat"
                className="h-8 w-24"
                value={newArticle.unit}
                onChange={(e) => setNewArticle((s) => ({ ...s, unit: e.target.value }))}
              />
              <Input
                placeholder="Embalatge"
                className="h-8 w-32"
                value={newArticle.packagingLabel}
                onChange={(e) => setNewArticle((s) => ({ ...s, packagingLabel: e.target.value }))}
              />
              <Button
                size="sm"
                onClick={async () => {
                  const res = await fetch('/api/cuina-central/articles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newArticle),
                  })
                  const json = await res.json()
                  if (!res.ok) return setStatus(json?.error || 'Error')
                  setNewArticle({ code: '', name: '', unit: 'kg', packagingLabel: '' })
                  setStatus('Article creat')
                  await loadAll()
                }}
              >
                Afegir
              </Button>
            </div>
          </div>
          <EditableDataTable
            rows={articles}
            columns={[
              { key: 'code', label: 'Codi', edit: 'text' },
              { key: 'name', label: 'Nom', edit: 'text' },
              { key: 'unit', label: 'Unitat', edit: 'text' },
              { key: 'packagingLabel', label: 'Embalatge', edit: 'text' },
            ]}
            onChange={(id, patch) =>
              setArticles((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
            }
            onSave={async (row) => {
              await fetch(`/api/cuina-central/articles/${row.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(row),
              })
              setStatus('Article desat')
            }}
            onDelete={async (id) => {
              await fetch(`/api/cuina-central/articles/${id}`, { method: 'DELETE' })
              setStatus('Article esborrat')
              await loadAll()
            }}
          />
        </section>
      ) : null}

      {tab === 'machines' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ExcelImportButton entity="machines" onDone={setStatus} />
            <Input placeholder="Codi" className="h-8 w-28" value={newMachine.code} onChange={(e) => setNewMachine((s) => ({ ...s, code: e.target.value }))} />
            <Input placeholder="Nom" className="h-8 w-40" value={newMachine.name} onChange={(e) => setNewMachine((s) => ({ ...s, name: e.target.value }))} />
            <Input placeholder="Zona" className="h-8 w-28" value={newMachine.zone} onChange={(e) => setNewMachine((s) => ({ ...s, zone: e.target.value }))} />
            <Input placeholder="Ubicació" className="h-8 w-36" value={newMachine.location} onChange={(e) => setNewMachine((s) => ({ ...s, location: e.target.value }))} />
            <Button
              size="sm"
              onClick={async () => {
                const res = await fetch('/api/cuina-central/machines', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newMachine),
                })
                const json = await res.json()
                if (!res.ok) return setStatus(json?.error || 'Error')
                setNewMachine({ code: '', name: '', zone: '', location: '' })
                setStatus('Màquina creada')
                await loadAll()
              }}
            >
              Afegir
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {machines.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                style={
                  m.mapX != null && m.mapY != null
                    ? { gridColumn: 'span 1' }
                    : undefined
                }
              >
                <p className="font-medium text-slate-900">{m.code}</p>
                <p className="text-sm text-slate-600">{m.name}</p>
                <p className="text-xs text-slate-500">
                  {m.zone || '—'} · {m.location || '—'}
                </p>
              </div>
            ))}
          </div>
          <EditableDataTable
            rows={machines}
            columns={[
              { key: 'code', label: 'Codi', edit: 'text' },
              { key: 'name', label: 'Nom', edit: 'text' },
              { key: 'zone', label: 'Zona', edit: 'text' },
              { key: 'location', label: 'Ubicació', edit: 'text' },
              { key: 'mapX', label: 'Map X', edit: 'number' },
              { key: 'mapY', label: 'Map Y', edit: 'number' },
              {
                key: 'id',
                label: 'Manteniment',
                edit: 'readonly',
                render: (row) => <MachineMaintenanceTicketButton machine={row} />,
              },
            ]}
            onChange={(id, patch) =>
              setMachines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
            }
            onSave={async (row) => {
              await fetch(`/api/cuina-central/machines/${row.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(row),
              })
              setStatus('Màquina desada')
            }}
            onDelete={async (id) => {
              await fetch(`/api/cuina-central/machines/${id}`, { method: 'DELETE' })
              await loadAll()
            }}
          />
        </section>
      ) : null}

      {tab === 'shifts' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ExcelImportButton entity="shifts" onDone={setStatus} />
            <Input className="h-8 w-24" placeholder="Codi" value={newShift.code} onChange={(e) => setNewShift((s) => ({ ...s, code: e.target.value }))} />
            <Input className="h-8 w-36" placeholder="Nom" value={newShift.name} onChange={(e) => setNewShift((s) => ({ ...s, name: e.target.value }))} />
            <Input className="h-8 w-24" placeholder="Inici" value={newShift.startTime} onChange={(e) => setNewShift((s) => ({ ...s, startTime: e.target.value }))} />
            <Input className="h-8 w-24" placeholder="Fi" value={newShift.endTime} onChange={(e) => setNewShift((s) => ({ ...s, endTime: e.target.value }))} />
            <Button
              size="sm"
              onClick={async () => {
                const res = await fetch('/api/cuina-central/shifts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newShift),
                })
                const json = await res.json()
                if (!res.ok) return setStatus(json?.error || 'Error')
                setNewShift({ code: '', name: '', startTime: '06:00', endTime: '14:00' })
                await loadAll()
              }}
            >
              Afegir torn
            </Button>
          </div>
          <EditableDataTable
            rows={shifts}
            columns={[
              { key: 'code', label: 'Codi', edit: 'text' },
              { key: 'name', label: 'Nom', edit: 'text' },
              { key: 'startTime', label: 'Inici', edit: 'text' },
              { key: 'endTime', label: 'Fi', edit: 'text' },
              { key: 'durationMinutes', label: 'Minuts', edit: 'readonly' },
            ]}
            onChange={(id, patch) =>
              setShifts((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
            }
            onSave={async (row) => {
              await fetch(`/api/cuina-central/shifts/${row.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(row),
              })
              setStatus('Torn desat')
              await loadAll()
            }}
            onDelete={async (id) => {
              await fetch(`/api/cuina-central/shifts/${id}`, { method: 'DELETE' })
              await loadAll()
            }}
          />
        </section>
      ) : null}

      {tab === 'rates' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <ExcelImportButton entity="rates" onDone={setStatus} />
            <select
              className="h-8 rounded-md border border-slate-200 px-2 text-sm"
              value={newRate.machineId}
              onChange={(e) => setNewRate((s) => ({ ...s, machineId: e.target.value }))}
            >
              <option value="">Màquina</option>
              {machineOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.name}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-slate-200 px-2 text-sm"
              value={newRate.articleId}
              onChange={(e) => setNewRate((s) => ({ ...s, articleId: e.target.value }))}
            >
              <option value="">Article</option>
              {articleOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <Input
              className="h-8 w-28"
              placeholder="Qty/h"
              value={newRate.qtyPerHour}
              onChange={(e) => setNewRate((s) => ({ ...s, qtyPerHour: e.target.value }))}
            />
            <Button
              size="sm"
              onClick={async () => {
                const machine = machineOptions.find((m) => m.id === newRate.machineId)
                const article = articleOptions.find((a) => a.id === newRate.articleId)
                if (!machine || !article) return setStatus('Selecciona màquina i article')
                const res = await fetch('/api/cuina-central/rates', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    machineId: machine.id,
                    machineCode: machine.code,
                    machineName: machine.name,
                    articleId: article.id,
                    articleCode: article.code,
                    articleName: article.name,
                    unit: article.unit,
                    qtyPerHour: Number(newRate.qtyPerHour),
                  }),
                })
                const json = await res.json()
                if (!res.ok) return setStatus(json?.error || 'Error')
                setNewRate({ machineId: '', articleId: '', qtyPerHour: '' })
                await loadAll()
              }}
            >
              Afegir rendiment
            </Button>
          </div>
          <EditableDataTable
            rows={rates}
            columns={[
              { key: 'machineCode', label: 'Màquina', edit: 'readonly' },
              { key: 'articleCode', label: 'Article', edit: 'readonly' },
              { key: 'qtyPerHour', label: 'Qty/h', edit: 'number' },
              { key: 'unit', label: 'Unitat', edit: 'readonly' },
            ]}
            onChange={(id, patch) =>
              setRates((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
            }
            onSave={async (row) => {
              await fetch(`/api/cuina-central/rates/${row.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qtyPerHour: row.qtyPerHour }),
              })
              setStatus('Rendiment desat')
            }}
            onDelete={async (id) => {
              await fetch(`/api/cuina-central/rates/${id}`, { method: 'DELETE' })
              await loadAll()
            }}
          />
        </section>
      ) : null}
    </div>
  )
}
