'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, FolderOpen, GraduationCap, ListChecks, Plus, Scale } from 'lucide-react'
import { DOCUMENTACIO_PAGE_ROLES, withRoles } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DOCUMENTACIO_AMBITS, type DocumentacioAmbit } from '@/lib/documentacio-structure'
import { DocumentacioPublishDialog } from '@/app/menu/documentacio/components/DocumentacioPublishDialog'
import { DocumentacioToolbar } from '@/app/menu/documentacio/components/DocumentacioToolbar'
import { DOCUMENTACIO_MODULE_HEADER_ICON_CLASS } from '@/app/menu/documentacio/documentacio-layout-classes'

const HUB_PAGE_TITLE = 'Documentació'

const AMBIT_ICONS: Record<DocumentacioAmbit, typeof GraduationCap> = {
  formacions: GraduationCap,
  normatives: Scale,
  protocols: ListChecks,
}

function DocumentacioHub() {
  const [publishOpen, setPublishOpen] = useState(false)
  const [extraAmbits, setExtraAmbits] = useState<Array<{ slug: string; title: string }>>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/documentacio/ambits')
        const data = (await r.json()) as { extraAmbits?: Array<{ slug: string; title: string }> }
        if (cancelled) return
        setExtraAmbits(Array.isArray(data.extraAmbits) ? data.extraAmbits : [])
      } catch {
        if (!cancelled) setExtraAmbits([])
      }
    }
    void load()
    const onChanged = () => void load()
    window.addEventListener('documentacio:items-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('documentacio:items-changed', onChanged)
    }
  }, [])

  const ambitCount = DOCUMENTACIO_AMBITS.length + extraAmbits.length

  return (
    <>
      <ModuleHeader
        icon={<BookOpen className={DOCUMENTACIO_MODULE_HEADER_ICON_CLASS} aria-hidden />}
        title={HUB_PAGE_TITLE}
        mainHref="/menu"
        actions={
          <Button
            type="button"
            className="bg-teal-600 hover:bg-teal-700"
            onClick={() => setPublishOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Publicar document
          </Button>
        }
      />

      <DocumentacioToolbar />

      <div className={cn(typography('bodyMd'), 'px-1')}>
        {ambitCount} {ambitCount === 1 ? 'àrea' : 'àrees'}
      </div>

      <DocumentacioPublishDialog open={publishOpen} onOpenChange={setPublishOpen} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 lg:gap-4">
        {DOCUMENTACIO_AMBITS.map((ambit) => {
          const Icon = AMBIT_ICONS[ambit.id]
          return (
            <Link
              key={ambit.id}
              href={`/menu/documentacio/${ambit.id}`}
              aria-label={ambit.title}
              className={cn(
                'flex min-h-[5.75rem] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
                'transition hover:border-teal-400 hover:bg-teal-50/40 hover:shadow-md active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2'
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <span className="text-base font-semibold text-slate-900">{ambit.title}</span>
            </Link>
          )
        })}
        {extraAmbits.map((ambit) => (
          <Link
            key={ambit.slug}
            href={`/menu/documentacio/${ambit.slug}`}
            aria-label={ambit.title}
            className={cn(
              'flex min-h-[5.75rem] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
              'transition hover:border-teal-400 hover:bg-teal-50/40 hover:shadow-md active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2'
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200">
              <FolderOpen className="h-6 w-6" aria-hidden />
            </div>
            <span className="text-base font-semibold text-slate-900">{ambit.title}</span>
          </Link>
        ))}
      </div>
    </>
  )
}

export default withRoles(DOCUMENTACIO_PAGE_ROLES, DocumentacioHub)
