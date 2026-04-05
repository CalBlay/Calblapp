export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

type SummaryRow = {
  department: Department
  responsible: string
  fetes: number
  validades: number
  /** Suma de compliancePct de les auditories validades (per mitjana ponderada al client) */
  complianceSum: number
  /** Nombre d’auditories validades incloses a complianceSum */
  complianceCount: number
  /** Mitjana de compliment 0–100 entre auditories validades; 0 si no n’hi ha cap */
  avgCompliancePct: number
}

const DEPARTMENTS: Department[] = ['comercial', 'serveis', 'cuina', 'logistica', 'deco']

function normalizeDept(raw?: string): Department | null {
  const value = (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'comercial') return 'comercial'
  if (value === 'serveis' || value === 'sala') return 'serveis'
  if (value === 'cuina') return 'cuina'
  if (value === 'logistica') return 'logistica'
  if (value === 'deco' || value === 'decoracio' || value === 'decoracions') return 'deco'
  return null
}

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

    const role = normalizeRole(user.role || '')
    const userDept = normalizeDept(user.department || '')
    if (!['admin', 'direccio', 'cap'].includes(role)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    let fromTs = Number(searchParams.get('fromTs') || 0)
    let toTs = Number(searchParams.get('toTs') || 0)
    const department = normalizeDept(searchParams.get('department') || '')
    const limit = Math.max(1, Math.min(5000, Number(searchParams.get('limit') || 3000)))
    if (fromTs > 0 && toTs > 0 && fromTs > toTs) {
      const tmp = fromTs
      fromTs = toTs
      toTs = tmp
    }

    let ref: FirebaseFirestore.Query = firestoreAdmin.collection('audit_runs')
    if (role === 'cap') {
      if (!userDept) return NextResponse.json({ rows: [] }, { status: 200 })
      ref = ref.where('department', '==', userDept)
    } else if (department) {
      ref = ref.where('department', '==', department)
    }

    const fallbackRef = ref
    if (fromTs > 0) ref = ref.where('completedAt', '>=', fromTs)
    if (toTs > 0) ref = ref.where('completedAt', '<=', toTs)

    const mapRows = (snap: FirebaseFirestore.QuerySnapshot) =>
      snap.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        const rawPct = Number(data.compliancePct)
        return {
          department: normalizeDept(String(data.department || '')),
          responsible: String(data.completedByName || '').trim() || 'Sense nom',
          status: String(data.status || '').toLowerCase(),
          completedAt: Number(data.completedAt || 0),
          compliancePct: Number.isFinite(rawPct) ? rawPct : 0,
        }
      })

    let rawRows: Array<{
      department: Department | null
      responsible: string
      status: string
      completedAt: number
      compliancePct: number
    }> = []

    try {
      const snap = await ref.orderBy('completedAt', 'desc').limit(limit).get()
      rawRows = mapRows(snap)
    } catch (queryErr: unknown) {
      const message = queryErr instanceof Error ? queryErr.message : ''
      const needsIndex = message.toLowerCase().includes('index')
      if (!needsIndex) throw queryErr
      const fallbackSnap = await fallbackRef.orderBy('completedAt', 'desc').limit(limit).get()
      rawRows = mapRows(fallbackSnap).filter((row) => {
        if (fromTs > 0 && row.completedAt < fromTs) return false
        if (toTs > 0 && row.completedAt > toTs) return false
        return true
      })
    }

    const grouped = new Map<string, Omit<SummaryRow, 'avgCompliancePct'>>()
    rawRows.forEach((row) => {
      if (!row.department || !DEPARTMENTS.includes(row.department)) return
      const key = `${row.department}__${row.responsible}`
      const current = grouped.get(key) || {
        department: row.department,
        responsible: row.responsible,
        fetes: 0,
        validades: 0,
        complianceSum: 0,
        complianceCount: 0,
      }
      current.fetes += 1
      if (row.status === 'validated') {
        current.validades += 1
        current.complianceSum += row.compliancePct
        current.complianceCount += 1
      }
      grouped.set(key, current)
    })

    const rows: SummaryRow[] = Array.from(grouped.values()).map((r) => ({
      ...r,
      avgCompliancePct:
        r.complianceCount > 0 ? round2(r.complianceSum / r.complianceCount) : 0,
    }))

    rows.sort((a, b) => {
      if (b.validades !== a.validades) return b.validades - a.validades
      if (b.fetes !== a.fetes) return b.fetes - a.fetes
      return a.responsible.localeCompare(b.responsible)
    })

    console.info('[auditoria/valuation-summary] completed', {
      durationMs: Date.now() - startedAt,
      role,
      department: department || (role === 'cap' ? userDept || '' : ''),
      fromTs,
      toTs,
      requestedLimit: limit,
      returned: rows.length,
      sourceRows: rawRows.length,
    })

    return NextResponse.json({ rows }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    console.error('[auditoria/valuation-summary] failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
