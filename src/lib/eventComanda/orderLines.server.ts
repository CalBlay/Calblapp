import type {
  EventComandaBatchStatus,
  EventComandaOrderBatch,
  EventComandaOrderBatchLine,
} from '@/lib/eventComanda/types'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'

export type ModifiedLineNotice = {
  articleCode: string
  articleName: string
  qtyRequested: number
  qtyRequestedBefore?: number | null
  qtyUnit?: string
}

export type OrderUpdateNotification = {
  batchId: string
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  variant: 'modified_in_progress' | 'revision'
  modifiedLines: ModifiedLineNotice[]
}

export type OrderUpdateApplyResult = {
  batches: EventComandaOrderBatch[]
  notifications: OrderUpdateNotification[]
}

function batchIdentity(batch: EventComandaOrderBatch) {
  return String(batch.batchId || batch.warehouseId || '').trim()
}

function normalizeBatch(batch: EventComandaOrderBatch): EventComandaOrderBatch {
  const warehouseKey = warehouseDocId(batch.warehouseId)
  return {
    ...batch,
    batchId: batchIdentity(batch) || warehouseKey,
    kind: batch.kind === 'revision' ? 'revision' : 'primary',
    warehouseId: warehouseKey || batch.warehouseId,
  }
}

function lineCode(line: { articleCode: string }) {
  return String(line.articleCode || '').trim().toUpperCase()
}

function linesByCode(lines: EventComandaOrderBatchLine[]) {
  return new Map(lines.map((line) => [lineCode(line), line]))
}

function mergeLinePreservingPrep(
  next: EventComandaOrderBatchLine,
  previous?: EventComandaOrderBatchLine,
  mark?: { at: number; by: string | null; before: number | null }
): EventComandaOrderBatchLine {
  return {
    ...next,
    qtyPrepared: previous?.qtyPrepared ?? null,
    modifiedAt: mark?.at ?? null,
    modifiedBy: mark?.by ?? null,
    qtyRequestedBefore: mark ? mark.before : null,
  }
}

function detectModifiedLines(
  previousLines: EventComandaOrderBatchLine[],
  nextLines: EventComandaOrderBatchLine[]
): ModifiedLineNotice[] {
  const prevByCode = linesByCode(previousLines)
  const modified: ModifiedLineNotice[] = []

  for (const nextLine of nextLines) {
    const code = lineCode(nextLine)
    const prevLine = prevByCode.get(code)
    if (!prevLine) {
      modified.push({
        articleCode: nextLine.articleCode,
        articleName: nextLine.articleName,
        qtyRequested: nextLine.qtyRequested,
        qtyRequestedBefore: null,
        qtyUnit: nextLine.qtyUnit,
      })
      continue
    }
    if (Number(prevLine.qtyRequested) !== Number(nextLine.qtyRequested)) {
      modified.push({
        articleCode: nextLine.articleCode,
        articleName: nextLine.articleName,
        qtyRequested: nextLine.qtyRequested,
        qtyRequestedBefore: prevLine.qtyRequested,
        qtyUnit: nextLine.qtyUnit,
      })
    }
  }

  for (const prevLine of previousLines) {
    const code = lineCode(prevLine)
    if (!nextLines.some((line) => lineCode(line) === code)) {
      modified.push({
        articleCode: prevLine.articleCode,
        articleName: prevLine.articleName,
        qtyRequested: 0,
        qtyRequestedBefore: prevLine.qtyRequested,
        qtyUnit: prevLine.qtyUnit,
      })
    }
  }

  return modified
}

function buildRevisionBatchId(warehouseId: string, revisionIndex: number) {
  return `${warehouseDocId(warehouseId)}__rev_${revisionIndex}`
}

function computeRevisionLines(
  readyLines: EventComandaOrderBatchLine[],
  desiredLines: EventComandaOrderBatchLine[]
) {
  const readyByCode = linesByCode(readyLines)
  const revisionLines: EventComandaOrderBatchLine[] = []

  for (const desired of desiredLines) {
    const code = lineCode(desired)
    const readyLine = readyByCode.get(code)
    if (!readyLine) {
      revisionLines.push({ ...desired, qtyPrepared: null })
      continue
    }
    if (Number(readyLine.qtyRequested) !== Number(desired.qtyRequested)) {
      revisionLines.push({ ...desired, qtyPrepared: null })
    }
  }

  for (const readyLine of readyLines) {
    const code = lineCode(readyLine)
    if (!desiredLines.some((line) => lineCode(line) === code)) {
      revisionLines.push({
        ...readyLine,
        qtyRequested: 0,
        qtyPrepared: null,
      })
    }
  }

  return revisionLines
}

