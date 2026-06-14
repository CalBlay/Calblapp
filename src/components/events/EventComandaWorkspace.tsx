'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ClipboardList,
  Download,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import FloatingAddButton from '@/components/ui/floating-add-button'
import ModuleHeader from '@/components/layout/ModuleHeader'
import EventComandaWarehouseFiltersBar, {
  EVENT_COMANDA_WAREHOUSE_FILTER_ALL,
} from '@/components/events/EventComandaWarehouseFiltersBar'
import { Input } from '@/components/ui/input'
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
import EventComandaBatchStatusBadges from '@/components/events/EventComandaBatchStatusBadges'
import EventComandaSortableTh from '@/components/events/EventComandaSortableTh'
import EventComandaFamilyList from '@/components/events/EventComandaFamilyList'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'
import {
  buildEventComandaRoomIdFromBatch,
  resolveEventComandaBatchChannelId,
} from '@/lib/messaging/eventComandaChatIds'
import EventComandaImportPanel, {
  type EventComandaImportPanelHandle,
} from '@/components/events/EventComandaImportPanel'
import EventComandaOrderEditor from '@/components/events/EventComandaOrderEditor'
import { clearOrderDraft, clearOrderDraftMode } from '@/lib/eventComanda/orderDraft'
import { resolveDeliveryDateBounds } from '@/lib/eventComanda/deliverySlots'
import { refreshNotificationSummary } from '@/hooks/useAdminNotifications'
import {
  EVENT_COMANDA_BATCH_STATUS_BADGES,
  EVENT_COMANDA_BATCH_STATUS_LABELS,
  isComandaWarehouseChatActive,
  normalizeEventComandaBatchStatus,
} from '@/lib/eventComanda/batchStatus'
import { formatOrderDeliverySummary } from '@/lib/eventComanda/deliverySlots'
import { batchToOrderLines } from '@/lib/eventComanda/orderLines'
import { exportEventComandaWarehousePrepPdf } from '@/lib/eventComanda/warehousePrepPdf'
import {
  nextComandaLineSort,
  sortComandaLines,
  type ComandaLineSortDirection,
  type ComandaLineSortKey,
} from '@/lib/eventComanda/sortLines'
import { eventComandaQtyUnit, sortFamilies } from '@/lib/eventComanda/parseErpExcel'
import {
  EVENT_COMANDA_STATUS_LABELS,
  type EventComandaBatchStatus,
  type EventComandaOrderBatch,
  type EventComandaSendPayload,
  type EventComandaSummary,
} from '@/lib/eventComanda/types'
import {
  eventComandaBatchStatusBadgeClass,
  eventComandaBodyClass,
  eventComandaDesktopSplitClass,
  eventComandaMainColumnClass,
  eventComandaModuleShellClass,
  eventComandaPageShellClass,
  eventComandaPanelClass,
  eventComandaSidebarClass,
  eventComandaStatusBadgeClass,
  eventComandaTableClass,
  eventComandaTableHeadCellClass,
  eventComandaTableRowClass,
  formatEventComandaQty,
} from '@/lib/eventComanda/ui'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

function warehouseFilterLabel(batch: EventComandaOrderBatch) {
  const name = batch.warehouseName?.trim()
  const code = batch.warehouseCode?.trim()
  return name && code && name !== code ? `${name} · ${code}` : name || code || 'Magatzem'
}

function warehouseLabel(batch: EventComandaOrderBatch) {
  const name = batch.warehouseName?.trim()
  const code = batch.warehouseCode?.trim()
  const base =
    name && code && name !== code ? `${name} · ${code}` : name || code || 'Magatzem'
  if (batch.kind === 'revision') return `${base} · Comanda addicional`
  return base
}

function batchPanelId(batch: EventComandaOrderBatch) {
  return String(batch.batchId || batch.warehouseId).trim()
}

type BatchLineChangeKind = 'modified' | 'added'

function batchLineChangeKind(
  line: EventComandaOrderBatch['lines'][number],
  batchKind?: EventComandaOrderBatch['kind']
): BatchLineChangeKind | null {
  if (
    line.modifiedAt ||
    (line.qtyRequestedBefore != null &&
      Number(line.qtyRequestedBefore) !== Number(line.qtyRequested))
  ) {
    return 'modified'
  }
  if (batchKind === 'revision' && Number(line.qtyRequested) > 0) return 'added'
  return null
}

function countBatchLineChanges(batch: EventComandaOrderBatch) {
  return batch.lines.filter((line) => batchLineChangeKind(line, batch.kind)).length
}

type Props = {
  eventId: string
  eventTitle: string
  eventMeta?: string
  summary: EventComandaSummary
  loading?: boolean
  onRefresh: () => void
  comandaPreparerOnly?: boolean
  comandaHistoryMode?: boolean
  returnTo?: string
  canCreateComanda?: boolean
  canPrepareComanda?: boolean
  currentUserId?: string | null
  onOpenWarehouseChat?: (warehouseId: string, roomId: string, channelId: string) => void
}

