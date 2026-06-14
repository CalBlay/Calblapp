import { NextResponse } from 'next/server'
import { upsertArticlesFromLines } from '@/lib/eventComanda/articles.server'
import { hasEventComandaCreateAccess, hasEventsComandaPreparerOnlyAccess } from '@/lib/eventComanda/permissionsAccess.server'
import { eventComandaAccessUserFromSession } from '@/lib/eventComanda/eventComandaApiAuth'
import { mergeDuplicateErpLines, articleCodePrefix, eventComandaQtyUnit, sortFamilies, type ParsedErpLine } from '@/lib/eventComanda/parseErpExcel'
import {
  getEventComandaTemplate,
  saveEventComandaTemplate,
} from '@/lib/eventComanda/template.server'
import {
  getEventComandaOrder,
  orderToComandaStatus,
  sendEventComandaOrder,
  updateEventComandaOrder,
} from '@/lib/eventComanda/order.server'
import {
  filterBatchesForPreparerView,
  filterBatchesForPreparerHistoryView,
  listWarehouseIdsForUser,
} from '@/lib/eventComanda/warehouseMembers.server'
import {
  getEventComandaEventInfo,
} from '@/lib/eventComanda/eventDeliveryBounds.server'
import type { EventComandaSummary, EventComandaLine, EventComandaOrderLine } from '@/lib/eventComanda/types'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