/** Només línies noves o amb quantitat canviada (comanda addicional), sense marcar la resta a 0. */
function buildAdditionalOnlyRevisionLines(
  baselineLines: EventComandaOrderBatchLine[],
  incomingLines: EventComandaOrderBatchLine[]
) {
  const baselineByCode = linesByCode(baselineLines)
  const revisionLines: EventComandaOrderBatchLine[] = []

  for (const line of incomingLines) {
    if (Number(line.qtyRequested) <= 0) continue
    const base = baselineByCode.get(lineCode(line))
    if (!base || Number(base.qtyRequested) !== Number(line.qtyRequested)) {
      revisionLines.push({ ...line, qtyPrepared: null })
    }
  }

  return revisionLines
}

export function applyOrderUpdate(params: {
  nextBatches: EventComandaOrderBatch[]
  previousBatches: EventComandaOrderBatch[] | undefined
  updatedBy?: string | null
  updatedByUserId?: string | null
  targetBatchId?: string
}): OrderUpdateApplyResult {
  const now = Date.now()
  const updatedBy = params.updatedBy ?? null
  const updatedByUserId = params.updatedByUserId ?? null
  const previous = (params.previousBatches || []).map(normalizeBatch)
  const previousByWarehouse = new Map<string, EventComandaOrderBatch[]>()

  for (const batch of previous) {
    const key = warehouseDocId(batch.warehouseId)
    const list = previousByWarehouse.get(key) || []
    list.push(batch)
    previousByWarehouse.set(key, list)
  }

  const resultBatches: EventComandaOrderBatch[] = []
  const notifications: OrderUpdateNotification[] = []
  const handledWarehouses = new Set<string>()

  for (const rawNext of params.nextBatches) {
    const next = normalizeBatch({ ...rawNext, kind: 'primary' })
    const warehouseKey = warehouseDocId(next.warehouseId)
    handledWarehouses.add(warehouseKey)

    const existing = previousByWarehouse.get(warehouseKey) || []
    const targetBatchId = String(params.targetBatchId || '').trim()
    const targetBatch = targetBatchId
      ? existing.find((batch) => batchIdentity(batch) === targetBatchId) || null
      : null

    if (
      targetBatch?.kind === 'revision' &&
      targetBatch.status !== 'ready' &&
      targetBatch.status !== 'sent' &&
      targetBatch.status !== 'cancelled'
    ) {
      const modifiedLines = detectModifiedLines(targetBatch.lines, next.lines)
      const prevByCode = linesByCode(targetBatch.lines)
      const mergedLines = next.lines.map((line) => {
        const prev = prevByCode.get(lineCode(line))
        const changed =
          !prev || Number(prev.qtyRequested) !== Number(line.qtyRequested)
        return mergeLinePreservingPrep(
          line,
          prev,
          changed
            ? {
                at: now,
                by: updatedBy,
                before: prev?.qtyRequested ?? null,
              }
            : undefined
        )
      })

      for (const batch of existing) {
        if (batchIdentity(batch) === batchIdentity(targetBatch)) {
          resultBatches.push({
            ...targetBatch,
            lines: mergedLines,
            statusUpdatedAt: modifiedLines.length ? now : targetBatch.statusUpdatedAt ?? null,
          })
        } else {
          resultBatches.push(batch)
        }
      }

      if (modifiedLines.length) {
        notifications.push({
          batchId: batchIdentity(targetBatch),
          warehouseId: targetBatch.warehouseId,
          warehouseCode: targetBatch.warehouseCode,
          warehouseName: targetBatch.warehouseName,
          variant: 'revision',
          modifiedLines,
        })
      }
      continue
    }

    const primary =
      targetBatch && targetBatch.kind !== 'revision'
        ? targetBatch
        : existing.find((batch) => batch.kind !== 'revision') ||
          existing[0] ||
          null
    const readyBatches = existing.filter((batch) => batch.status === 'ready')
    const openRevisions = existing.filter(
      (batch) =>
        batch.kind === 'revision' &&
        batch.status !== 'ready' &&
        batch.status !== 'cancelled'
    )
    const frozenReady = readyBatches.flatMap((batch) => batch.lines)

    if (!primary) {
      const created: EventComandaOrderBatch = {
        ...next,
        batchId: warehouseKey,
        kind: 'primary',
        status: 'pending',
        createdByUserId: updatedByUserId,
        createdByUserName: updatedBy,
      }
      resultBatches.push(created)
      notifications.push({
        batchId: batchIdentity(created),
        warehouseId: next.warehouseId,
        warehouseCode: next.warehouseCode,
        warehouseName: next.warehouseName,
        variant: 'revision',
        modifiedLines: next.lines.map((line) => ({
          articleCode: line.articleCode,
          articleName: line.articleName,
          qtyRequested: line.qtyRequested,
          qtyRequestedBefore: null,
          qtyUnit: line.qtyUnit,
        })),
      })
      continue
    }

    const primaryStatus = primary.status

    if (primaryStatus === 'pending') {
      resultBatches.push({
        ...primary,
        ...next,
        batchId: batchIdentity(primary),
        kind: 'primary',
        status: 'pending',
        lines: next.lines.map((line) => mergeLinePreservingPrep(line, undefined)),
      })
      for (const revision of openRevisions) {
        resultBatches.push(revision)
      }
      for (const ready of readyBatches) {
        if (!resultBatches.some((batch) => batchIdentity(batch) === batchIdentity(ready))) {
          resultBatches.push(ready)
        }
      }
      continue
    }

    if (primaryStatus === 'in_progress' || primaryStatus === 'issue') {
      const prevByCode = linesByCode(primary.lines)
      const modifiedLines = detectModifiedLines(primary.lines, next.lines)
      const mergedLines = next.lines.map((line) => {
        const prev = prevByCode.get(lineCode(line))
        const changed =
          !prev || Number(prev.qtyRequested) !== Number(line.qtyRequested)
        return mergeLinePreservingPrep(
          line,
          prev,
          changed
            ? {
                at: now,
                by: updatedBy,
                before: prev?.qtyRequested ?? null,
              }
            : undefined
        )
      })

      resultBatches.push({
        ...primary,
        ...next,
        batchId: batchIdentity(primary),
        kind: 'primary',
        status: primaryStatus === 'issue' && modifiedLines.length ? 'in_progress' : primaryStatus,
        lines: mergedLines,
        statusUpdatedAt: modifiedLines.length ? now : primary.statusUpdatedAt ?? null,
      })

      if (modifiedLines.length) {
        notifications.push({
          batchId: batchIdentity(primary),
          warehouseId: primary.warehouseId,
          warehouseCode: primary.warehouseCode,
          warehouseName: primary.warehouseName,
          variant: 'modified_in_progress',
          modifiedLines,
        })
      }

      for (const revision of openRevisions) {
        resultBatches.push(revision)
      }
      for (const ready of readyBatches) {
        resultBatches.push(ready)
      }
      continue
    }

    if (primaryStatus === 'ready' || primaryStatus === 'sent' || primaryStatus === 'cancelled') {
      resultBatches.push(primary)
      for (const ready of readyBatches) {
        if (batchIdentity(ready) !== batchIdentity(primary)) {
          resultBatches.push(ready)
        }
      }

      const revisionLines = targetBatchId
        ? computeRevisionLines(frozenReady.length ? frozenReady : primary.lines, next.lines)
        : buildAdditionalOnlyRevisionLines(
            frozenReady.length ? frozenReady : primary.lines,
            next.lines
          )
      if (!revisionLines.length) {
        for (const revision of openRevisions) {
          resultBatches.push(revision)
        }
        continue
      }

      const openRevision = openRevisions[0]
      if (openRevision && openRevision.status === 'pending') {
        const modifiedLines = detectModifiedLines(openRevision.lines, revisionLines)
        resultBatches.push({
          ...openRevision,
          lines: revisionLines.map((line) => mergeLinePreservingPrep(line, undefined)),
          status: 'pending',
        })
        for (const revision of openRevisions.slice(1)) {
          resultBatches.push(revision)
        }
        if (modifiedLines.length) {
          notifications.push({
            batchId: batchIdentity(openRevision),
            warehouseId: openRevision.warehouseId,
            warehouseCode: openRevision.warehouseCode,
            warehouseName: openRevision.warehouseName,
            variant: 'revision',
            modifiedLines,
          })
        }
        continue
      }

      const revisionIndex = existing.filter((batch) => batch.kind === 'revision').length + 1
      const revisionBatch: EventComandaOrderBatch = {
        batchId: buildRevisionBatchId(primary.warehouseId, revisionIndex),
        kind: 'revision',
        warehouseId: primary.warehouseId,
        warehouseCode: primary.warehouseCode,
        warehouseName: primary.warehouseName,
        status: 'pending',
        statusUpdatedAt: now,
        statusUpdatedBy: updatedBy,
        createdByUserId: updatedByUserId,
        createdByUserName: updatedBy,
        lines: revisionLines.map((line) => mergeLinePreservingPrep(line, undefined)),
      }
      resultBatches.push(revisionBatch)
      for (const revision of openRevisions) {
        resultBatches.push(revision)
      }

      notifications.push({
        batchId: batchIdentity(revisionBatch),
        warehouseId: revisionBatch.warehouseId,
        warehouseCode: revisionBatch.warehouseCode,
        warehouseName: revisionBatch.warehouseName,
        variant: 'revision',
        modifiedLines: revisionLines.map((line) => ({
          articleCode: line.articleCode,
          articleName: line.articleName,
          qtyRequested: line.qtyRequested,
          qtyRequestedBefore:
            frozenReady.find((readyLine) => lineCode(readyLine) === lineCode(line))?.qtyRequested ??
            null,
          qtyUnit: line.qtyUnit,
        })),
      })
      continue
    }

    resultBatches.push({
      ...primary,
      ...next,
      batchId: batchIdentity(primary),
      kind: 'primary',
      lines: next.lines.map((line) =>
        mergeLinePreservingPrep(line, linesByCode(primary.lines).get(lineCode(line)))
      ),
    })
  }

  for (const batch of previous) {
    const key = warehouseDocId(batch.warehouseId)
    if (handledWarehouses.has(key)) continue
    resultBatches.push(batch)
  }

  return { batches: resultBatches, notifications }
}

