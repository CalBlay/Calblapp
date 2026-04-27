export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin, storageAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { normalizeCommercialAuditGroup, resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

type TemplateItem = { id?: string; type?: string; weight?: number }
type TemplateBlock = {
  id?: string
  title?: string
  weight?: number
  itemWeightMode?: 'equal' | 'manual' | string
  items?: TemplateItem[]
}

type ReviewBlockCheck = {
  blockId: string
  isValid: boolean
}

type ReviewItemCheck = {
  blockId: string
  itemId: string
  isValid: boolean
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

function round2(num: number) {
  return Math.round(num * 100) / 100
}

function normalizeBlockChecks(input: unknown): ReviewBlockCheck[] {
  if (!Array.isArray(input)) return []
  return input
    .map((x) => {
      const v = (x || {}) as { blockId?: unknown; isValid?: unknown }
      const blockId = String(v.blockId || '').trim()
      if (!blockId || typeof v.isValid !== 'boolean') return null
      return { blockId, isValid: v.isValid }
    })
    .filter((x): x is ReviewBlockCheck => Boolean(x))
}

function normalizeItemChecks(input: unknown): ReviewItemCheck[] {
  if (!Array.isArray(input)) return []
  return input
    .map((x) => {
      const v = (x || {}) as { blockId?: unknown; itemId?: unknown; isValid?: unknown }
      const blockId = String(v.blockId || '').trim()
      const itemId = String(v.itemId || '').trim()
      if (!blockId || !itemId || typeof v.isValid !== 'boolean') return null
      return { blockId, itemId, isValid: v.isValid }
    })
    .filter((x): x is ReviewItemCheck => Boolean(x))
}

function resolveBlockItemWeights(block: TemplateBlock, index: number) {
  const items = Array.isArray(block?.items) ? block.items : []
  if (!items.length) return []
  const blockWeight = Number(block?.weight || 0)
  const mode = String(block?.itemWeightMode || 'equal').toLowerCase() === 'manual' ? 'manual' : 'equal'
  const fallbackShare = blockWeight / items.length
  if (mode !== 'manual') {
    return items.map((item, itemIdx) => ({
      blockId: String(block?.id || `b-${index + 1}`),
      itemId: String(item?.id || `i-${index + 1}-${itemIdx + 1}`),
      weight: fallbackShare,
    }))
  }

  const internalTotal = items.reduce((sum, item) => sum + Math.max(0, Number(item?.weight || 0)), 0)
  if (internalTotal <= 0) {
    return items.map((item, itemIdx) => ({
      blockId: String(block?.id || `b-${index + 1}`),
      itemId: String(item?.id || `i-${index + 1}-${itemIdx + 1}`),
      weight: fallbackShare,
    }))
  }

  return items.map((item, itemIdx) => ({
    blockId: String(block?.id || `b-${index + 1}`),
    itemId: String(item?.id || `i-${index + 1}-${itemIdx + 1}`),
    weight: round2((Math.max(0, Number(item?.weight || 0)) / internalTotal) * blockWeight),
  }))
}

function complianceFromChecks(blocksInput: unknown, checksInput: unknown) {
  const blocks = Array.isArray(blocksInput) ? (blocksInput as TemplateBlock[]) : []
  const checks = normalizeBlockChecks(checksInput)
  if (!blocks.length || !checks.length) return 0

  const byId = new Map(checks.map((c) => [c.blockId, c.isValid]))
  let weighted = 0
  let totalWeight = 0

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    const blockId = String(block?.id || `b-${i + 1}`)
    const weight = Number(block?.weight || 0)
    if (weight <= 0) continue
    totalWeight += weight
    if (byId.get(blockId) === true) weighted += weight
  }

  if (totalWeight <= 0) return 0
  return round2((weighted / totalWeight) * 100)
}

function complianceFromItemChecks(blocksInput: unknown, checksInput: unknown) {
  const blocks = Array.isArray(blocksInput) ? (blocksInput as TemplateBlock[]) : []
  const checks = normalizeItemChecks(checksInput)
  if (!blocks.length || !checks.length) return 0

  const byItem = new Map(checks.map((c) => [`${c.blockId}::${c.itemId}`, c.isValid]))
  let weighted = 0
  let totalWeight = 0

  blocks.forEach((block, blockIdx) => {
    const resolvedItems = resolveBlockItemWeights(block, blockIdx)
    resolvedItems.forEach((item) => {
      totalWeight += item.weight
      if (byItem.get(`${item.blockId}::${item.itemId}`) === true) weighted += item.weight
    })
  })

  if (totalWeight <= 0) return 0
  return round2((weighted / totalWeight) * 100)
}

function checksCompletion(blocksInput: unknown, checksInput: unknown) {
  const blocks = Array.isArray(blocksInput) ? (blocksInput as TemplateBlock[]) : []
  const checks = normalizeBlockChecks(checksInput)
  if (!blocks.length) return false
  const ids = new Set(checks.map((c) => c.blockId))
  return blocks.every((b, i) => ids.has(String(b?.id || `b-${i + 1}`)))
}

function itemChecksCompletion(blocksInput: unknown, checksInput: unknown) {
  const blocks = Array.isArray(blocksInput) ? (blocksInput as TemplateBlock[]) : []
  const checks = normalizeItemChecks(checksInput)
  if (!blocks.length) return false
  const ids = new Set(checks.map((c) => `${c.blockId}::${c.itemId}`))
  return blocks.every((block, blockIdx) => {
    const blockId = String(block?.id || `b-${blockIdx + 1}`)
    const items = Array.isArray(block?.items) ? block.items : []
    if (!items.length) return false
    return items.every((item, itemIdx) => ids.has(`${blockId}::${String(item?.id || `i-${blockIdx + 1}-${itemIdx + 1}`)}`))
  })
}

async function getTemplateBlocksForRun(run: Record<string, unknown>) {
  const snapshot = Array.isArray(run.templateSnapshot) ? (run.templateSnapshot as TemplateBlock[]) : []
  if (snapshot.length) return snapshot

  const templateId = String(run.templateId || '').trim()
  if (!templateId) return []

  const tpl = await firestoreAdmin.collection('audit_templates').doc(templateId).get()
  if (!tpl.exists) return []
  const data = tpl.data() as Record<string, unknown>
  return Array.isArray(data.blocks) ? (data.blocks as TemplateBlock[]) : []
}

async function authContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as
    | { id?: string; role?: string; department?: string; name?: string | null; email?: string | null }
    | undefined

  if (!user?.id) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }
  const role = normalizeRole(user.role || '')
  const department = resolveAuditDepartmentForUser(user.department || '')
  const commercialGroup = normalizeCommercialAuditGroup(user.department || '')

  if (!['admin', 'direccio', 'cap'].includes(role)) {
    return { error: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  return { user, role, department, commercialGroup }
}

async function commercialRunBelongsToGroup(run: Record<string, unknown>, group: string | null) {
  if (!group) return false
  const storedGroup = normalizeCommercialAuditGroup(String(run.completedByDepartment || run.savedByDepartment || ''))
  if (storedGroup === group) return true

  const completedById = String(run.completedById || run.savedById || '').trim()
  if (!completedById) return false
  const userSnap = await firestoreAdmin.collection('users').doc(completedById).get()
  if (!userSnap.exists) return false
  const data = userSnap.data() as Record<string, unknown>
  const userGroup = normalizeCommercialAuditGroup(String(data.departmentLower || data.department || ''))
  return userGroup === group
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error

    const { id } = await ctx.params
    const ref = firestoreAdmin.collection('audit_runs').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Execucio no trobada' }, { status: 404 })

    const run = snap.data() as Record<string, unknown>
    const runDepartment = normalizeDept(String(run.department || ''))

    if (auth.role === 'cap' && (!runDepartment || auth.department !== runDepartment)) {
      return NextResponse.json({ error: 'Sense permisos per aquest departament' }, { status: 403 })
    }
    if (auth.role === 'cap' && runDepartment === 'comercial' && auth.commercialGroup) {
      const allowed = await commercialRunBelongsToGroup(run, auth.commercialGroup)
      if (!allowed) return NextResponse.json({ error: 'Sense permisos sobre aquest comercial' }, { status: 403 })
    }

    const templateBlocks = await getTemplateBlocksForRun(run)
    const reviewBlockChecks = normalizeBlockChecks(run.reviewBlockChecks)
    const reviewItemChecks = normalizeItemChecks(run.reviewItemChecks)
    const compliancePct = Number(
      run.compliancePct ||
        (reviewItemChecks.length
          ? complianceFromItemChecks(templateBlocks, reviewItemChecks)
          : complianceFromChecks(templateBlocks, reviewBlockChecks))
    )

    return NextResponse.json(
      {
        execution: {
          id: snap.id,
          ...run,
          templateBlocks,
          reviewBlockChecks,
          reviewItemChecks,
          compliancePct: round2(compliancePct),
        },
      },
      { status: 200 }
    )
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
    const body = (await req.json()) as {
      action?: 'reopen'
      note?: string
      blockChecks?: Array<{ blockId?: string; isValid?: boolean }>
      itemChecks?: Array<{ blockId?: string; itemId?: string; isValid?: boolean }>
    }
    const action = body?.action === 'reopen' ? 'reopen' : null

    const note = String(body?.note || '').trim()

    const ref = firestoreAdmin.collection('audit_runs').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Execucio no trobada' }, { status: 404 })

    const run = snap.data() as Record<string, unknown>
    const runDepartment = normalizeDept(String(run.department || ''))
    if (auth.role === 'cap' && (!runDepartment || auth.department !== runDepartment)) {
      return NextResponse.json({ error: 'Sense permisos per aquest departament' }, { status: 403 })
    }
    if (auth.role === 'cap' && runDepartment === 'comercial' && auth.commercialGroup) {
      const allowed = await commercialRunBelongsToGroup(run, auth.commercialGroup)
      if (!allowed) return NextResponse.json({ error: 'Sense permisos sobre aquest comercial' }, { status: 403 })
    }

    if (action === 'reopen') {
      const now = Date.now()
      await ref.set(
        {
          status: 'completed',
          compliancePct: 0,
          reviewBlockChecks: [],
          reviewItemChecks: [],
          reviewNote: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedByName: null,
          updatedAt: now,
        },
        { merge: true }
      )
      return NextResponse.json({ ok: true, status: 'completed' }, { status: 200 })
    }

    const templateBlocks = await getTemplateBlocksForRun(run)
    const blockChecks = normalizeBlockChecks(body.blockChecks)
    const itemChecks = normalizeItemChecks(body.itemChecks)

    const usesItemChecks = itemChecks.length > 0
    if (usesItemChecks) {
      if (!itemChecksCompletion(templateBlocks, itemChecks)) {
        return NextResponse.json({ error: 'Cal validar tots els items (si o no)' }, { status: 400 })
      }
    } else if (!checksCompletion(templateBlocks, blockChecks)) {
      return NextResponse.json({ error: 'Cal validar tots els blocs (si o no)' }, { status: 400 })
    }

    // Estat "validated" = valoració completa (tots els ítems/blocs amb sí o no).
    // El % de compliment (compliancePct) només pondera els checks positius (isValid === true).
    const status = 'validated'
    const compliancePct = usesItemChecks
      ? complianceFromItemChecks(templateBlocks, itemChecks)
      : complianceFromChecks(templateBlocks, blockChecks)
    const now = Date.now()

    await ref.set(
      {
        status,
        compliancePct,
        reviewBlockChecks: usesItemChecks ? [] : blockChecks,
        reviewItemChecks: usesItemChecks ? itemChecks : [],
        reviewNote: note || null,
        reviewedAt: now,
        reviewedById: auth.user.id,
        reviewedByName: auth.user.name || auth.user.email || 'Usuari',
        updatedAt: now,
      },
      { merge: true }
    )

    return NextResponse.json(
      {
        ok: true,
        status,
        compliancePct,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authContext()
    if ('error' in auth) return auth.error
    if (auth.role !== 'admin') {
      return NextResponse.json({ error: 'Nomes admin pot eliminar auditories' }, { status: 403 })
    }

    const { id } = await ctx.params
    const ref = firestoreAdmin.collection('audit_runs').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Execucio no trobada' }, { status: 404 })

    const run = snap.data() as Record<string, unknown>
    const answers = Array.isArray(run.auditAnswers) ? (run.auditAnswers as Array<Record<string, unknown>>) : []
    const paths = new Set<string>()

    answers.forEach((answer) => {
      const photos = Array.isArray(answer.photos) ? (answer.photos as Array<Record<string, unknown>>) : []
      photos.forEach((photo) => {
        const path = String(photo.path || '').trim()
        if (path) paths.add(path)
      })
    })

    const bucket = storageAdmin.bucket()
    await Promise.all(
      Array.from(paths).map(async (path) => {
        try {
          await bucket.file(path).delete()
        } catch {
          // ignore missing/orphan files
        }
      })
    )

    await ref.delete()
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
