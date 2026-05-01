'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react'
import { DOCUMENTACIO_PAGE_ROLES, withRoles } from '@/hooks/withAdmin'
import { Button } from '@/components/ui/button'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { DocumentacioToolbar } from '@/app/menu/documentacio/components/DocumentacioToolbar'
import { DOCUMENTACIO_MODULE_HEADER_ICON_CLASS } from '@/app/menu/documentacio/documentacio-layout-classes'
import { canManageDocumentacioContent } from '@/lib/documentacio-access'
import {
  getAmbitDisplayTitle,
  getGroupsForAmbit,
  isStaticDocumentacioAmbit,
  isValidDocumentacioAmbitSlug,
} from '@/lib/documentacio-structure'

function DocumentacioAmbitPage() {
  const params = useParams()
  const { data: session } = useSession()
  const raw = String(params?.ambit || '')
  const ambit = isValidDocumentacioAmbitSlug(raw) ? raw : null

  const [extraTopics, setExtraTopics] = useState<Array<{ slug: string; title: string }>>([])
  const [dynamicAmbitTitle, setDynamicAmbitTitle] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const canManage = canManageDocumentacioContent(session?.user?.role)

  useEffect(() => {
    if (!ambit) return
    let cancelled = false
    const loadTopics = async () => {
      try {
        const r = await fetch(`/api/documentacio/topics?ambit=${encodeURIComponent(ambit)}`)
        const data = (await r.json()) as { extraTopics?: Array<{ slug: string; title: string }> }
        if (cancelled) return
        setExtraTopics(Array.isArray(data.extraTopics) ? data.extraTopics : [])
      } catch {
        if (!cancelled) setExtraTopics([])
      }
    }
    void loadTopics()
    const onChanged = () => void loadTopics()
    window.addEventListener('documentacio:items-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('documentacio:items-changed', onChanged)
    }
  }, [ambit])

  useEffect(() => {
    if (!ambit || isStaticDocumentacioAmbit(ambit)) {
      setDynamicAmbitTitle(null)
      return
    }
    let cancelled = false
    const loadAmbitMeta = async () => {
      try {
        const r = await fetch('/api/documentacio/ambits')
        const data = (await r.json()) as { extraAmbits?: Array<{ slug: string; title: string }> }
        if (cancelled) return
        const list = Array.isArray(data.extraAmbits) ? data.extraAmbits : []
        setDynamicAmbitTitle(list.find((a) => a.slug === ambit)?.title ?? null)
      } catch {
        if (!cancelled) setDynamicAmbitTitle(null)
      }
    }
    void loadAmbitMeta()
    const onChanged = () => void loadAmbitMeta()
    window.addEventListener('documentacio:items-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('documentacio:items-changed', onChanged)
    }
  }, [ambit])

  if (!ambit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-slate-600">Àmbit no trobat.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/menu/documentacio">Tornar al centre</Link>
        </Button>
      </div>
    )
  }

  const groups = getGroupsForAmbit(ambit)
  const staticTopicCount = groups.reduce((sum, g) => sum + g.topics.length, 0)
  const topicCount = staticTopicCount + extraTopics.length
  const ambitSubtitle = getAmbitDisplayTitle(ambit, dynamicAmbitTitle)

  async function handleBulkDeleteAmbit() {
    if (!canManage || !ambit) return
    if (
      !window.confirm(
        'Vols esborrar tots els documents (fitxers i enllaços) d’aquest àmbit a la base de dades? Això no elimina els temes ni fitxers definits de forma estàtica al codi, només el que s’ha publicat des de l’aplicació.'
      )
    ) {
      return
    }
    setBulkDeleting(true)
    try {
      const r = await fetch(`/api/documentacio/items/bulk?ambit=${encodeURIComponent(ambit)}`, {
        method: 'DELETE',
      })
      const data = (await r.json().catch(() => ({}))) as { error?: string; deleted?: number }
      if (!r.ok) {
        window.alert(data.error || "No s'ha pogut completar l'esborrat.")
        return
      }
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('documentacio:items-changed'))
      window.alert(
        data.deleted === 0
          ? 'No hi havia cap document per esborrar.'
          : `S’han esborrat ${data.deleted} document(s).`
      )
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <>
      <ModuleHeader
        icon={<BookOpen className={DOCUMENTACIO_MODULE_HEADER_ICON_CLASS} aria-hidden />}
        title="Documentació"
        subtitle={ambitSubtitle}
        mainHref="/menu/documentacio"
      />

      <DocumentacioToolbar />

      <div className={cn(typography('bodyMd'), 'px-1')}>
        {topicCount} {topicCount === 1 ? 'tema' : 'temes'}
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.id} aria-label={group.title}>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {group.topics.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/menu/documentacio/${ambit}/${topic.slug}`}
                    aria-label={topic.title}
                    className={cn(
                      'flex min-h-[3.5rem] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm',
                      'transition hover:border-teal-400 hover:bg-teal-50/40 hover:shadow-sm active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2'
                    )}
                  >
                    {topic.title}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {extraTopics.length > 0 ? (
          <section aria-label="Temes addicionals">
            <h2 className={cn(typography('bodySm'), 'mb-3 font-semibold text-slate-700')}>
              Temes addicionals
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {extraTopics.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/menu/documentacio/${ambit}/${topic.slug}`}
                    aria-label={topic.title}
                    className={cn(
                      'flex min-h-[3.5rem] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm',
                      'transition hover:border-teal-400 hover:bg-teal-50/40 hover:shadow-sm active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2'
                    )}
                  >
                    {topic.title}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {canManage ? (
        <div className="mt-10 border-t border-slate-200 pt-6">
          <p className={cn(typography('bodySm'), 'text-slate-600')}>
            Zona de gestió: esborra tots els documents publicats via l’aplicació en aquest àmbit.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 border-red-200 text-red-700 hover:bg-red-50"
            disabled={bulkDeleting}
            onClick={() => void handleBulkDeleteAmbit()}
          >
            {bulkDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Esborrant…
              </>
            ) : (
              'Esborrar tots els documents d’aquest àmbit'
            )}
          </Button>
        </div>
      ) : null}
    </>
  )
}

export default withRoles(DOCUMENTACIO_PAGE_ROLES, DocumentacioAmbitPage)