/** Afegeix línies noves a un altre magatzem (crea lot o fusiona amb l'existent). */
export function applyAdditionalWarehouseLines(params: {
  batches: EventComandaOrderBatch[]
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  incomingLines: EventComandaOrderBatchLine[]
  updatedBy?: string | null
  createdByUserId?: string | null
}): OrderUpdateApplyResult {
  const warehouseKey = warehouseDocId(params.warehouseId)
  const incoming = params.incomingLines.filter((line) => Number(line.qtyRequested) > 0)
  if (!incoming.length) {
    return { batches: params.batches, notifications: [] }
  }

  const existingForWh = params.batches.filter(
    (batch) => warehouseDocId(batch.warehouseId) === warehouseKey
  )
  const primary =
    existingForWh.find((batch) => batch.kind !== 'revision') || existingForWh[0] || null

  const nextBatch: EventComandaOrderBatch = !primary
    ? {
        batchId: warehouseKey,
        kind: 'primary',
        warehouseId: warehouseKey,
        warehouseCode: params.warehouseCode,
        warehouseName: params.warehouseName,
        status: 'pending',
        createdByUserId: params.createdByUserId ?? null,
        createdByUserName: params.updatedBy ?? null,
        lines: incoming,
      }
    : {
        ...primary,
        warehouseId: warehouseKey,
        warehouseCode: primary.warehouseCode || params.warehouseCode,
        warehouseName: primary.warehouseName || params.warehouseName,
        lines: [
          ...primary.lines,
          ...incoming.filter(
            (line) => !linesByCode(primary.lines).has(lineCode(line))
          ),
        ],
      }

  return applyOrderUpdate({
    nextBatches: [nextBatch],
    previousBatches: params.batches,
    updatedBy: params.updatedBy,
    updatedByUserId: params.createdByUserId,
  })
}

export function clearBatchLineModifications(batch: EventComandaOrderBatch): EventComandaOrderBatch {
  return {
    ...batch,
    lines: batch.lines.map((line) => ({
      ...line,
      modifiedAt: null,
      modifiedBy: null,
      qtyRequestedBefore: null,
    })),
  }
}

/** @deprecated Usa applyOrderUpdate */
export function mergeBatchesOnOrderUpdate(
  nextBatches: EventComandaOrderBatch[],
  previousBatches: EventComandaOrderBatch[] | undefined
): EventComandaOrderBatch[] {
  return applyOrderUpdate({ nextBatches, previousBatches }).batches
}