export default function EventComandaWorkspace({
  eventId,
  eventTitle,
  eventMeta,
  summary,
  loading = false,
  onRefresh,
  comandaPreparerOnly = false,
  comandaHistoryMode = false,
  returnTo = '/menu/events',
  canCreateComanda = true,
  canPrepareComanda = false,
  currentUserId = null,
  onOpenWarehouseChat,
}: Props) {
  const status = summary.status
  const importRef = useRef<EventComandaImportPanelHandle>(null)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [importPreviewActive, setImportPreviewActive] = useState(false)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [editorResetKey, setEditorResetKey] = useState(0)
  const [editingBatch, setEditingBatch] = useState<EventComandaOrderBatch | null>(null)
  const [creatingNewOrder, setCreatingNewOrder] = useState(false)
  const [warehouseFilter, setWarehouseFilter] = useState(EVENT_COMANDA_WAREHOUSE_FILTER_ALL)
  const [statusFilter, setStatusFilter] = useState(EVENT_COMANDA_WAREHOUSE_FILTER_ALL)
  const [updating, setUpdating] = useState(false)

  const hasImportedTemplate = (summary.templateLineCount ?? 0) > 0
  const canEditOrder =
    canCreateComanda && (status === 'template_ready' || status === 'order_draft')
  const showHistoryFlow =
    comandaHistoryMode &&
    comandaPreparerOnly &&
    Boolean(summary.orderBatches?.length)
  const showPrepareFlow =
    !comandaHistoryMode &&
    canPrepareComanda &&
    (status === 'order_sent' || status === 'order_in_progress' || status === 'order_closed')
  const showWarehouseOversight =
    canCreateComanda &&
    !comandaPreparerOnly &&
    (status === 'order_sent' || status === 'order_in_progress' || status === 'order_closed')
  const families = sortFamilies(Object.keys(summary.linesByFamily || {}))
  const hasActiveOrder =
    status === 'order_sent' || status === 'order_in_progress' || status === 'order_closed'
  const showFloatingAddButton =
    canCreateComanda &&
    !comandaPreparerOnly &&
    !comandaHistoryMode &&
    !loading &&
    !importPreviewActive &&
    !canEditOrder &&
    !creatingNewOrder &&
    !editingBatch &&
    showWarehouseOversight &&
    hasActiveOrder

  const showWarehouseList =
    !loading &&
    !creatingNewOrder &&
    !editingBatch &&
    (showHistoryFlow || showPrepareFlow || showWarehouseOversight)

  const warehouseFilterOptions = useMemo(() => {
    const batches = summary.orderBatches || []
    const seen = new Map<string, string>()
    for (const batch of batches) {
      const key = warehouseDocId(batch.warehouseId)
      if (!key || seen.has(key)) continue
      seen.set(key, warehouseFilterLabel(batch))
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ca', { sensitivity: 'base' }))
  }, [summary.orderBatches])

  const statusFilterOptions = useMemo(() => {
    const batches = summary.orderBatches || []
    const seen = new Set<EventComandaBatchStatus>()
    for (const batch of batches) {
      seen.add(normalizeEventComandaBatchStatus(batch.status))
    }
    return [...seen]
      .map((status) => ({
        value: status,
        label: EVENT_COMANDA_BATCH_STATUS_LABELS[status],
        className: EVENT_COMANDA_BATCH_STATUS_BADGES[status],
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ca', { sensitivity: 'base' }))
  }, [summary.orderBatches])

  const deliveryDateBounds = useMemo(
    () => resolveDeliveryDateBounds(summary.eventEndDate),
    [summary.eventEndDate]
  )

  const comandaHeaderSubtitle = [eventTitle, eventMeta].filter(Boolean).join(' · ')

  const headerStatusLabel = creatingNewOrder
    ? 'Nova comanda addicional'
    : editingBatch
      ? 'Modificant comanda'
      : EVENT_COMANDA_STATUS_LABELS[status]

  const headerStatusBadgeClass = creatingNewOrder
    ? eventComandaStatusBadgeClass('template_ready')
    : editingBatch
      ? eventComandaStatusBadgeClass('order_draft')
      : eventComandaStatusBadgeClass(status)

  const headerActions = (
    <>
      <span className={cn(headerStatusBadgeClass, 'max-w-[9rem] shrink-0 truncate')}>
        {headerStatusLabel}
      </span>
      {hasImportedTemplate && canCreateComanda && !comandaPreparerOnly ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
              aria-label="Opcions de plantilla"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEditOrder ? (
              <DropdownMenuItem
                onClick={() => {
                  if (
                    !window.confirm(
                      'Vols començar una comanda nova? Es perdrà l\'esborrany actual.'
                    )
                  ) {
                    return
                  }
                  clearOrderDraft(eventId)
                  setEditorResetKey((key) => key + 1)
                }}
              >
                <ClipboardList className="h-4 w-4" />
                Nova comanda
              </DropdownMenuItem>
            ) : null}
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
    </>
  )

  const startNewOrder = () => {
    clearOrderDraft(eventId)
    clearOrderDraftMode(eventId)
    setEditorResetKey((key) => key + 1)
    setCreatingNewOrder(true)
    setEditingBatch(null)
    setSendError(null)
  }

  const handleSend = async (payload: EventComandaSendPayload) => {
    setSendError(null)
    setSending(true)
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          lines: payload.lines,
          deliveryDate: payload.deliveryDate,
          deliveryTimeSlot: payload.deliveryTimeSlot,
          comments: payload.comments,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSendError(json.error || 'No s\'ha pogut enviar la comanda.')
        return
      }
      clearOrderDraft(eventId)
      onRefresh()
    } catch {
      setSendError('No s\'ha pogut enviar la comanda.')
    } finally {
      setSending(false)
    }
  }

  const handleUpdate = async (payload: EventComandaSendPayload) => {
    setSendError(null)
    setUpdating(true)
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          lines: payload.lines,
          deliveryDate: payload.deliveryDate,
          deliveryTimeSlot: payload.deliveryTimeSlot,
          comments: payload.comments,
          warehouseId: payload.warehouseId,
          batchId: payload.batchId,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSendError(json.error || 'No s\'ha pogut actualitzar la comanda.')
        return
      }
      setEditingBatch(null)
      setCreatingNewOrder(false)
      onRefresh()
    } catch {
      setSendError('No s\'ha pogut actualitzar la comanda.')
    } finally {
      setUpdating(false)
    }
  }

  const handleNewAdditionalOrder = async (payload: EventComandaSendPayload) => {
    const warehouseId =
      payload.lines.find(
        (line) =>
          line.qtyRequested != null &&
          Number(line.qtyRequested) > 0 &&
          warehouseDocId(line.warehouseId || '')
      )?.warehouseId || ''
    if (!warehouseId) {
      setSendError('Cal afegir línies amb magatzem assignat abans d\'enviar.')
      return
    }
    await handleUpdate({ ...payload, warehouseId })
  }

  return (
    <div className={eventComandaPageShellClass}>
      <ModuleHeader
        icon={<ClipboardList className="h-6 w-6 text-amber-600" />}
        title="Esdeveniments"
        subtitle={comandaHeaderSubtitle || 'Comanda'}
        mainHref={returnTo}
        actions={headerActions}
      />

      {showWarehouseList ? (
        <EventComandaWarehouseFiltersBar
          warehouseFilter={warehouseFilter}
          statusFilter={statusFilter}
          warehouseOptions={warehouseFilterOptions}
          statusOptions={statusFilterOptions}
          onWarehouseChange={setWarehouseFilter}
          onStatusChange={setStatusFilter}
          onReset={() => {
            setWarehouseFilter(EVENT_COMANDA_WAREHOUSE_FILTER_ALL)
            setStatusFilter(EVENT_COMANDA_WAREHOUSE_FILTER_ALL)
          }}
        />
      ) : null}

      <section className={eventComandaModuleShellClass}>
        <div className={eventComandaBodyClass}>
          {loading ? (
            <p className={typography('bodySm')}>Carregant comanda…</p>
          ) : status === 'no_template' ? (
            comandaPreparerOnly || !canCreateComanda ? (
              <WarehouseOnlyPendingMessage />
            ) : (
              <NoTemplateStep eventId={eventId} onRefresh={onRefresh} />
            )
          ) : canEditOrder && canCreateComanda && !comandaPreparerOnly ? (
            <>
              <EventComandaImportPanel
                ref={importRef}
                eventId={eventId}
                onImported={onRefresh}
                allowReplace
                hiddenTrigger
                onPreviewChange={setImportPreviewActive}
              />
              {sendError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sendError}
                </p>
              ) : null}
              {!importPreviewActive ? (
                <EventComandaOrderEditor
                  key={editorResetKey}
                  eventId={eventId}
                  templateLinesByFamily={summary.linesByFamily || {}}
                  deliveryDateBounds={deliveryDateBounds}
                  onSendToWarehouse={handleSend}
                  saving={sending}
                />
              ) : null}
            </>
          ) : creatingNewOrder && canCreateComanda && !comandaPreparerOnly ? (
            <>
              {sendError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sendError}
                </p>
              ) : null}
              <EventComandaOrderEditor
                key={`new-order-${editorResetKey}`}
                eventId={eventId}
                templateLinesByFamily={summary.linesByFamily || {}}
                deliveryDateBounds={deliveryDateBounds}
                initialDelivery={{
                  deliveryDate: summary.orderDeliveryDate,
                  deliveryTimeSlot: summary.orderDeliveryTimeSlot,
                  comments: summary.orderComments,
                }}
                forceSourcePick
                onSendToWarehouse={handleNewAdditionalOrder}
                onCancelEdit={() => {
                  setSendError(null)
                  setCreatingNewOrder(false)
                }}
                saving={updating}
              />
            </>
          ) : showWarehouseOversight && editingBatch ? (
            <>
              {sendError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {sendError}
                </p>
              ) : null}
              <EventComandaOrderEditor
                key={`edit-${batchPanelId(editingBatch)}-${summary.orderUpdatedAt || summary.orderSentAt || 'order'}`}
                eventId={eventId}
                templateLinesByFamily={summary.linesByFamily || {}}
                deliveryDateBounds={deliveryDateBounds}
                mode="edit"
                editScope={{
                  warehouseId: editingBatch.warehouseId,
                  batchId: batchPanelId(editingBatch),
                  warehouseLabel: warehouseLabel(editingBatch),
                  warehouseCode: editingBatch.warehouseCode,
                  warehouseName: editingBatch.warehouseName,
                }}
                initialLines={batchToOrderLines(editingBatch)}
                initialDelivery={{
                  deliveryDate: summary.orderDeliveryDate,
                  deliveryTimeSlot: summary.orderDeliveryTimeSlot,
                  comments: summary.orderComments,
                }}
                onUpdateOrder={handleUpdate}
                onCancelEdit={() => {
                  setSendError(null)
                  setEditingBatch(null)
                }}
                saving={updating}
              />
            </>
          ) : showHistoryFlow || showPrepareFlow || showWarehouseOversight ? (
            <WarehouseStep
              eventId={eventId}
              eventTitle={eventTitle}
              eventMeta={eventMeta}
              summary={summary}
              canPrepareComanda={comandaHistoryMode ? false : canPrepareComanda}
              canModifyOrder={showWarehouseOversight && hasActiveOrder}
              historyMode={comandaHistoryMode}
              warehouseFilter={warehouseFilter}
              statusFilter={statusFilter}
              onEditBatch={(batch) => {
                setSendError(null)
                setEditingBatch(batch)
              }}
              currentUserId={currentUserId}
              onRefresh={onRefresh}
              onOpenWarehouseChat={onOpenWarehouseChat}
            />
          ) : comandaPreparerOnly ? (
            <WarehouseOnlyPendingMessage />
          ) : (
            <ClosedStep summary={summary} />
          )}
        </div>
      </section>

      {showFloatingAddButton ? <FloatingAddButton onClick={startNewOrder} /> : null}

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

