'use client'

import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTransportTypes } from '@/hooks/useTransportTypes'
import type { TransportTypeDefinition } from '@/lib/transportTypes'

type EditableType = {
  label: string
  sortOrder: string
  serviceIntervalKm: string
  active: boolean
  requiresLargeTruckLicense: boolean
  refrigeratedByDefault: boolean
  tachographRequired: boolean
}

function editableFrom(type: TransportTypeDefinition): EditableType {
  return {
    label: type.label,
    sortOrder: String(type.sortOrder),
    serviceIntervalKm: String(type.serviceIntervalKm),
    active: type.active,
    requiresLargeTruckLicense: type.requiresLargeTruckLicense,
    refrigeratedByDefault: type.refrigeratedByDefault,
    tachographRequired: type.tachographRequired,
  }
}

function slugFromLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48)
}

function Characteristics({
  value,
  onChange,
}: {
  value: EditableType
  onChange: (next: EditableType) => void
}) {
  const options: Array<{ key: keyof EditableType; label: string; help: string }> = [
    {
      key: 'requiresLargeTruckLicense',
      label: 'Camió gran',
      help: 'Requereix conductor habilitat per a camió gran.',
    },
    {
      key: 'refrigeratedByDefault',
      label: 'Fred per defecte',
      help: 'Els vehicles nous d’aquest tipus es marquen com a refrigerats.',
    },
    {
      key: 'tachographRequired',
      label: 'Revisió de tacògraf',
      help: 'Mostra l’historial i el venciment biennal del tacògraf.',
    },
  ]

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {options.map((option) => (
        <label
          key={option.key}
          className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 p-2"
        >
          <span>
            <span className="block text-sm font-medium text-slate-700">{option.label}</span>
            <span className="block text-[11px] leading-4 text-slate-500">{option.help}</span>
          </span>
          <Switch
            checked={Boolean(value[option.key])}
            onCheckedChange={(checked) => onChange({ ...value, [option.key]: checked })}
          />
        </label>
      ))}
    </div>
  )
}

function TypeEditor({
  type,
  busy,
  onSaved,
  onError,
}: {
  type: TransportTypeDefinition
  busy: boolean
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [form, setForm] = useState<EditableType>(() => editableFrom(type))

  useEffect(() => setForm(editableFrom(type)), [type])

  const save = async () => {
    onError('')
    const response = await fetch(`/api/transport-types/${encodeURIComponent(type.value)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        sortOrder: Number(form.sortOrder),
        serviceIntervalKm: Number(form.serviceIntervalKm),
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(String(body.error || 'No s’ha pogut desar el tipus.'))
    await onSaved()
  }

  const remove = async () => {
    if (!window.confirm(`Vols eliminar el tipus “${type.label}”?`)) return
    onError('')
    const response = await fetch(`/api/transport-types/${encodeURIComponent(type.value)}`, {
      method: 'DELETE',
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(String(body.error || 'No s’ha pogut eliminar el tipus.'))
    await onSaved()
  }

  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`type-label-${type.value}`}>Nom</Label>
          <Input
            id={`type-label-${type.value}`}
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
          <span className="block text-[11px] text-slate-400">Codi intern: {type.value}</span>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`type-order-${type.value}`}>Ordre</Label>
          <Input
            id={`type-order-${type.value}`}
            type="number"
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`type-km-${type.value}`}>Interval revisió (km)</Label>
          <Input
            id={`type-km-${type.value}`}
            type="number"
            min="0"
            step="1000"
            value={form.serviceIntervalKm}
            onChange={(event) => setForm({ ...form, serviceIntervalKm: event.target.value })}
          />
        </div>
        <label className="flex h-10 items-center justify-between gap-2 rounded-md border px-3 text-sm">
          Actiu
          <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
        </label>
      </div>

      <Characteristics value={form} onChange={setForm} />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void remove().catch((error) => onError(error instanceof Error ? error.message : 'Error'))}
          className="text-red-600 hover:bg-red-50"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy || !form.label.trim()}
          onClick={() => void save().catch((error) => onError(error instanceof Error ? error.message : 'Error'))}
        >
          <Save className="mr-2 h-4 w-4" />
          Desar
        </Button>
      </div>
    </article>
  )
}

export default function TransportTypesPanel({ onChanged }: { onChanged?: () => void | Promise<unknown> }) {
  const { data: types, loading, error: loadError, refetch } = useTransportTypes(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [codeEdited, setCodeEdited] = useState(false)
  const [newType, setNewType] = useState<EditableType>({
    label: '',
    sortOrder: '999',
    serviceIntervalKm: '20000',
    active: true,
    requiresLargeTruckLicense: false,
    refrigeratedByDefault: false,
    tachographRequired: false,
  })

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/transport-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: newCode || slugFromLabel(newType.label),
          ...newType,
          sortOrder: Number(newType.sortOrder),
          serviceIntervalKm: Number(newType.serviceIntervalKm),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(body.error || 'No s’ha pogut crear el tipus.'))
      setNewCode('')
      setCodeEdited(false)
      setNewType({
        label: '',
        sortOrder: '999',
        serviceIntervalKm: '20000',
        active: true,
        requiresLargeTruckLicense: false,
        refrigeratedByDefault: false,
        tachographRequired: false,
      })
      await refetch()
      await onChanged?.()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Error creant el tipus.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div>
          <h2 className="font-semibold text-slate-900">Nou tipus de vehicle</h2>
          <p className="mt-1 text-sm text-slate-500">
            Defineix el nom i les característiques que activaran els camps corresponents a la fitxa.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="new-type-label">Nom</Label>
            <Input
              id="new-type-label"
              value={newType.label}
              onChange={(event) => {
                const label = event.target.value
                setNewType({ ...newType, label })
                if (!codeEdited) setNewCode(slugFromLabel(label))
              }}
              placeholder="Ex: Camió rígid"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-type-code">Codi intern</Label>
            <Input
              id="new-type-code"
              value={newCode}
              onChange={(event) => {
                setCodeEdited(true)
                setNewCode(event.target.value)
              }}
              placeholder="camio-rigid"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-type-km">Interval revisió (km)</Label>
            <Input
              id="new-type-km"
              type="number"
              min="0"
              step="1000"
              value={newType.serviceIntervalKm}
              onChange={(event) => setNewType({ ...newType, serviceIntervalKm: event.target.value })}
            />
          </div>
        </div>
        <Characteristics value={newType} onChange={setNewType} />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            disabled={creating || !newType.label.trim() || !newCode.trim()}
            onClick={() => void create()}
          >
            <Plus className="mr-2 h-4 w-4" />
            {creating ? 'Creant…' : 'Crear tipus'}
          </Button>
        </div>
      </section>

      {error || loadError ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error || loadError}
        </p>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Tipus configurats</h2>
          <p className="text-sm text-slate-500">
            Els tipus inactius es conserven als vehicles existents però no apareixen en noves altes.
          </p>
        </div>
        {loading ? <p className="text-sm text-slate-500">Carregant tipologies…</p> : null}
        {types.map((type) => (
          <TypeEditor
            key={type.value}
            type={type}
            busy={creating}
            onSaved={async () => {
              await refetch()
              await onChanged?.()
            }}
            onError={setError}
          />
        ))}
      </section>
    </div>
  )
}
