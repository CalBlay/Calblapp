import { NextResponse } from 'next/server'
import { upsertArticlesFromLines } from '@/lib/eventComanda/articles.server'
import { mergeDuplicateErpLines, articleCodePrefix, eventComandaQtyUnit, sortFamilies, type ParsedErpLine } from '@/lib/eventComanda/parseErpExcel'
import {
  getEventComandaTemplate,
  saveEventComandaTemplate,
  templateToStatus,
} from '@/lib/eventComanda/template.server'
import type { EventComandaSummary, EventComandaLine } from '@/lib/eventComanda/types'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

function buildSummary(eventId: string, template: Awaited<ReturnType<typeof getEventComandaTemplate>>): EventComandaSummary {
  const status = templateToStatus(template)
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
    pendingReplenishmentCount: 0,
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await params
  const eventId = String(id || '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'Event id required' }, { status: 400 })
  }

  const template = await getEventComandaTemplate(eventId)
  return NextResponse.json(buildSummary(eventId, template))
}

export async function POST(
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
    summary: buildSummary(eventId, template),
    articleStats,
  })
}