function WarehouseOnlyPendingMessage() {
  return (
    <div className={eventComandaPanelClass}>
      <h2 className={typography('cardTitle')}>Comanda encara no disponible</h2>
      <p className={cn(typography('bodyMd'), 'mt-2 text-slate-600')}>
        Encara no s&apos;ha enviat cap comanda al teu magatzem per aquest esdeveniment.
      </p>
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

function WarehouseStep({
  eventId,
  eventTitle,
  eventMeta,
  summary,
  canPrepareComanda,
  canModifyOrder,
  historyMode = false,
  warehouseFilter = EVENT_COMANDA_WAREHOUSE_FILTER_ALL,
  statusFilter = EVENT_COMANDA_WAREHOUSE_FILTER_ALL,
  onEditBatch,
  currentUserId,
  onRefresh,
  onOpenWarehouseChat,
}: {
  eventId: string
  eventTitle: string
  eventMeta?: string
  summary: EventComandaSummary
  canPrepareComanda: boolean
  canModifyOrder?: boolean
  historyMode?: boolean
  warehouseFilter?: string
  statusFilter?: string
  onEditBatch?: (batch: EventComandaOrderBatch) => void
  currentUserId?: string | null
  onRefresh: () => void
  onOpenWarehouseChat?: (warehouseId: string, roomId: string, channelId: string) => void
}) {
  const batches = useMemo(() => summary.orderBatches || [], [summary.orderBatches])
  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      if (normalizeEventComandaBatchStatus(batch.status) === 'cancelled') {
        return false
      }
      if (
        warehouseFilter !== EVENT_COMANDA_WAREHOUSE_FILTER_ALL &&
        warehouseDocId(batch.warehouseId) !== warehouseFilter
      ) {
        return false
      }
      if (
        statusFilter !== EVENT_COMANDA_WAREHOUSE_FILTER_ALL &&
        normalizeEventComandaBatchStatus(batch.status) !== statusFilter
      ) {
        return false
      }
      return true
    })
  }, [batches, statusFilter, warehouseFilter])

  return (
    <div className="space-y-3">
      <div>
        <h2 className={typography('sectionTitle')}>
          {historyMode ? 'Historial de comanda enviada' : 'Comanda en curs al magatzem'}
        </h2>
        {historyMode ? (
          <p className={cn(typography('bodySm'), 'mt-1 text-slate-500')}>
            Consulta només lectura per comprovar línies, quantitats i entrega.
          </p>
        ) : null}
        {summary.orderComments ? (
          <p className={cn(typography('bodySm'), 'mt-1 text-slate-600')}>
            Comentaris: {summary.orderComments}
          </p>
        ) : null}
        {summary.orderUpdatedAt ? (
          <p className={cn(typography('bodySm'), 'mt-1 text-slate-500')}>
            Actualitzada{' '}
            {new Date(summary.orderUpdatedAt).toLocaleString('ca-ES')}
            {summary.orderUpdatedBy ? ` · ${summary.orderUpdatedBy}` : ''}
          </p>
        ) : null}
      </div>

      {batches.length === 0 ? (
        <p className={typography('bodySm')}>
          No hi ha comandes visibles per als teus magatzems assignats. Si esperaves veure material aquí,
          demana a l&apos;admin que et assigni el magatzem a Settings → Magatzems.
        </p>
      ) : filteredBatches.length === 0 ? (
        <p className={typography('bodySm')}>
          Cap lot coincideix amb els filtres seleccionats.
        </p>
      ) : (
        filteredBatches.map((batch) => (
          <WarehouseBatchPanel
            key={batch.batchId || batch.warehouseId}
            eventId={eventId}
            eventTitle={eventTitle}
            eventMeta={eventMeta}
            batch={batch}
            sentAt={summary.orderSentAt}
            sentBy={summary.orderSentBy}
            deliveryDate={summary.orderDeliveryDate}
            deliveryTimeSlot={summary.orderDeliveryTimeSlot}
            comments={summary.orderComments}
            canEdit={canPrepareComanda && !historyMode}
            canModifyOrder={canModifyOrder && !historyMode}
            historyMode={historyMode}
            currentUserId={currentUserId}
            orderSentByUserId={summary.orderSentByUserId}
            orderUpdatedByUserId={summary.orderUpdatedByUserId}
            onEditBatch={onEditBatch}
            onSaved={onRefresh}
            onOpenWarehouseChat={onOpenWarehouseChat}
          />
        ))
      )}
    </div>
  )
}

