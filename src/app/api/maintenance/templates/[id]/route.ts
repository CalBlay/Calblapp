import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import {
  ROLES_MAINTENANCE_TEMPLATES_READ,
  ROLES_MAINTENANCE_TEMPLATES_WRITE,
} from '@/lib/server/maintenanceTemplatesAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TemplateSection = { location: string; items: { label: string }[] }
type TemplatePatch = {
  name?: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  active?: boolean
  autoPlanExcludedWeeks?: string[]
  sections?: TemplateSection[]
}

type TemplateDocument = TemplatePatch & {
  createdAt?: number
  updatedAt?: number
  createdById?: string
  createdByName?: string
  updatedById?: string
  updatedByName?: string
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ROLES_MAINTENANCE_TEMPLATES_READ)
  if (denied) return denied.res

  const { id } = await ctx.params
  try {
    const ref = db.collection('maintenancePreventiusTemplates').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ template: { id: snap.id, ...(snap.data() as TemplateDocument) } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ROLES_MAINTENANCE_TEMPLATES_WRITE)
  if (denied) return denied.res

  const { user } = auth

  const { id } = await ctx.params
  try {
    const body = (await req.json()) as TemplatePatch
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = String(body.name || '').trim()
    if (body.periodicity !== undefined) patch.periodicity = body.periodicity
    if (body.lastDone !== undefined) patch.lastDone = body.lastDone
    if (body.location !== undefined) patch.location = String(body.location || '').trim()
    if (body.primaryOperator !== undefined)
      patch.primaryOperator = String(body.primaryOperator || '').trim()
    if (body.backupOperator !== undefined)
      patch.backupOperator = String(body.backupOperator || '').trim()
    if (body.active !== undefined) patch.active = body.active !== false
    if (body.autoPlanExcludedWeeks !== undefined) {
      patch.autoPlanExcludedWeeks = Array.isArray(body.autoPlanExcludedWeeks)
        ? body.autoPlanExcludedWeeks.map((v) => String(v))
        : []
    }
    if (body.sections !== undefined) patch.sections = Array.isArray(body.sections) ? body.sections : []

    patch.updatedAt = Date.now()
    patch.updatedById = user.id
    patch.updatedByName = user.name || ''

    await db.collection('maintenancePreventiusTemplates').doc(id).set(patch, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ROLES_MAINTENANCE_TEMPLATES_WRITE)
  if (denied) return denied.res

  const { id } = await ctx.params
  try {
    await db.collection('maintenancePreventiusTemplates').doc(id).delete()
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
