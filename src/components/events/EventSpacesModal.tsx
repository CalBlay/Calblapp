'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, Home, X, ExternalLink, FileText, ChevronRight } from 'lucide-react'

import { db } from '@/lib/firebaseClient'
import { doc, getDoc } from 'firebase/firestore'
import EventDocumentsSheet from '@/components/events/EventDocumentsSheet'

/**
 * EventSpacesModal
 * -----------------
 * Modal de CONSULTA (read-only)
 * Mateix quadrant «Informació de producció» que `SpaceDetailClient` (office + aperitiu + observacions).
 */

/* ================= Tipus (alineats amb SpaceDetailClient) ================= */

interface Props {
  open: boolean
  onClose: () => void
  fincaId: string | null
  eventSummary?: string
  /** Per obrir documents de l’esdeveniment des del modal */
  eventId?: string | null
  eventCode?: string | null
}

type ProduccioRecord = Record<string, unknown>

interface FincaData {
  id: string
  nom?: string
  ln?: string
  produccio?: ProduccioRecord
}

/** Claus principals de producció (mateixes que `SpaceDetailClient`) */
const PRODUCCIO_BASE_KEYS = [
  'office',
  'oficina',
  'aperitiu',
  'observacions',
  'fitxaUrl',
  'images',
  'updatedAt',
] as const

/* ================= Utils ================= */

function linesFromField(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((x) => String(x))
  if (typeof val === 'string' && val.trim()) return [val]
  return []
}

function officeLines(produccio: ProduccioRecord): string[] {
  const fromOffice = produccio.office
  const fromOficina = produccio.oficina
  const merged = linesFromField(fromOffice ?? fromOficina)
  return merged
}

function observacionsText(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (Array.isArray(val)) return val.map(String).join('\n')
  return String(val)
}

function sideSectionKeys(produccio: ProduccioRecord): string[] {
  const base = new Set<string>(PRODUCCIO_BASE_KEYS as unknown as string[])
  return Object.keys(produccio).filter((k) => !base.has(k))
}

function sideSectionBody(produccio: ProduccioRecord, key: string): string {
  const val = produccio[key]
  if (Array.isArray(val)) return val.join('\n')
  if (typeof val === 'string') return val
  return ''
}

function hasText(s: string): boolean {
  return Boolean(s && String(s).trim())
}

/* ================= Component ================= */

