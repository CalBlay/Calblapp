export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

type DepartmentBonusConfig = {
  minAuditoriesMes: number
  maxBonusMensualEur: number
  bonusMode: 'total_month' | 'per_event'
  enabled: boolean
}

const DEPARTMENTS: Department[] = ['comercial', 'serveis', 'cuina', 'logistica', 'deco']

const DEFAULT_CONFIG: DepartmentBonusConfig = {
  minAuditoriesMes: 6,
  maxBonusMensualEur: 200,
  bonusMode: 'total_month',
  enabled: true,
}

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

function normalizeConfig(input: unknown): DepartmentBonusConfig {
  const v = (input || {}) as Partial<DepartmentBonusConfig>
  const minAuditoriesMes = Math.max(0, Math.round(Number(v.minAuditoriesMes || DEFAULT_CONFIG.minAuditoriesMes)))
  const maxBonusMensualEur = Math.max(0, Number(v.maxBonusMensualEur || DEFAULT_CONFIG.maxBonusMensualEur))
  const bonusMode = v.bonusMode === 'per_event' ? 'per_event' : 'total_month'
  const enabled = Boolean(v.enabled)
  return { minAuditoriesMes, maxBonusMensualEur, bonusMode, enabled }
}

function buildConfigMap(raw: unknown): Record<Department, DepartmentBonusConfig> {
  const src = (raw || {}) as Record<string, unknown>
  return {
    comercial: normalizeConfig(src.comercial),
    serveis: normalizeConfig(src.serveis),
    cuina: normalizeConfig(src.cuina),
    logistica: normalizeConfig(src.logistica),
    deco: normalizeConfig(src.deco),
  }
}

async function authContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; department?: string } | undefined
  if (!user?.id) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }

  const role = normalizeRole(user.role || '')
  const department = resolveAuditDepartmentForUser(user.department || '')

  if (!['admin', 'direccio', 'cap'].includes(role)) {
    return { error: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  return { user, role, department }
}

export async function GET() {
  const startedAt = Date.now()
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error

    const ref = firestoreAdmin.collection('audit_settings').doc('valuation_bonus')
    const snap = await ref.get()
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    const config = buildConfigMap(data.departments)

    const allowedDepartments =
      auth.role === 'cap'
        ? auth.department
          ? [auth.department]
          : []
        : DEPARTMENTS

    console.info('[auditoria/valuation-config] get completed', {
      durationMs: Date.now() - startedAt,
      role: auth.role,
      allowedDepartments,
    })

    return NextResponse.json({ config, allowedDepartments }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    console.error('[auditoria/valuation-config] get failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const startedAt = Date.now()
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error

    const body = (await req.json()) as {
      department?: string
      minAuditoriesMes?: number
      maxBonusMensualEur?: number
      bonusMode?: 'total_month' | 'per_event'
      enabled?: boolean
    }

    const department = normalizeDept(body.department || '')
    if (!department) {
      return NextResponse.json({ error: 'Departament invalid' }, { status: 400 })
    }

    if (auth.role === 'cap' && auth.department !== department) {
      return NextResponse.json({ error: 'Un cap nomes pot editar el seu departament' }, { status: 403 })
    }

    const minAuditoriesMes = Math.max(0, Math.round(Number(body.minAuditoriesMes ?? DEFAULT_CONFIG.minAuditoriesMes)))
    const maxBonusMensualEur = Math.max(0, Number(body.maxBonusMensualEur ?? DEFAULT_CONFIG.maxBonusMensualEur))
    const bonusMode = body.bonusMode === 'per_event' ? 'per_event' : 'total_month'
    const enabled = Boolean(body.enabled)

    const now = Date.now()
    const ref = firestoreAdmin.collection('audit_settings').doc('valuation_bonus')
    await ref.set(
      {
        departments: {
          [department]: {
            minAuditoriesMes,
            maxBonusMensualEur,
            bonusMode,
            enabled,
          },
        },
        updatedAt: now,
        updatedBy: auth.user.id,
      },
      { merge: true }
    )

    console.info('[auditoria/valuation-config] patch completed', {
      durationMs: Date.now() - startedAt,
      role: auth.role,
      department,
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    console.error('[auditoria/valuation-config] patch failed', {
      durationMs: Date.now() - startedAt,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
