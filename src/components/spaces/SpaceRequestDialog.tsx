'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Loader2, MessageCircle, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

type SpaceOption = { id: string; nom: string; code?: string }

type Props = {
  spaces: SpaceOption[]
  triggerClassName?: string
}

export default function SpaceRequestDialog({ spaces, triggerClassName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'new' | 'update'>('update')
  const [spaceId, setSpaceId] = useState('')
  const [requestedName, setRequestedName] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdUrl, setCreatedUrl] = useState('')

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, submitting])

  const reset = () => {
    setType('update')
    setSpaceId('')
    setRequestedName('')
    setSubject('')
    setDescription('')
    setError('')
    setCreatedUrl('')
  }

  const close = () => {
    if (submitting) return
    setOpen(false)
    reset()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const selected = spaces.find((space) => space.id === spaceId)
      const response = await fetch('/api/spaces/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          spaceId: type === 'update' ? spaceId : undefined,
          spaceName: selected?.nom,
          requestedName: type === 'new' ? requestedName : undefined,
          subject,
          description,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`)
      setCreatedUrl(String(payload?.url || '/menu/missatgeria'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No s'ha pogut enviar la petició.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ||
          'rounded-full p-2 text-amber-700 transition hover:bg-amber-50 hover:text-amber-800'
        }
        title="Sol·licitar alta o modificació d'un espai"
        aria-label="Sol·licitar alta o modificació d'un espai"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="space-request-title"
            className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="space-request-title" className="text-lg font-semibold text-slate-900">
                  Petició d&apos;espais
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  La petició arribarà als gestors d&apos;Espais mitjançant Ops.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Tancar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createdUrl ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  Petició enviada correctament. Ja tens disponible la seva conversa privada a Ops.
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-sm text-slate-600">
                    Tancar
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(createdUrl)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Obrir a Ops <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                  {(['update', 'new'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        type === value ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {value === 'update' ? 'Modificar espai' : 'Espai nou'}
                    </button>
                  ))}
                </div>

                {type === 'update' ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Espai
                    <select
                      required
                      value={spaceId}
                      onChange={(event) => setSpaceId(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Selecciona un espai</option>
                      {spaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {[space.code, space.nom].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block text-sm font-medium text-slate-700">
                    Nom proposat
                    <input
                      required
                      value={requestedName}
                      onChange={(event) => setRequestedName(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder="Nom del nou espai"
                    />
                  </label>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  Assumpte
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    placeholder="Resum breu (opcional)"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Què necessites?
                  <textarea
                    required
                    minLength={5}
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    placeholder="Descriu l'alta o els canvis que proposes..."
                  />
                </label>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-sm text-slate-600">
                    Cancel·lar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    Enviar petició
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  )
}