export default function EventSpacesModal({
  open,
  onClose,
  fincaId,
  eventSummary,
  eventId,
  eventCode,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [finca, setFinca] = useState<FincaData | null>(null)
  const [docsOpen, setDocsOpen] = useState(false)

  useEffect(() => {
    if (!open || !fincaId) return

    const load = async () => {
      try {
        setLoading(true)
        const ref = doc(db, 'finques', fincaId)
        const snap = await getDoc(ref)

        if (snap.exists()) {
          setFinca({ id: snap.id, ...(snap.data() as any) })
        } else {
          setFinca(null)
        }
      } catch (err) {
        console.error('❌ Error carregant espai:', err)
        setFinca(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [open, fincaId])

  useEffect(() => {
    if (!open) setDocsOpen(false)
  }, [open])

  const produccio = useMemo<ProduccioRecord>(() => {
    const p = finca?.produccio
    return p && typeof p === 'object' ? (p as ProduccioRecord) : {}
  }, [finca])

  const officeText = useMemo(() => officeLines(produccio).join('\n'), [produccio])
  const aperitiuText = useMemo(
    () => linesFromField(produccio.aperitiu).join('\n'),
    [produccio]
  )
  const obsText = useMemo(() => observacionsText(produccio.observacions), [produccio])

  const extraKeys = useMemo(() => sideSectionKeys(produccio), [produccio])
  const extraKeysWithContent = useMemo(
    () => extraKeys.filter((k) => hasText(sideSectionBody(produccio, k))),
    [extraKeys, produccio]
  )

  const hasOffice = hasText(officeText)
  const hasAperitiu = hasText(aperitiuText)
  const hasObs = hasText(obsText)
  const mainAllEmpty = !hasOffice && !hasAperitiu && !hasObs
  const showMainEmptyMessage = mainAllEmpty && extraKeysWithContent.length === 0
  const showMainGrid = !mainAllEmpty

  const openFullSpace = () => {
    if (!finca?.id) return
    window.open(`/menu/spaces/info/${finca.id}`, '_blank', 'noopener,noreferrer')
    onClose()
  }

  const showDocsRow = Boolean(eventId && String(eventId).trim())

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-4xl rounded-2xl p-0 overflow-hidden gap-0 max-h-[min(92dvh,100svh)] flex flex-col">
        {/* ================= Header ================= */}
        <div className="px-4 pt-4 pb-3 sm:px-5 sm:pt-5 relative border-b border-slate-100 shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-start sm:items-center gap-2 pr-12 text-base sm:text-lg">
              <Home className="w-5 h-5 text-slate-700 shrink-0 mt-0.5 sm:mt-0" />
              <span>Espais · Producció</span>
            </DialogTitle>
            <DialogDescription className="text-left break-words">
              {finca?.nom || eventSummary || 'Espai associat a l’esdeveniment'}
              {finca?.ln ? ` · ${finca.ln}` : ''}
            </DialogDescription>
          </DialogHeader>

          <button
            onClick={onClose}
            className="absolute right-3 top-3 sm:right-4 sm:top-4 inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 transition touch-manipulation"
            aria-label="Tancar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= Body ================= */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))] touch-pan-y">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin w-6 h-6 text-gray-500" />
            </div>
          )}

          {!loading && !finca && (
            <p className="text-sm text-gray-500">No s’ha trobat la fitxa d’aquest espai.</p>
          )}

          {!loading && finca && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">
                  Informació de producció
                </h2>

                {showMainEmptyMessage ? (
                  <p className="text-sm text-gray-500">Sense informació</p>
                ) : null}

                {showMainGrid ? (
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {hasOffice ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">
                          Cuina / Office
                        </label>
                        <textarea
                          readOnly
                          value={officeText}
                          className="w-full border rounded-xl px-3 py-2 text-base leading-relaxed min-h-[100px] sm:min-h-[120px] bg-slate-50/90 text-slate-900 resize-y cursor-default"
                        />
                      </div>
                    ) : null}
                    {hasAperitiu ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">
                          Aperitiu / Sala / Begudes
                        </label>
                        <textarea
                          readOnly
                          value={aperitiuText}
                          className="w-full border rounded-xl px-3 py-2 text-base leading-relaxed min-h-[100px] sm:min-h-[120px] bg-slate-50/90 text-slate-900 resize-y cursor-default"
                        />
                      </div>
                    ) : null}
                    {hasObs ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">
                          Observacions
                        </label>
                        <textarea
                          readOnly
                          value={obsText}
                          className="w-full border rounded-xl px-3 py-2 text-base leading-relaxed min-h-[100px] sm:min-h-[120px] bg-slate-50/90 text-slate-900 resize-y cursor-default"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {extraKeysWithContent.length > 0 ? (
                  <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2">
                    {extraKeysWithContent.map((key) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-600 mb-1.5">{key}</label>
                        <textarea
                          readOnly
                          value={sideSectionBody(produccio, key)}
                          className="w-full border rounded-xl px-3 py-2 text-base leading-relaxed min-h-[88px] sm:min-h-[100px] bg-slate-50/90 text-slate-900 resize-y cursor-default"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {finca.id && (
                <div className="flex flex-col gap-3 pt-1">
                  <button
                    type="button"
                    onClick={openFullSpace}
                    className="inline-flex items-center gap-2 min-h-11 px-1 py-2 text-base sm:text-sm font-semibold text-blue-600 hover:underline w-full sm:w-fit justify-center sm:justify-start rounded-lg active:bg-blue-50 touch-manipulation"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Veure fitxa completa de l’espai
                  </button>

                  {showDocsRow && (
                    <>
                      <div className="border-t border-slate-200" />
                      <button
                        type="button"
                        onClick={() => setDocsOpen(true)}
                        className="flex w-full min-h-[3rem] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-base sm:text-sm hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="font-medium text-slate-900">Veure documents</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                            Docs
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {showDocsRow && (
          <EventDocumentsSheet
            eventId={String(eventId)}
            eventCode={eventCode ?? null}
            open={docsOpen}
            onOpenChange={setDocsOpen}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
