//file: src/components/events/EventDocumentsSheet.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ExternalLink,
  FileText,
  FileSpreadsheet,
  Presentation,
  File,
  Image as ImgIcon,
  X,
} from 'lucide-react'
import useEventDocuments, { EventDoc } from '@/hooks/events/useEventDocuments'

/* Icons */
function DocIcon({ d }: { d: EventDoc }) {
  switch (d.icon) {
    case 'pdf':
      return <FileText className="h-4 w-4" />
    case 'sheet':
      return <FileSpreadsheet className="h-4 w-4" />
    case 'slide':
      return <Presentation className="h-4 w-4" />
    case 'img':
      return <ImgIcon className="h-4 w-4" />
    case 'doc':
      return <File className="h-4 w-4" />
    default:
      return <ExternalLink className="h-4 w-4" />
  }
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [el] = useState(() => {
    if (typeof document === 'undefined') return null
    const d = document.createElement('div')
    d.className = 'fixed inset-0 z-[12000]'
    return d
  })

  useEffect(() => {
    if (!el) return
    document.body.appendChild(el)
    setMounted(true)
    return () => {
      if (document.body.contains(el)) {
        document.body.removeChild(el)
      }
    }
  }, [el])

  if (!mounted || !el) return null
  return createPortal(children, el)
}

const safeUrl = (url?: string | null) => {
  const u = String(url || '').trim()
  if (!u) return ''
  if (u.startsWith('javascript:')) return ''
  return u
}

const displayTitle = (doc: EventDoc) =>
  String(doc.title || doc.name || doc.fileName || doc.label || doc.id || 'Document').trim()

const kindLabel = (doc: EventDoc) => {
  const explicitKind = String(doc.kind || doc.category || '').trim()
  if (explicitKind) return explicitKind
  switch (doc.icon) {
    case 'pdf':
      return 'PDF'
    case 'sheet':
      return 'Full'
    case 'slide':
      return 'Presentacio'
    case 'img':
      return 'Imatge'
    case 'doc':
      return 'Document'
    default:
      return 'Arxiu'
  }
}

export default function EventDocumentsSheet({
  eventId,
  eventCode,
  open,
  onOpenChange,
  embedded = false,
}: {
  eventId: string
  eventCode?: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  embedded?: boolean
}) {
  const { docs, loading, error } = useEventDocuments(
    eventId,
    eventCode || undefined,
    'all'
  )

  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setIsNarrow(window.innerWidth < 900)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as any).standalone === true
    )
  }, [])

  const shouldOpenSameWindow = isStandalone || isNarrow

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const linkTarget = shouldOpenSameWindow ? '_self' : '_blank'
  const linkRel = linkTarget === '_blank' ? 'noopener noreferrer' : undefined

  if (!open) return null

  const content = (
    <div className="relative w-full h-full">
      <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
        <div
          className="relative z-20 w-full max-w-[480px] max-h-[90vh] overflow-hidden bg-white rounded-[32px] shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <ModalContent
            docs={docs}
            loading={loading}
            error={error}
            onOpenChange={onOpenChange}
            linkTarget={linkTarget}
            linkRel={linkRel}
          />
        </div>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="relative w-full">
        <div className="mx-auto w-full max-w-[560px] rounded-[24px] border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ModalContent
            docs={docs}
            loading={loading}
            error={error}
            onOpenChange={onOpenChange}
            linkTarget={linkTarget}
            linkRel={linkRel}
          />
        </div>
      </div>
    )
  }

  return (
    <Portal>
      <div className="relative w-full h-full">
        <div
          className="absolute inset-0 bg-black/30 z-10"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChange(false)
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
          <div
            className="relative z-20 w-full max-w-[480px] max-h-[90vh] overflow-hidden bg-white rounded-[32px] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalContent
              docs={docs}
              loading={loading}
              error={error}
              onOpenChange={onOpenChange}
              linkTarget={linkTarget}
              linkRel={linkRel}
            />
          </div>
        </div>
      </div>
    </Portal>
  )
}

function ModalContent({
  docs,
  loading,
  error,
  onOpenChange,
  linkTarget,
  linkRel,
}: {
  docs: EventDoc[]
  loading: boolean
  error: string | null
  onOpenChange: (v: boolean) => void
  linkTarget: string
  linkRel?: string
}) {
  return (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-base font-semibold">Documents</h3>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-3">
        {loading && <p className="text-sm text-gray-500">Carregant…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && docs.length === 0 && (
          <p className="text-sm text-gray-600">Sense documents.</p>
        )}

        {docs.map((d) => {
          const url = safeUrl(d.url)
          const isDisabled = !url

          return (
            <div
              key={d.id}
            className="w-full rounded-2xl border border-slate-100 p-4 flex items-center gap-4 bg-white shadow-sm"
            >
            <div className="p-2 bg-gray-100 rounded-lg">
              <DocIcon d={d} />
            </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={d.title || d.id}>
                  {displayTitle(d)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold shrink-0">
                    {kindLabel(d)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {d.updatedAt ? new Date(d.updatedAt).toLocaleString('ca-ES') : 'Sense data'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                  isDisabled
                    ? 'border border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                }`}
                onClick={() => {
                  if (!url) return
                  window.open(url, linkTarget, linkRel)
                }}
                disabled={isDisabled}
              >
                Obre
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
