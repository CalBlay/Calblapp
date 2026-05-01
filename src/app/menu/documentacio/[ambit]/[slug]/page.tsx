'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { BookOpen, FileText, Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DOCUMENTACIO_PAGE_ROLES, withRoles } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import {
  documentacioFileVisibleToViewer,
  findTopicInAmbit,
  getAmbitDisplayTitle,
  humanizeDocumentacioTopicSlug,
  isValidDocumentacioAmbitSlug,
  isValidDocumentacioTopicSlug,
} from '@/lib/documentacio-structure'
import { canManageDocumentacioContent, type DocumentacioItemListDTO } from '@/lib/documentacio-access'
import {
  attachmentListCardTitleClass,
  attachmentListEmptyBoxClass,
  attachmentListIconWrapClass,
  attachmentListMetaRowClass,
  attachmentListRowClass,
  attachmentListSectionTitleClass,
} from '@/lib/attachmentListUi'
import { DocumentacioToolbar } from '@/app/menu/documentacio/components/DocumentacioToolbar'
import { DOCUMENTACIO_MODULE_HEADER_ICON_CLASS } from '@/app/menu/documentacio/documentacio-layout-classes'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

function formatReviewLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DocumentacioTopicPage() {
  const params = useParams()
  const { data: session } = useSession()
  const rawAmbit = String(params?.ambit || '')
  const slug = String(params?.slug || '')
  const ambit = isValidDocumentacioAmbitSlug(rawAmbit) ? rawAmbit : null

  const found = ambit ? findTopicInAmbit(ambit, slug) : null

  const [items, setItems] = useState<DocumentacioItemListDTO[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const canManage = canManageDocumentacioContent(session?.user?.role)

  const visibleFiles = useMemo(() => {
    if (!found) return []
    const role = session?.user?.role
    const department = session?.user?.department
    return found.topic.files.filter((file) =>
      documentacioFileVisibleToViewer({ file, viewerRole: role, viewerDepartment: department })
    )
  }, [found, session?.user?.role, session?.user?.department])

  const loadItems = useCallback(async () => {
    if (!ambit || !slug || !isValidDocumentacioTopicSlug(slug)) return
    setItemsError(null)
    setItemsLoading(true)
    try {
      const url = `/api/documentacio/items?ambit=${encodeURIComponent(ambit)}&topicSlug=${encodeURIComponent(slug)}`
      const r = await fetch(url)
      const data = (await r.json()) as { items?: DocumentacioItemListDTO[]; error?: string }
      if (!r.ok) throw new Error(data.error || 'Error')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItemsError("No s'han pogut carregar els documents.")
      setItems([])
    } finally {
      setItemsLoading(false)
    }
  }, [ambit, slug])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  useEffect(() => {
    const onChanged = () => void loadItems()
    window.addEventListener('documentacio:items-changed', onChanged)
    return () => window.removeEventListener('documentacio:items-changed', onChanged)
  }, [loadItems])

  async function handleBulkDeleteTopic() {
    if (!canManage || !ambit || !slug) return
    if (
      !window.confirm(
        'Vols esborrar tots els documents (fitxers i enllaços) d’aquest tema a la base de dades? Els fitxers estàtics del llistat (si n’hi ha) no es toquen.'
      )
    ) {
      return
    }
    setBulkDeleting(true)
    try {
      const r = await fetch(
        `/api/documentacio/items/bulk?ambit=${encodeURIComponent(ambit)}&topicSlug=${encodeURIComponent(slug)}`,
        { method: 'DELETE' }
      )
      const data = (await r.json().catch(() => ({}))) as { error?: string; deleted?: number }
      if (!r.ok) {
        window.alert(data.error || "No s'ha pogut completar l'esborrat.")
        return
      }
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('documentacio:items-changed'))
      await loadItems()
      window.alert(
        data.deleted === 0
          ? 'No hi havia cap document per esborrar.'
          : `S’han esborrat ${data.deleted} document(s).`
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!canManage) return
    if (!window.confirm('Vols esborrar aquest document?')) return
    setDeletingId(id)
    try {
      const r = await fetch(`/api/documentacio/items/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        window.alert(data.error || "No s'ha pogut esborrar.")
        return
      }
      setItems((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  if (!ambit || !isValidDocumentacioAmbitSlug(ambit) || !isValidDocumentacioTopicSlug(slug)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-slate-600">Document no trobat.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/menu/documentacio">Tornar al centre</Link>
        </Button>
      </div>
    )
  }

  const topicTitleFromItems = items.map((i) => i.topicTitle).find((t) => t && String(t).trim())
  const ambitTitleFromItems = items.map((i) => i.ambitTitle).find((t) => t && String(t).trim())
  const ambitDisplay = getAmbitDisplayTitle(ambit, ambitTitleFromItems)
  const displayTitle = found
    ? found.topic.title
    : String(topicTitleFromItems || '').trim() || humanizeDocumentacioTopicSlug(slug)

  const contextLine = found
    ? found.group.title.trim().toLowerCase() === found.topic.title.trim().toLowerCase()
      ? ambitDisplay
      : `${ambitDisplay} · ${found.group.title}`
    : ambitDisplay

  const hasAnyFiles = visibleFiles.length > 0 || items.length > 0
  const staticBlockedNoDocs = found
    ? found.topic.files.length > 0 && visibleFiles.length === 0 && items.length === 0
    : false

  return (
    <>
      <ModuleHeader
        icon={<BookOpen className={DOCUMENTACIO_MODULE_HEADER_ICON_CLASS} aria-hidden />}
        title="Documentació"
        subtitle={ambitDisplay}
        mainHref="/menu/documentacio"
      />

      <DocumentacioToolbar />

      <article>
        <h1 className={cn(typography('pageTitle'), 'px-1')}>{displayTitle}</h1>
        <p className={cn(typography('bodySm'), 'mt-1 px-1 text-slate-600')}>{contextLine}</p>

        <h2 className={cn(attachmentListSectionTitleClass, 'mt-6')}>Fitxers</h2>

        {itemsLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregant documents…
          </div>
        ) : null}

        {itemsError ? <p className="mt-3 text-sm text-red-600">{itemsError}</p> : null}

        {!itemsLoading && staticBlockedNoDocs ? (
          <div className="mt-3 text-center">
            <div className={attachmentListEmptyBoxClass}>
              Cap fitxer visible per al teu departament.
            </div>
          </div>
        ) : null}

        {!itemsLoading && !hasAnyFiles && !staticBlockedNoDocs ? (
          <div className="mt-3 text-center">
            <div className={attachmentListEmptyBoxClass}>Sense fitxers.</div>
          </div>
        ) : null}

        {visibleFiles.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {visibleFiles.map((file) => (
              <li key={file.id}>
                <div className={attachmentListRowClass}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={attachmentListIconWrapClass}>
                      <FileText className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      {file.href ? (
                        <a
                          href={file.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'block truncate hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                            attachmentListCardTitleClass
                          )}
                        >
                          {file.label}
                        </a>
                      ) : (
                        <span className={cn('block truncate', attachmentListCardTitleClass)}>{file.label}</span>
                      )}
                      {file.updatedAtLabel ? (
                        <div className={attachmentListMetaRowClass}>
                          <span>{file.updatedAtLabel}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {items.length > 0 ? (
          <ul className={cn('space-y-2', visibleFiles.length > 0 && 'mt-4', !visibleFiles.length && 'mt-3')}>
            {items.map((item) => {
              const metaParts: string[] = []
              if (item.status === 'draft') metaParts.push('Esborrany')
              if (item.reviewAt) metaParts.push(`Revisió ${formatReviewLabel(item.reviewAt)}`)
              const meta = metaParts.join(' · ')
              return (
                <li key={item.id}>
                  <div className={attachmentListRowClass}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={attachmentListIconWrapClass}>
                        <FileText className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'block truncate hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
                            attachmentListCardTitleClass
                          )}
                        >
                          {item.label}
                        </a>
                        {meta ? (
                          <div className={attachmentListMetaRowClass}>
                            <span>{meta}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={deletingId === item.id}
                        aria-label="Esborrar document"
                        onClick={() => void handleDelete(item.id)}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}

        {canManage ? (
          <div className="mt-10 border-t border-slate-200 pt-6">
            <p className={cn(typography('bodySm'), 'text-slate-600')}>
              Zona de gestió: esborra tots els documents publicats via l’aplicació en aquest tema.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 border-red-200 text-red-700 hover:bg-red-50"
              disabled={bulkDeleting}
              onClick={() => void handleBulkDeleteTopic()}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Esborrant…
                </>
              ) : (
                'Esborrar tots els documents d’aquest tema'
              )}
            </Button>
          </div>
        ) : null}
      </article>
    </>
  )
}

export default withRoles(DOCUMENTACIO_PAGE_ROLES, DocumentacioTopicPage)
