import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { resolveMaintenanceTemplateName } from '@/lib/maintenanceTemplateDisplay'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import {
  ROLES_MAINTENANCE_TEMPLATES_READ,
  ROLES_MAINTENANCE_TEMPLATES_WRITE,
} from '@/lib/server/maintenanceTemplatesAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TemplateDocument = TemplatePayload & {
  createdAt?: number
  updatedAt?: number
  createdById?: string
  createdByName?: string
  updatedById?: string
  updatedByName?: string
}

const normalizeSections = (sections: unknown): TemplateSection[] =>
  Array.isArray(sections)
    ? sections
        .map((section) => {
          const record = section as {
            location?: unknown
            items?: Array<{ label?: unknown }> | unknown
          }
          return {
            location: String(record?.location || '').trim(),
            items: Array.isArray(record?.items)
              ? record.items
                  .map((item) => ({ label: String((item as { label?: unknown })?.label || '').trim() }))
                  .filter((item) => item.label)
              : [],
          }
        })
        .filter((section) => section.location || section.items.length > 0)
    : []

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ROLES_MAINTENANCE_TEMPLATES_READ)
  if (denied) return denied.res

  try {
    const snap = await db.collection('maintenancePreventiusTemplates').get()
    const templates = snap.docs
      .map((doc) => {
        const data = doc.data() as TemplateDocument
        const sections = normalizeSections(data.sections)
        return {
          id: doc.id,
          ...data,
          name: resolveMaintenanceTemplateName(data as Record<string, unknown>, doc.id, sections),
          sections,
        }
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    return NextResponse.json({ templates })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ templates: [], error: message }, { status: 500 })
  }
}

type TemplateSection = { location: string; items: { label: string }[] }
type TemplatePayload = {
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  active?: boolean
  autoPlanExcludedWeeks?: string[]
  sections?: TemplateSection[]
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ROLES_MAINTENANCE_TEMPLATES_WRITE)
  if (denied) return denied.res

  const { user } = auth

  try {
    const body = (await req.json()) as TemplatePayload
    const name = (body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })

    const now = Date.now()
    const sections = normalizeSections(body.sections)
    const doc = await db.collection('maintenancePreventiusTemplates').add({
      name,
      periodicity: body.periodicity || null,
      lastDone: body.lastDone || null,
      location: (body.location || '').trim(),
      primaryOperator: (body.primaryOperator || '').trim(),
      backupOperator: (body.backupOperator || '').trim(),
      active: body.active !== false,
      autoPlanExcludedWeeks: Array.isArray(body.autoPlanExcludedWeeks)
        ? body.autoPlanExcludedWeeks.map((v) => String(v))
        : [],
      sections,
      createdAt: now,
      createdById: user.id,
      createdByName: user.name || '',
      updatedAt: now,
      updatedById: user.id,
      updatedByName: user.name || '',
    })

    return NextResponse.json({ id: doc.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
