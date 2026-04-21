import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  isIsoDateDayParam,
  queryStageCollectionDocsInDateRange,
} from '@/lib/firestoreStageRangeQuery'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

type StageDoc = Record<string, unknown>

function normalizeUbicacio(raw: unknown): string {
  return String(raw ?? '')
    .split('(')[0]
    .split('/')[0]
    .replace(/^ZZ\s*/i, '')
    .trim()
}

/** Clau estable per agrupar (mateixa finca encara que el text d’ubicació variï lleugerament). */
function fincaGroupKey(d: StageDoc): string {
  const code = String(d.FincaCode ?? d.fincaCode ?? '').trim()
  if (code) return `code:${code}`
  const id = String(d.FincaId ?? d.FincaID ?? '').trim()
  if (id) return `id:${id}`
  const u = normalizeUbicacio(d.Ubicacio).toLowerCase()
  if (u) return `ub:${u}`
  return '_sense_finca'
}

function fincaDisplayLabel(d: StageDoc): string {
  const ubicacio = normalizeUbicacio(d.Ubicacio)
  const code = String(d.FincaCode ?? d.fincaCode ?? '').trim()
  if (ubicacio) return ubicacio.slice(0, 72)
  if (code) return code
  const id = String(d.FincaId ?? '').trim()
  if (id) return id.slice(0, 24)
  return 'Sense finca'
}

function lnValue(d: StageDoc): string {
  const raw = d.LN
  if (raw != null && String(raw).trim() !== '') return String(raw).trim()
  return 'Altres'
}

/**
 * Top finques per suma del camp `Import` a stage_verd dins d’un rang de dates (DataInici / DataFi).
 * Filtre opcional per línia de negoci (`LN`). Només admin / direcció.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const forbidden = requireRoles(auth, ['admin', 'direccio'])
  if (forbidden) return forbidden.res

  const start = req.nextUrl.searchParams.get('start')?.slice(0, 10) ?? ''
  const end = req.nextUrl.searchParams.get('end')?.slice(0, 10) ?? ''
  const ln = (req.nextUrl.searchParams.get('ln') ?? '').trim()
  const topRaw = req.nextUrl.searchParams.get('top')
  const top = Math.min(
    25,
    Math.max(1, Number.parseInt(String(topRaw ?? '10'), 10) || 10)
  )

  if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
    return NextResponse.json(
      { ok: false, error: 'Cal start i end en format YYYY-MM-DD' },
      { status: 400 }
    )
  }
  if (start > end) {
    return NextResponse.json(
      { ok: false, error: 'start no pot ser posterior a end' },
      { status: 400 }
    )
  }

  const docs = await queryStageCollectionDocsInDateRange(db, 'stage_verd', start, end)

  const lineSet = new Set<string>()
  const agg = new Map<
    string,
    { importSum: number; eventCount: number; label: string }
  >()

  for (const snap of docs) {
    const d = snap.data() as StageDoc
    const lnV = lnValue(d)
    lineSet.add(lnV)

    if (ln && ln !== '__all__' && lnV !== ln) continue

    const imp = Number(d.Import)
    const amount = Number.isFinite(imp) ? imp : 0

    const key = fincaGroupKey(d)
    const label = fincaDisplayLabel(d)

    const prev = agg.get(key)
    if (!prev) {
      agg.set(key, { importSum: amount, eventCount: 1, label })
    } else {
      prev.importSum += amount
      prev.eventCount += 1
      if (label.length > prev.label.length) prev.label = label
    }
  }

  const lines = [...lineSet].sort((a, b) => a.localeCompare(b, 'ca'))

  const rows = [...agg.entries()]
    .map(([fincaKey, v]) => ({
      fincaKey,
      label: v.label,
      importSum: Math.round(v.importSum * 100) / 100,
      eventCount: v.eventCount,
    }))
    .sort((a, b) => b.importSum - a.importSum)
    .slice(0, top)

  const totalInRange = [...agg.values()].reduce((s, v) => s + v.importSum, 0)

  return NextResponse.json({
    ok: true,
    start,
    end,
    ln: ln && ln !== '__all__' ? ln : null,
    top,
    eventDocsInRange: docs.length,
    lines,
    totalImportSum: Math.round(totalInRange * 100) / 100,
    rows,
    note:
      'Suma del camp Import de stage_verd (agenda confirmada). No és comptabilitat SAP; filtre LN = línia de negoci del document.',
  })
}