function WarehouseBatchPanel({
  eventId,
  eventTitle,
  eventMeta,
  batch,
  sentAt,
  sentBy,
  deliveryDate,
  deliveryTimeSlot,
  comments,
  canEdit,
  canModifyOrder,
  historyMode = false,
  currentUserId,
  orderSentByUserId,
  orderUpdatedByUserId,
  onEditBatch,
  onSaved,
  onOpenWarehouseChat,
}: {
  eventId: string
  eventTitle: string
  eventMeta?: string
  batch: EventComandaOrderBatch
  sentAt?: string | null
  sentBy?: string | null
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
  comments?: string | null
  canEdit: boolean
  canModifyOrder?: boolean
  historyMode?: boolean
  currentUserId?: string | null
  orderSentByUserId?: string | null
  orderUpdatedByUserId?: string | null
  onEditBatch?: (batch: EventComandaOrderBatch) => void
  onSaved: () => void
  onOpenWarehouseChat?: (warehouseId: string, roomId: string, channelId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [qtyByCode, setQtyByCode] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      batch.lines.map((line) => {
        const code = line.articleCode.toUpperCase()
        const prepared = line.qtyPrepared
        return [code, prepared == null ? '' : String(prepared)]
      })
    )
  )
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<ComandaLineSortKey>('code')
  const [sortDirection, setSortDirection] = useState<ComandaLineSortDirection>('asc')

  const parseQtyDraft = (raw: string) => {
    const trimmed = raw.trim().replace(',', '.')
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const buildLinesPayload = () =>
    batch.lines.map((line) => {
      const code = line.articleCode.toUpperCase()
      return {
        articleCode: line.articleCode,
        qtyPrepared: parseQtyDraft(qtyByCode[code] ?? ''),
      }
    })

  const hasPreparedQtyInDraft = (lines = buildLinesPayload()) =>
    lines.some((line) => line.qtyPrepared != null)

  const visibleBatchLines = useMemo(
    () => batch.lines.filter((line) => Number(line.qtyRequested) > 0),
    [batch.lines]
  )

  const sortedLines = useMemo(
    () => sortComandaLines(visibleBatchLines, [{ key: sortKey, direction: sortDirection }]),
    [visibleBatchLines, sortDirection, sortKey]
  )

  const batchCreatorId = useMemo(() => {
    const fromBatch = String(batch.createdByUserId || '').trim()
    if (fromBatch) return fromBatch
    if (batch.kind === 'revision') return String(orderUpdatedByUserId || '').trim()
    return String(orderSentByUserId || '').trim()
  }, [batch, orderSentByUserId, orderUpdatedByUserId])

  const canDeleteBatch =
    Boolean(currentUserId) &&
    !historyMode &&
    normalizeEventComandaBatchStatus(batch.status) === 'pending' &&
    batchCreatorId === String(currentUserId || '').trim()

  const resolvePreparedQtyForLine = (line: EventComandaOrderBatch['lines'][number]) => {
    const code = line.articleCode.toUpperCase()
    const fromDraft = parseQtyDraft(qtyByCode[code] ?? '')
    if (fromDraft != null) return fromDraft
    if (line.qtyPrepared != null) return line.qtyPrepared
    if (batch.status === 'ready' || batch.status === 'sent') return line.qtyRequested
    return null
  }

  const handleSort = (key: ComandaLineSortKey) => {
    const next = nextComandaLineSort(sortKey, sortDirection, key)
    setSortKey(next.key)
    setSortDirection(next.direction)
  }

  useEffect(() => {
    setQtyByCode((prev) => {
      const next = Object.fromEntries(
        batch.lines.map((line) => {
          const code = line.articleCode.toUpperCase()
          const prepared = line.qtyPrepared
          return [code, prepared == null ? '' : String(prepared)]
        })
      )

      let hasUnsavedDraft = false
      for (const line of batch.lines) {
        const code = line.articleCode.toUpperCase()
        const draft = parseQtyDraft(prev[code] ?? '')
        if ((line.qtyPrepared ?? null) !== draft) {
          hasUnsavedDraft = true
          break
        }
      }

      if (!hasUnsavedDraft) return next

      return Object.fromEntries(
        batch.lines.map((line) => {
          const code = line.articleCode.toUpperCase()
          const draft = prev[code]
          const draftQty = parseQtyDraft(draft ?? '')
          const savedQty = line.qtyPrepared ?? null
          if (draftQty != null && draftQty !== savedQty) {
            return [code, draft ?? '']
          }
          const prepared = line.qtyPrepared
          return [code, prepared == null ? '' : String(prepared)]
        })
      )
    })
  }, [batch])

  const qtyDirty = useMemo(
    () =>
      batch.lines.some((line) => {
        const code = line.articleCode.toUpperCase()
        const next = parseQtyDraft(qtyByCode[code] ?? '')
        return (line.qtyPrepared ?? null) !== next
      }),
    [batch.lines, qtyByCode]
  )

  const persistLines = async (opts?: {
    status?: EventComandaBatchStatus
    requireDirty?: boolean
  }): Promise<boolean> => {
    const lines = buildLinesPayload()
    const shouldSendLines = opts?.requireDirty === false || qtyDirty
    if (!shouldSendLines && !opts?.status) return true

    const shouldPromoteToInProgress =
      batch.status === 'pending' && hasPreparedQtyInDraft(lines) && !opts?.status

    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda/batch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warehouseId: batch.warehouseId,
        batchId: batchPanelId(batch),
        ...(shouldSendLines ? { lines } : {}),
        status:
          opts?.status ??
          (shouldPromoteToInProgress ? ('in_progress' as const) : undefined),
      }),
    })
    const json = (await res.json()) as { error?: string }
    if (!res.ok) {
      setSaveError(json.error || 'No s\'ha pogut desar la preparació.')
      return false
    }
    return true
  }

  const handleDownloadPdf = async () => {
    setExporting(true)
    try {
      const pdfBatch: EventComandaOrderBatch = {
        ...batch,
        lines: batch.lines.map((line) => ({
          ...line,
          qtyPrepared: resolvePreparedQtyForLine(line),
        })),
      }

      await exportEventComandaWarehousePrepPdf({
        eventId,
        eventTitle,
        eventMeta,
        batch: pdfBatch,
        sentAt,
        sentBy,
        deliveryDate,
        deliveryTimeSlot,
        comments,
      })
    } catch (error) {
      console.error('[WarehouseBatchPanel] PDF export failed', error)
      window.alert('No s\'ha pogut generar el PDF. Torna-ho a provar.')
    } finally {
      setExporting(false)
    }
  }

  const handleStatusSelect = async (next: EventComandaBatchStatus) => {
    if (!canEdit || next === batch.status) return
    setSaveError(null)
    setStatusSaving(true)
    try {
      if (qtyDirty) {
        const saved = await persistLines()
        if (!saved) return
        onSaved()
      }

      if (next === batch.status) return

      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/comanda/batch`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warehouseId: batch.warehouseId,
            batchId: batchPanelId(batch),
            status: next,
          }),
        }
      )
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSaveError(json.error || 'No s\'ha pogut actualitzar l\'estat.')
        return
      }
      void refreshNotificationSummary()
      onSaved()
    } catch {
      setSaveError('No s\'ha pogut actualitzar l\'estat.')
    } finally {
      setStatusSaving(false)
    }
  }

  const handleDelete = async () => {
    const label = warehouseLabel(batch)
    if (
      !window.confirm(
        `Eliminar la comanda de ${label}? Aquesta acció no es pot desfer.`
      )
    ) {
      return
    }

    setSaveError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda/batch`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: batch.warehouseId,
          batchId: batchPanelId(batch),
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSaveError(json.error || 'No s\'ha pogut eliminar la comanda.')
        return
      }
      onSaved()
    } catch {
      setSaveError('No s\'ha pogut eliminar la comanda.')
    } finally {
      setDeleting(false)
    }
  }

  const handleSave = async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const ok = await persistLines()
      if (!ok) return
      onSaved()
    } catch {
      setSaveError('No s\'ha pogut desar la preparació.')
    } finally {
      setSaving(false)
    }
  }

  const handleQtyInputChange = (code: string, value: string) => {
    setQtyByCode((prev) => ({ ...prev, [code]: value }))
  }

  const handleQtyInputBlur = async () => {
    if (!qtyInputsEditable || !qtyDirty) return

    setSaveError(null)
    setSaving(true)
    try {
      const ok = await persistLines()
      if (!ok) return
      onSaved()
    } catch {
      setSaveError('No s\'ha pogut desar la preparació.')
    } finally {
      setSaving(false)
    }
  }

  const deliveryLabel = formatOrderDeliverySummary({ deliveryDate, deliveryTimeSlot })
  const qtyInputsEditable = canEdit && batch.status !== 'ready' && batch.status !== 'sent'
  const showPrepWorkflow = qtyInputsEditable
  const modifiedLineCount = useMemo(() => countBatchLineChanges(batch), [batch])
  const scheduleLabel =
    deliveryLabel ||
    (sentAt
      ? new Date(sentAt).toLocaleString('ca-ES', {
          day: 'numeric',
          month: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '')
  const chatActive = isComandaWarehouseChatActive(batch.status)
  const chatClickable = Boolean(onOpenWarehouseChat) && (historyMode || chatActive)

  return (
    <div className={cn(eventComandaPanelClass, 'overflow-hidden p-0')}>
      <div className="flex w-full items-center gap-1 border-b border-slate-100 sm:gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left transition hover:bg-slate-50/80 sm:gap-3"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform',
              expanded && 'rotate-180'
            )}
          />
          <span
            className="min-w-0 truncate text-sm font-semibold text-slate-900"
            title={warehouseLabel(batch)}
          >
            {warehouseLabel(batch)}
          </span>
          <span className={cn(eventComandaBatchStatusBadgeClass(batch.status), 'shrink-0')}>
            {EVENT_COMANDA_BATCH_STATUS_LABELS[batch.status]}
          </span>
          {scheduleLabel ? (
            <span className="hidden min-w-0 truncate text-xs text-slate-500 sm:inline">
              {scheduleLabel}
            </span>
          ) : null}
        </button>
        <div className="mr-3 flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-slate-400">
            {visibleBatchLines.length}{' '}
            {visibleBatchLines.length === 1 ? 'línia' : 'línies'}
          </span>
          {canDeleteBatch ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Eliminar comanda"
              title="Eliminar comanda"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          ) : null}
          {onOpenWarehouseChat ? (
            <button
              type="button"
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm transition',
                chatClickable
                  ? 'border-slate-200 bg-white text-amber-600 hover:bg-amber-50'
                  : 'cursor-default border-slate-100 bg-slate-50 text-slate-300'
              )}
              aria-label={
                historyMode
                  ? `Consultar conversa de comanda per a ${warehouseLabel(batch)}`
                  : chatActive
                    ? `Obrir xat de comanda per a ${warehouseLabel(batch)}`
                    : `Xat tancat per a ${warehouseLabel(batch)}`
              }
              title={
                historyMode
                  ? 'Consultar conversa'
                  : chatActive
                    ? 'Obrir xat'
                    : 'Xat tancat — comanda enviada'
              }
              disabled={!chatClickable}
              onClick={() => {
                if (!chatClickable) return
                const warehouseKey = warehouseDocId(batch.warehouseId)
                onOpenWarehouseChat(warehouseKey, buildEventComandaRoomIdFromBatch(batch), resolveEventComandaBatchChannelId(eventId, batch))
              }}
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {scheduleLabel ? (
        <p className="px-4 pb-2 text-xs text-slate-500 sm:hidden">{scheduleLabel}</p>
      ) : null}

      {expanded ? (
        <>
          <div className="space-y-2 border-b border-slate-100 px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {!historyMode ? (
                <EventComandaBatchStatusBadges
                  value={batch.status}
                  onSelect={canEdit ? (next) => void handleStatusSelect(next) : undefined}
                  saving={statusSaving}
                  preparerMode={canEdit}
                  className="min-w-0 flex-1 gap-1.5"
                />
              ) : null}
              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                {canModifyOrder && onEditBatch && batch.status !== 'cancelled' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => onEditBatch(batch)}
                  >
                    <PenLine className="h-4 w-4 shrink-0" />
                    Modificar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={exporting}
                  onClick={() => void handleDownloadPdf()}
                >
                  <Download className="h-4 w-4 shrink-0" />
                  {exporting ? 'Generant…' : 'PDF'}
                </Button>
                {showPrepWorkflow ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={!qtyDirty || saving}
                    onClick={() => void handleSave()}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? 'Desant…' : 'Desar preparació'}
                  </Button>
                ) : null}
              </div>
            </div>

            {(() => {
              const metaParts: Array<{ key: string; node: ReactNode }> = []
              if (deliveryLabel) {
                metaParts.push({
                  key: 'delivery',
                  node: (
                    <span className="shrink-0">
                      <span className="font-medium text-slate-700">Entrega:</span> {deliveryLabel}
                    </span>
                  ),
                })
              }
              if (
                batch.statusUpdatedBy &&
                (batch.status === 'ready' || batch.status === 'sent')
              ) {
                metaParts.push({
                  key: 'preparer',
                  node: (
                    <span className="shrink-0">
                      <span className="font-medium text-slate-700">Preparador:</span>{' '}
                      {batch.statusUpdatedBy}
                    </span>
                  ),
                })
              }
              if (!historyMode && batch.status === 'ready') {
                metaParts.push({
                  key: 'ready-hint',
                  node: (
                    <span className="text-emerald-800">
                      Marca <strong>Enviada</strong> en sortir
                    </span>
                  ),
                })
              }
              if (comments) {
                metaParts.push({
                  key: 'comments',
                  node: (
                    <span className="min-w-0 truncate" title={comments}>
                      <span className="font-medium text-slate-700">Comentaris:</span> {comments}
                    </span>
                  ),
                })
              }
              if (historyMode && modifiedLineCount > 0) {
                metaParts.push({
                  key: 'modifications',
                  node: (
                    <span className="font-medium text-amber-800">
                      {modifiedLineCount}{' '}
                      {modifiedLineCount === 1 ? 'modificació' : 'modificacions'}
                    </span>
                  ),
                })
              }
              if (!metaParts.length) return null
              return (
                <div
                  className={cn(
                    typography('bodySm'),
                    'flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600'
                  )}
                >
                  {metaParts.map((part, index) => (
                    <span key={part.key} className="inline-flex items-center gap-2">
                      {index > 0 ? (
                        <span className="text-slate-300" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {part.node}
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>

          {saveError ? (
            <p className="px-4 pt-3 text-sm text-red-600">{saveError}</p>
          ) : null}

          <div className="overflow-x-auto px-1 pb-1">
        <table className={eventComandaTableClass}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <EventComandaSortableTh
                label="Codi"
                sortKey="code"
                sortStack={[{ key: sortKey, direction: sortDirection }]}
                onSort={handleSort}
              />
              <EventComandaSortableTh
                label="Article"
                sortKey="name"
                sortStack={[{ key: sortKey, direction: sortDirection }]}
                onSort={handleSort}
              />
              <EventComandaSortableTh
                label="Demanat"
                sortKey="qty"
                sortStack={[{ key: sortKey, direction: sortDirection }]}
                onSort={handleSort}
                align="right"
              />
              <th className={cn(eventComandaTableHeadCellClass, 'text-right')}>Preparat</th>
              <th className={cn(eventComandaTableHeadCellClass, 'w-16 text-right')}>U.</th>
            </tr>
          </thead>
          <tbody>
            {sortedLines.map((line) => {
              const code = line.articleCode.toUpperCase()
              const qtyValue = qtyByCode[code] ?? ''
              const preparedQty = resolvePreparedQtyForLine(line)
              const mismatch =
                preparedQty != null &&
                Number.isFinite(preparedQty) &&
                preparedQty !== line.qtyRequested
              const changeKind = batchLineChangeKind(line, batch.kind)
              const isModified = Boolean(changeKind)
              const hadQtyChange =
                line.qtyRequestedBefore != null &&
                Number(line.qtyRequestedBefore) !== Number(line.qtyRequested)

              return (
                <tr
                  key={`${batchPanelId(batch)}-${line.articleCode}`}
                  className={cn(eventComandaTableRowClass, isModified && 'bg-amber-50/80')}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{line.articleCode}</td>
                  <td className={cn(typography('bodyMd'), 'px-3 py-2 break-words')}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{line.articleName}</span>
                      {isModified ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          {changeKind === 'added' ? 'Afegida' : 'Modificada'}
                        </span>
                      ) : null}
                    </div>
                    {changeKind === 'modified' && hadQtyChange ? (
                      <p className="mt-0.5 text-xs text-amber-700">
                        Abans:{' '}
                        {formatEventComandaQty(
                          Number(line.qtyRequestedBefore),
                          line.qtyUnit
                        )}
                      </p>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums text-sm',
                      isModified ? 'font-semibold text-amber-900' : 'text-slate-700'
                    )}
                  >
                    {formatEventComandaQty(line.qtyRequested, line.qtyUnit)}
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    {qtyInputsEditable ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={qtyValue}
                        placeholder={String(line.qtyRequested)}
                        onChange={(e) => handleQtyInputChange(code, e.target.value)}
                        onBlur={() => void handleQtyInputBlur()}
                        disabled={saving || statusSaving}
                        className={cn(
                          'ml-auto h-9 w-[5.5rem] text-right tabular-nums',
                          mismatch && 'border-amber-300 bg-amber-50/60'
                        )}
                        aria-label={`Quantitat preparada de ${line.articleName}`}
                      />
                    ) : (
                      <span
                        className={cn(
                          'text-sm tabular-nums',
                          mismatch ? 'font-semibold text-amber-800' : 'text-slate-700'
                        )}
                      >
                        {preparedQty == null
                          ? '—'
                          : formatEventComandaQty(preparedQty, line.qtyUnit)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-600">
                    {eventComandaQtyUnit(line.qtyUnit)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
          </div>
        </>
      ) : null}
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
