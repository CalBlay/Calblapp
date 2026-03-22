'use client'

import { useEffect, useMemo, useState } from 'react'
import { withAdmin } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Images, RefreshCw, Trash2 } from 'lucide-react'

type MediaSource = 'incidents' | 'maintenance' | 'messaging' | 'audits' | 'spaces'

type MediaItem = {
  id: string
  path: string
  url: string | null
  createdAt: number
  size: number | null
  type: string | null
  sourceKinds: MediaSource[]
  referenceCount: number
  title: string
}

const SOURCE_LABELS: Record<MediaSource, string> = {
  incidents: 'Incidencies',
  maintenance: 'Manteniment',
  messaging: 'Missatgeria',
  audits: 'Auditories',
  spaces: 'Espais',
}

function formatDate(value: number) {
  if (!value) return 'Sense data'
  return new Intl.DateTimeFormat('ca-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return 'Sense mida'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'all' | MediaSource>('all')
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  const loadMedia = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    if (mode === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const res = await fetch('/api/media', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No s han pogut carregar les imatges')
      setItems(Array.isArray(json?.media) ? json.media : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error carregant imatges')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadMedia('initial')
  }, [])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return items.filter((item) => {
      if (source !== 'all' && !item.sourceKinds.includes(source)) return false
      if (!normalizedQuery) return true
      const haystack = [
        item.title,
        item.path,
        item.url || '',
        item.sourceKinds.join(' '),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [items, query, source])

  const totalBytes = useMemo(
    () => filteredItems.reduce((acc, item) => acc + Number(item.size || 0), 0),
    [filteredItems]
  )

  const handleDelete = async (item: MediaItem) => {
    const confirmed = window.confirm(
      `Vols eliminar aquesta imatge?\n\n${item.path}\n\nAixo esborrara el fitxer i totes les referencies internes.`
    )
    if (!confirmed) return

    try {
      setDeletingPath(item.path)
      const res = await fetch('/api/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No s ha pogut eliminar la imatge')
      setItems((current) => current.filter((entry) => entry.path !== item.path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminant la imatge')
    } finally {
      setDeletingPath(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <ModuleHeader
        icon={<Images className="w-7 h-7 text-slate-700" />}
        title="Gestio d'Imatges"
        subtitle="Llistat centralitzat d'imatges de Storage amb eliminacio segura"
        mainHref="/menu/media"
        actions={
          <Button
            variant="outline"
            onClick={() => void loadMedia('refresh')}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualitzar
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Imatges</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{filteredItems.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Pes total visible</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{formatSize(totalBytes)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Fonts</div>
          <div className="mt-2 text-sm text-gray-700">
            Incidencies, manteniment, missatgeria, auditories i espais
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar per titol, path o URL"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as 'all' | MediaSource)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="all">Totes les fonts</option>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Carregant imatges...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-sm text-gray-500">No s'han trobat imatges amb aquest filtre.</div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[120px_1fr_auto]"
              >
                <div className="overflow-hidden rounded-lg bg-gray-100">
                  {item.url ? (
                    <img
                      src={item.url}
                      alt={item.title || 'Imatge'}
                      className="h-[120px] w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-[120px] items-center justify-center text-xs text-gray-400">
                      Sense preview
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="font-semibold text-gray-900">{item.title || 'Imatge sense titol'}</div>
                  <div className="text-xs text-gray-500">{formatDate(item.createdAt)}</div>
                  <div className="flex flex-wrap gap-2">
                    {item.sourceKinds.map((sourceKey) => (
                      <span
                        key={`${item.id}-${sourceKey}`}
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                      >
                        {SOURCE_LABELS[sourceKey]}
                      </span>
                    ))}
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      {item.referenceCount} referencia{item.referenceCount === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                      {formatSize(item.size)}
                    </span>
                  </div>
                  <div className="break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">
                    {item.path}
                  </div>
                </div>

                <div className="flex items-start">
                  <Button
                    variant="destructive"
                    onClick={() => void handleDelete(item)}
                    disabled={deletingPath === item.path}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deletingPath === item.path ? 'Eliminant...' : 'Eliminar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default withAdmin(MediaPage)