function buildSummary(
  eventId: string,
  template: Awaited<ReturnType<typeof getEventComandaTemplate>>,
  order: Awaited<ReturnType<typeof getEventComandaOrder>>,
  viewer?: { userId: string; role: string; assignedWarehouseIds: string[] },
  options?: { filterBatches?: boolean; historyMode?: boolean },
  eventDates?: {
    eventStartDate: string | null
    eventEndDate: string | null
    eventTitle: string | null
    eventMeta: string | null
  }
): EventComandaSummary {
  const hasTemplate = Boolean(template?.lineCount)
  const status = orderToComandaStatus(order, hasTemplate)
  const linesByFamily: Record<string, EventComandaLine[]> = {}

  if (template?.lines?.length) {
    for (const line of template.lines) {
      const family = articleCodePrefix(line.articleCode)
      linesByFamily[family] ||= []
      linesByFamily[family].push({
        articleCode: line.articleCode,
        articleName: line.articleName,
        family,
        qtyInitial: line.qtyInitial,
        qtyUnit: eventComandaQtyUnit(line.qtyUnit),
      })
    }
    for (const family of Object.keys(linesByFamily)) {
      linesByFamily[family].sort((a, b) => a.articleCode.localeCompare(b.articleCode))
    }
  }

  const visibleBatches =
    options?.filterBatches && viewer
      ? options.historyMode
        ? filterBatchesForPreparerHistoryView(order?.batches, {
            userId: viewer.userId,
            role: viewer.role,
            assignedWarehouseIds: viewer.assignedWarehouseIds,
          })
        : filterBatchesForPreparerView(order?.batches, {
            userId: viewer.userId,
            role: viewer.role,
            assignedWarehouseIds: viewer.assignedWarehouseIds,
          })
      : order?.batches

  return {
    eventId,
    status,
    templateImportedAt: template?.importedAt
      ? new Date(template.importedAt).toISOString()
      : null,
    templateLineCount: template?.lineCount ?? 0,
    templateFamilyCount: template?.familyCount ?? 0,
    templateTotalQty: template?.totalQty ?? 0,
    templateFileName: template?.sourceFileName ?? null,
    templateVersion: template?.version ?? 0,
    templateDateRangeLabel: template?.dateRangeLabel ?? null,
    linesByFamily: Object.keys(linesByFamily).length ? linesByFamily : undefined,
    importWarnings: template?.warnings?.length ? template.warnings : undefined,
    eventTitle: eventDates?.eventTitle ?? null,
    eventMeta: eventDates?.eventMeta ?? null,
    orderSentAt: order?.sentAt ? new Date(order.sentAt).toISOString() : null,
    orderSentBy: order?.sentByUserName ?? null,
    orderSentByUserId: order?.sentByUserId ?? null,
    orderUpdatedAt: order?.updatedAt ? new Date(order.updatedAt).toISOString() : null,
    orderUpdatedBy: order?.updatedByUserName ?? null,
    orderUpdatedByUserId: order?.updatedByUserId ?? null,
    orderDeliveryDate: order?.deliveryDate ?? null,
    orderDeliveryTimeSlot: order?.deliveryTimeSlot ?? null,
    orderComments: order?.comments ?? null,
    eventStartDate: eventDates?.eventStartDate ?? null,
    eventEndDate: eventDates?.eventEndDate ?? null,
    orderLineCount: visibleBatches?.reduce((sum, batch) => sum + batch.lines.length, 0) ?? order?.lineCount ?? 0,
    orderBatchCount: visibleBatches?.length ?? order?.batchCount ?? 0,
    orderBatches: visibleBatches?.length ? visibleBatches : undefined,
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const historyMode = new URL(req.url).searchParams.get('history') === '1'

  const template = await getEventComandaTemplate(eventId)
  const order = await getEventComandaOrder(eventId)
  const assignedWarehouseIds = await listWarehouseIdsForUser(auth.user.id)
  const preparerOnly = await hasEventsComandaPreparerOnlyAccess(
    eventComandaAccessUserFromSession(auth.user)
  )

  if (preparerOnly) {
    const viewer = {
      userId: auth.user.id,
      role: normalizeRole(auth.user.role),
      assignedWarehouseIds,
    }
    const filterBatches = historyMode
      ? filterBatchesForPreparerHistoryView(order?.batches, viewer)
      : filterBatchesForPreparerView(order?.batches, viewer)
    if (!order?.sentAt || !filterBatches?.length) {
      return NextResponse.json({ error: 'Comanda no disponible.' }, { status: 403 })
    }
  }

  const viewer = {
    userId: auth.user.id,
    role: normalizeRole(auth.user.role),
    assignedWarehouseIds,
  }

  const eventInfo = await getEventComandaEventInfo(eventId)

  const summary = buildSummary(eventId, template, order, viewer, {
    filterBatches: preparerOnly,
    historyMode: preparerOnly && historyMode,
  }, eventInfo)

  if (preparerOnly) {
    return NextResponse.json({
      ...summary,
      linesByFamily: undefined,
      templateImportedAt: null,
      templateLineCount: 0,
      templateFamilyCount: 0,
      templateTotalQty: 0,
      templateFileName: null,
      templateVersion: 0,
      templateDateRangeLabel: null,
      importWarnings: undefined,
    })
  }

  return NextResponse.json(summary)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const accessUser = eventComandaAccessUserFromSession(auth.user)
  const preparerOnly = await hasEventsComandaPreparerOnlyAccess(accessUser)
  if (preparerOnly) {
    return NextResponse.json({ error: 'Sense permís per importar plantilles.' }, { status: 403 })
  }

  const canCreate = await hasEventComandaCreateAccess(accessUser)
  if (!canCreate) {
    return NextResponse.json({ error: 'Sense permís per crear comandes.' }, { status: 403 })
  }

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const body = (await req.json()) as {
    fileName?: string
    dateRangeLabel?: string
    families?: string[]
    lines?: ParsedErpLine[]
    warnings?: string[]
  }

  const fileName = String(body.fileName || '').trim()
  const lines = Array.isArray(body.lines) ? body.lines : []
  const families = Array.isArray(body.families) ? body.families.filter(Boolean) : []

  if (!fileName) {
    return NextResponse.json({ error: 'Cal el nom del fitxer.' }, { status: 400 })
  }
  if (lines.length === 0) {
    return NextResponse.json({ error: 'No hi ha línies per importar.' }, { status: 400 })
  }

  const sanitizedLines = mergeDuplicateErpLines(
    lines
      .map((line) => {
        const articleCode = String(line.articleCode || '').trim().toUpperCase()
        return {
          articleCode,
          articleName: String(line.articleName || '').trim(),
          family: articleCodePrefix(articleCode),
          qtyInitial: Number(line.qtyInitial),
          qtyUnit: eventComandaQtyUnit(String(line.qtyUnit || '')),
        }
      })
      .filter(
        (line) =>
          line.articleCode &&
          line.articleName &&
          Number.isFinite(line.qtyInitial) &&
          line.qtyInitial > 0
      )
  )

  const derivedFamilies = sortFamilies(
    Array.from(new Set(sanitizedLines.map((line) => line.family)))
  )

  if (sanitizedLines.length === 0) {
    return NextResponse.json({ error: 'Cap línia vàlida per importar.' }, { status: 400 })
  }

  const userId = String(auth.user?.id || '').trim()
  const userName = String(auth.user?.name || '').trim()

  const articleStats = await upsertArticlesFromLines(sanitizedLines, userId)
  const template = await saveEventComandaTemplate({
    eventId,
    fileName,
    dateRangeLabel: body.dateRangeLabel,
    families: families.length ? families : derivedFamilies,
    lines: sanitizedLines,
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
    userId,
    userName,
  })

  return NextResponse.json({
    ok: true,
    summary: buildSummary(
      eventId,
      template,
      await getEventComandaOrder(eventId),
      {
        userId: auth.user.id,
        role: normalizeRole(auth.user.role),
        assignedWarehouseIds: await listWarehouseIdsForUser(auth.user.id),
      },
      undefined,
      await getEventComandaEventInfo(eventId)
    ),
    articleStats,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const accessUser = eventComandaAccessUserFromSession(auth.user)
  const preparerOnly = await hasEventsComandaPreparerOnlyAccess(accessUser)
  if (preparerOnly) {
    return NextResponse.json({ error: 'Sense permís per enviar comandes.' }, { status: 403 })
  }

  const canCreate = await hasEventComandaCreateAccess(accessUser)
  if (!canCreate) {
    return NextResponse.json({ error: 'Sense permís per enviar comandes.' }, { status: 403 })
  }

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const body = (await req.json()) as {
    action?: string
    lines?: EventComandaOrderLine[]
    deliveryDate?: string
    deliveryTimeSlot?: string
    comments?: string
    warehouseId?: string
    batchId?: string
  }

  if (body.action !== 'send' && body.action !== 'update') {
    return NextResponse.json({ error: 'Acció no vàlida.' }, { status: 400 })
  }

  const lines = Array.isArray(body.lines) ? body.lines : []
  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cal afegir línies a la comanda.' }, { status: 400 })
  }

  const userId = String(auth.user?.id || '').trim()
  const userName = String(auth.user?.name || '').trim()

  try {
    const common = {
      eventId,
      lines,
      deliveryDate: body.deliveryDate,
      deliveryTimeSlot: body.deliveryTimeSlot,
      comments: body.comments,
      userId,
      userName,
      eventTitle: undefined as string | null | undefined,
    }

    const order =
      body.action === 'update'
        ? await updateEventComandaOrder({
            ...common,
            warehouseId: body.warehouseId,
            batchId: body.batchId,
          })
        : await sendEventComandaOrder({
            ...common,
            deliveryDate: String(body.deliveryDate || '').trim(),
            deliveryTimeSlot: String(body.deliveryTimeSlot || '').trim(),
          })
    const template = await getEventComandaTemplate(eventId)
    const eventInfo = await getEventComandaEventInfo(eventId)
    return NextResponse.json({
      ok: true,
      summary: buildSummary(eventId, template, order, {
        userId: auth.user.id,
        role: normalizeRole(auth.user.role),
        assignedWarehouseIds: await listWarehouseIdsForUser(auth.user.id),
      }, { filterBatches: false }, eventInfo),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error en enviar la comanda.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
