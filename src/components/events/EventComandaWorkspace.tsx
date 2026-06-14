'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ClipboardList,
  MoreHorizontal,
  PackagePlus,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import EventComandaFamilyList from '@/components/events/EventComandaFamilyList'
import EventComandaImportPanel, {
  type EventComandaImportPanelHandle,
} from '@/components/events/EventComandaImportPanel'
import EventComandaOrderEditor from '@/components/events/EventComandaOrderEditor'
import { corporateFilterIconButtonClass } from '@/lib/corporate-filters'
import { sortFamilies } from '@/lib/eventComanda/parseErpExcel'
import {
  EVENT_COMANDA_STATUS_LABELS,
  type EventComandaOrderLine,
  type EventComandaSummary,
} from '@/lib/eventComanda/types'
import {
  eventComandaBodyClass,
  eventComandaDesktopSplitClass,
  eventComandaHeaderBarClass,
  eventComandaMainColumnClass,
  eventComandaModuleShellClass,
  eventComandaPageShellClass,
  eventComandaPrimaryButtonClass,
  eventComandaSidebarClass,
  eventComandaStatusBadgeClass,
} from '@/lib/eventComanda/ui'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  eventId: string
  eventTitle: string
  eventMeta?: string
  summary: EventComandaSummary
  loading?: boolean
  onRefresh: () => void
}

export default function EventComandaWorkspace({
  eventId,
  eventTitle,
  eventMeta,
  summary,
  loading = false,
  onRefresh,
}: Props) {
  const status = summary.status
  const importRef = useRef<EventComandaImportPanelHandle>(null)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [importPreviewActive, setImportPreviewActive] = useState(false)

  const hasTemplate = status === 'template_ready' || status === 'order_draft'
  const families = sortFamilies(Object.keys(summary.linesByFamily || {}))

  const handleSend = (lines: EventComandaOrderLine[]) => {
    window.alert(`Properament: s'enviarà la comanda amb ${lines.length} línies.`)
  }

  return (
    <div className={eventComandaPageShellClass}>
      <section className={eventComandaModuleShellClass}>
        <div className={eventComandaHeaderBarClass}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/menu/events"
              className={cn(corporateFilterIconButtonClass, 'h-11 w-11 shrink-0 touch-manipulation')}
              aria-label="Tornar a esdeveniments"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
            </Link>

            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
              <ClipboardList className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1 truncate">
              <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                <span className={typography('eyebrow')}>Comanda</span>
                <span className="mx-1.5 text-slate-300" aria-hidden>
                  ·
                </span>
                <span className={typography('cardTitle')}>{eventTitle}</span>
                {eventMeta ? (
                  <>
                    <span className="mx-1.5 text-slate-300" aria-hidden>
                      ·
                    </span>
                    <span className={cn(typography('bodySm'), 'font-normal text-slate-600')}>
                      {eventMeta}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <span className={cn(eventComandaStatusBadgeClass(status), 'max-w-[9rem] shrink-0 truncate')}>
              {EVENT_COMANDA_STATUS_LABELS[status]}
            </span>

            {hasTemplate ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                    aria-label="Opcions de plantilla"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setShowTemplateDialog(true)}>
                    <ClipboardList className="h-4 w-4" />
                    Veure plantilla ERP
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => importRef.current?.openFilePicker()}>
                    <Upload className="h-4 w-4" />
                    Actualitzar plantilla ERP
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <div className={eventComandaBodyClass}>
          {loading ? (
            <p className={typography('bodySm')}>Carregant comanda…</p>
          ) : status === 'no_template' ? (
            <NoTemplateStep eventId={eventId} onRefresh={onRefresh} />
          ) : hasTemplate ? (
            <>
              <EventComandaImportPanel
                ref={importRef}
                eventId={eventId}
                onImported={onRefresh}
                allowReplace
                hiddenTrigger
                onPreviewChange={setImportPreviewActive}
              />
              {!importPreviewActive ? (
                <EventComandaOrderEditor
                  eventId={eventId}
                  templateLinesByFamily={summary.linesByFamily || {}}
                  onSendToWarehouse={handleSend}
                />
              ) : null}
            </>
          ) : status === 'order_sent' || status === 'order_in_progress' ? (
            <WarehouseStep summary={summary} />
          ) : status === 'replenishment_pending' ? (
            <ReplenishmentStep summary={summary} />
          ) : (
            <ClosedStep summary={summary} />
          )}
        </div>
      </section>

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-h-[85dvh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-100 px-5 py-4">
            <DialogTitle>Plantilla ERP</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(85dvh-4.5rem)] overflow-y-auto px-3 py-3 sm:px-5">
            <EventComandaFamilyList
              linesByFamily={summary.linesByFamily || {}}
              familyOrder={families}
              scrollable={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NoTemplateStep({
  eventId,
  onRefresh,
}: {
  eventId: string
  onRefresh: () => void
}) {
  return (
    <div className={eventComandaDesktopSplitClass}>
      <aside className={eventComandaSidebarClass}>
        <div className="text-left">
          <h2 className={typography('cardTitle')}>Encara no hi ha plantilla ERP</h2>
          <p className={cn(typography('bodyMd'), 'mt-2 leading-relaxed')}>
            Penja l&apos;Excel de l&apos;esdeveniment (codi <strong>A</strong>, descripció{' '}
            <strong>D</strong>, quantitat <strong>O</strong>, unitat <strong>R</strong>) per
            generar la comanda inicial amb codis, grups i quantitats.
          </p>
        </div>
      </aside>

      <main className={eventComandaMainColumnClass}>
        <EventComandaImportPanel eventId={eventId} onImported={onRefresh} />
      </main>
    </div>
  )
}

function WarehouseStep({ summary }: { summary: EventComandaSummary }) {
  return (
    <div className="space-y-3">
      <h2 className={typography('sectionTitle')}>Comanda en curs al magatzem</h2>
      <p className={typography('bodyMd')}>{EVENT_COMANDA_STATUS_LABELS[summary.status]}</p>
    </div>
  )
}

function ReplenishmentStep({ summary }: { summary: EventComandaSummary }) {
  return (
    <div className="space-y-3">
      <h2 className={cn(typography('sectionTitle'), 'text-rose-900')}>Reposició pendent</h2>
      <p className={typography('bodyMd')}>
        {summary.pendingReplenishmentCount ?? 0} comanda(es) de reposició esperant magatzem.
      </p>
      <Button
        type="button"
        variant="outline"
        className={cn(eventComandaPrimaryButtonClass, 'gap-2')}
        disabled
      >
        <PackagePlus className="h-4 w-4" />
        Nova reposició
      </Button>
    </div>
  )
}

function ClosedStep({ summary }: { summary: EventComandaSummary }) {
  return (
    <div className="space-y-3">
      <h2 className={cn(typography('sectionTitle'), 'text-emerald-900')}>Comanda tancada</h2>
      <p className={typography('bodyMd')}>{EVENT_COMANDA_STATUS_LABELS[summary.status]}</p>
    </div>
  )
}
