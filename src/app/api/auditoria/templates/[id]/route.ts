export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'
type ItemType = 'checklist' | 'rating' | 'photo'
type ItemWeightMode = 'equal' | 'manual'

function normalizeDept(raw?: string): Department | null {
  const value = (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'comercial') return 'comercial'
  if (value === 'serveis') return 'serveis'
  if (value === 'cuina') return 'cuina'
  if (value === 'logistica') return 'logistica'
  if (value === 'deco' || value === 'decoracio' || value === 'decoracions') return 'deco'
  return null
}

function normalizeStatus(raw?: string): 'active' | 'draft' {
  return String(raw || '').toLowerCase() === 'active' ? 'active' : 'draft'
}

function normalizeItemType(raw?: string): ItemType {
  const v = String(raw || '').toLowerCase()
  if (v === 'rating' || v === 'photo') return v
  return 'checklist'
}

function normalizeItemWeightMode(raw?: string): ItemWeightMode {
  return String(raw || '').toLowerCase() === 'manual' ? 'manual' : 'equal'
}

function sanitizeBlocks(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .map((block, blockIdx) => {
      const b = (block || {}) as Record<string, unknown>
      const weightRaw = Number(b.weight ?? 0)
      const weight = Number.isFinite(weightRaw) ? Math.max(0, Math.min(100, weightRaw)) : 0
      const itemWeightMode = normalizeItemWeightMode(String(b.itemWeightMode || 'equal'))
      const itemsRaw = Array.isArray(b.items) ? b.items : []
      const items = itemsRaw
        .map((it, itemIdx) => {
          const i = (it || {}) as Record<string, unknown>
          const label = String(i.label || '').trim()
          if (!label) return null
          const weightRaw = Number(i.weight ?? 0)
          const itemWeight =
            Number.isFinite(weightRaw) && weightRaw >= 0 ? Math.min(100, weightRaw) : 0
          const baseItem = {
            id: String(i.id || `i-${blockIdx + 1}-${itemIdx + 1}`),
            label,
            type: normalizeItemType(String(i.type || 'checklist')),
          }
          // Firestore rejects undefined; only persist item weight in manual mode
          return itemWeightMode === 'manual' ? { ...baseItem, weight: itemWeight } : baseItem
        })
        .filter(Boolean)

      const title = String(b.title || '').trim()
      if (!title) return null
      return {
        id: String(b.id || `b-${blockIdx + 1}`),
        title,
        weight,
        itemWeightMode,
        items,
      }
    })
    .filter(Boolean)
}

type SanitizedBlock = ReturnType<typeof sanitizeBlocks>[number]

function isTemplateComplete(name: string, blocks: SanitizedBlock[]) {
  if (!String(name || '').trim()) return false
  if (!Array.isArray(blocks) || blocks.length === 0) return false

  const weightTotal = blocks.reduce((sum, b) => sum + (Number(b?.weight) || 0), 0)
  if (weightTotal !== 100) return false

  return blocks.every((b) => {
    if (!String(b?.title || '').trim()) return false
    if (!Array.isArray(b?.items) || b.items.length === 0) return false
    if (!b.items.every((i) => String(i?.label || '').trim().length > 0)) return false
    if (normalizeItemWeightMode(String(b?.itemWeightMode || 'equal')) !== 'manual') return true
    const total = b.items.reduce((sum: number, i) => {
      if (!i) return sum
      return sum + ('weight' in i ? Number(i.weight) : 0)
    }, 0)
    return Math.round(total * 100) / 100 === 100
  })
}

async function authContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; department?: string } | undefined
  if (!user?.id) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }

  const role = normalizeRole(user.role || '')
  const dept = resolveAuditDepartmentForUser(user.department || '')
  if (!['admin', 'direccio', 'cap'].includes(role)) {
    return { error: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  return { user, role, dept }
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error

    const { id } = await ctx.params
    const ref = firestoreAdmin.collection('audit_templates').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Plantilla no trobada' }, { status: 404 })

    const data = snap.data() as Record<string, unknown>
    const department = normalizeDept(String(data.department || ''))
    if (!department) return NextResponse.json({ error: 'Departament invalid a plantilla' }, { status: 400 })

    if (auth.role === 'cap' && auth.dept !== department) {
      return NextResponse.json({ error: 'Sense permisos sobre aquest departament' }, { status: 403 })
    }

    const blocks = sanitizeBlocks(data.blocks)
    const name = String(data.name || 'Plantilla')
    const computedComplete = isTemplateComplete(name, blocks)
    const storedStatus = normalizeStatus(String(data.status || 'draft'))
    const effectiveStatus = computedComplete ? 'active' : 'draft'
    const storedVisible = Boolean(data.isVisible)
    const effectiveVisible = effectiveStatus === 'active' ? storedVisible : false

    if (effectiveStatus !== storedStatus || effectiveVisible !== storedVisible) {
      await ref.set(
        {
          status: effectiveStatus,
          isVisible: effectiveVisible,
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    }

    return NextResponse.json({
      id: snap.id,
      name,
      department,
      status: effectiveStatus,
      isVisible: effectiveVisible,
      blocks,
      updatedAt: Number(data.updatedAt || Date.now()),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error

    const { id } = await ctx.params
    const ref = firestoreAdmin.collection('audit_templates').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Plantilla no trobada' }, { status: 404 })

    const existing = snap.data() as Record<string, unknown>
    const existingDept = normalizeDept(String(existing.department || ''))
    if (!existingDept) return NextResponse.json({ error: 'Departament invalid' }, { status: 400 })

    if (auth.role === 'cap' && auth.dept !== existingDept) {
      return NextResponse.json({ error: 'Sense permisos sobre aquest departament' }, { status: 403 })
    }

    const body = (await req.json()) as {
      name?: string
      status?: string
      blocks?: unknown
    }

    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Nom obligatori' }, { status: 400 })

    const blocks = sanitizeBlocks(body.blocks)
    const canActivate = isTemplateComplete(name, blocks)
    const status = canActivate ? 'active' : 'draft'
    const now = Date.now()
    const existingVisible = Boolean(existing.isVisible)
    const isVisible = status === 'active' ? existingVisible : false

    await ref.set(
      {
        name,
        status,
        isVisible,
        blocks,
        updatedBy: auth.user.id,
        updatedAt: now,
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, updatedAt: now, status, isVisible })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error

    const { id } = await ctx.params
    const ref = firestoreAdmin.collection('audit_templates').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Plantilla no trobada' }, { status: 404 })

    const data = snap.data() as Record<string, unknown>
    const department = normalizeDept(String(data.department || ''))
    if (!department) return NextResponse.json({ error: 'Departament invalid' }, { status: 400 })

    if (auth.role === 'cap' && auth.dept !== department) {
      return NextResponse.json({ error: 'Sense permisos sobre aquest departament' }, { status: 403 })
    }

    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
