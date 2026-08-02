export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { registerAuditAnswersInIndex } from '@/lib/media/storageMediaIndex'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'
import { pickVisibleAuditTemplate } from '@/lib/auditVisibleTemplate'
import {
  ExtraOutcome,
  buildEventExtrasDocId,
  getEventStageContext,
  isWeddingLn,
  normalizeEventDay,
} from '@/lib/eventExtras'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'
type IncidentOutcome = 'none' | 'reported'
type AnswerType = 'checklist' | 'rating' | 'photo'

type SanitizedAuditAnswer = {
  itemId: string
  blockId: string | null
  type: AnswerType
  value: boolean | number | string | null
  photos: Array<{ url: string; path: string; size?: number; type?: string }>
}
type TemplateBlock = {
  id?: string
  title?: string
  weight?: number
  itemWeightMode?: 'equal' | 'manual' | string
  items?: Array<{ id?: string; label?: string; type?: string; weight?: number }>
}

function buildExecutionDocId(eventId: string, department: Department, eventDay?: string | null) {
  const normalizedDay = normalizeEventDay(eventDay)
  return normalizedDay ? `${eventId}_${department}_${normalizedDay}` : `${eventId}_${department}`
}

async function findExistingExecutionRef(
  eventId: string,
  department: Department,
  eventDay?: string | null
) {
  const normalizedDay = normalizeEventDay(eventDay)
  const docId = buildExecutionDocId(eventId, department, normalizedDay)
  const directRef = firestoreAdmin.collection('audit_runs').doc(docId)
  const directSnap = await directRef.get()
  if (directSnap.exists) {
    return { ref: directRef, snap: directSnap, docId }
  }

  if (normalizedDay) {
    const byFieldsSnap = await firestoreAdmin
      .collection('audit_runs')
      .where('eventId', '==', eventId)
      .where('department', '==', department)
      .where('eventDay', '==', normalizedDay)
      .limit(1)
      .get()

    if (!byFieldsSnap.empty) {
      const legacyDoc = byFieldsSnap.docs[0]
      return {
        ref: legacyDoc.ref,
        snap: legacyDoc,
        docId: legacyDoc.id,
      }
    }
  }

  if (!normalizedDay) {
    const legacyRef = firestoreAdmin.collection('audit_runs').doc(`${eventId}_${department}`)
    const legacySnap = await legacyRef.get()
    if (legacySnap.exists) {
      return { ref: legacyRef, snap: legacySnap, docId: legacyRef.id }
    }
  }

  return { ref: directRef, snap: directSnap, docId }
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

async function getVisibleTemplate(department: Department) {
  const snap = await firestoreAdmin.collection('audit_templates').where('isVisible', '==', true).get()
  const picked = pickVisibleAuditTemplate(
    snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })),
    department
  )
  if (!picked) return null
  return {
    id: picked.id,
    name: picked.name,
    blocks: Array.isArray(picked.blocks) ? (picked.blocks as TemplateBlock[]) : [],
  }
}

async function getAuthContext() {
  const session = await getServerSession(authOptions)
  const user = session?.user as
    | { id?: string; role?: string; department?: string; name?: string | null; email?: string | null }
    | undefined

  if (!user?.id) return { error: NextResponse.json({ error: 'No autenticat' }, { status: 401 }) }
  const role = normalizeRole(user.role || '')
  const normalizedSessionDept = resolveAuditDepartmentForUser(user.department || '')
  const department = role === 'comercial' ? 'comercial' : normalizedSessionDept
  return { user, role, department }
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error

    const { searchParams } = new URL(req.url)
    const eventId = String(searchParams.get('eventId') || '').trim()
    const eventDay = normalizeEventDay(searchParams.get('eventDay'))
    const department = normalizeDept(searchParams.get('department') || '')
    if (!eventId || !department) {
      return NextResponse.json({ error: 'eventId i department son obligatoris' }, { status: 400 })
    }

    if (!['admin', 'direccio', 'cap', 'comercial'].includes(auth.role)) {
      if (!auth.department || auth.department !== department) {
        return NextResponse.json({ error: 'Sense permisos per aquest departament' }, { status: 403 })
      }
    }

    const { snap: executionSnap } = await findExistingExecutionRef(eventId, department, eventDay)
    const visibleTemplate = await getVisibleTemplate(department)
    const execution = executionSnap.exists ? { id: executionSnap.id, ...executionSnap.data() } : null

    return NextResponse.json({ execution, visibleTemplate }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return auth.error

    const body = (await req.json()) as {
      mode?: 'save' | 'finalize' | 'reopen'
      eventId?: string
      eventSummary?: string
      eventCode?: string
      eventLocation?: string
      eventDay?: string
      department?: string
      incidentOutcome?: IncidentOutcome
      incidentIds?: string[]
      extraOutcome?: ExtraOutcome
      notes?: string
      auditAnswers?: Array<{
        itemId?: string
        blockId?: string
        type?: AnswerType
        value?: boolean | number | string | null
        photos?: Array<{ url?: string; path?: string; size?: number; type?: string }>
      }>
    }

    const eventId = String(body.eventId || '').trim()
    const eventSummary = String(body.eventSummary || '').replace(/#.*$/, '').trim()
    const eventCode = String(body.eventCode || '').trim()
    const eventLocation = String(body.eventLocation || '').trim()
    const eventDay = normalizeEventDay(String(body.eventDay || '').trim())
    const mode = body.mode === 'save' || body.mode === 'reopen' ? body.mode : 'finalize'
    const department = normalizeDept(body.department || '')
    const incidentOutcome = body.incidentOutcome
    const incidentIds = Array.isArray(body.incidentIds)
      ? body.incidentIds.map((x) => String(x || '').trim()).filter(Boolean)
      : []
    const extraOutcome: ExtraOutcome = body.extraOutcome === 'reported' ? 'reported' : 'none'
    const notes = String(body.notes || '').trim()
    const auditAnswers = Array.isArray(body.auditAnswers)
      ? body.auditAnswers
          .map((a) => {
            const itemId = String(a?.itemId || '').trim()
            const blockId = String(a?.blockId || '').trim()
            const type = String(a?.type || '').toLowerCase()
            const normalizedType: AnswerType =
              type === 'rating' ? 'rating' : type === 'photo' ? 'photo' : 'checklist'
            const photos = Array.isArray(a?.photos)
              ? a.photos
                  .map((p) => {
                    const url = String(p?.url || '').trim()
                    const path = String(p?.path || '').trim()
                    const size =
                      typeof p?.size === 'number' && Number.isFinite(p.size) && p.size > 0
                        ? p.size
                        : undefined
                    const mime = String(p?.type || '').trim()
                    return {
                      url,
                      path,
                      ...(size != null ? { size } : {}),
                      ...(mime ? { type: mime } : {}),
                    }
                  })
                  .filter((p) => p.url)
              : []

            if (!itemId) return null
            return {
              itemId,
              blockId: blockId || null,
              type: normalizedType,
              value: a?.value ?? null,
              photos,
            }
          })
          .filter((row): row is SanitizedAuditAnswer => row != null)
      : []

    if (!eventId || !department) {
      return NextResponse.json({ error: 'eventId i department son obligatoris' }, { status: 400 })
    }
    if (mode !== 'reopen' && incidentOutcome !== 'none' && incidentOutcome !== 'reported') {
      return NextResponse.json(
        { error: "Cal informar incidencies: 'none' o 'reported'" },
        { status: 400 }
      )
    }
    if (mode === 'finalize' && incidentOutcome === 'reported' && incidentIds.length === 0) {
      return NextResponse.json(
        { error: "Si hi ha incidencies, cal almenys una incidencia creada" },
        { status: 400 }
      )
    }
    if (!['admin', 'direccio', 'cap', 'comercial'].includes(auth.role)) {
      if (!auth.department || auth.department !== department) {
        return NextResponse.json({ error: 'Sense permisos per aquest departament' }, { status: 403 })
      }
    }

    const eventContext = await getEventStageContext(eventId)
    const requiresExtras = department === 'serveis' && isWeddingLn(eventContext?.lnKey)
    if (requiresExtras && mode === 'finalize' && extraOutcome === 'reported') {
      const extrasDocId = buildEventExtrasDocId(eventId, eventDay)
      const extrasSnap = await firestoreAdmin.collection('event_extras').doc(extrasDocId).get()
      const extrasCount = extrasSnap.exists
        ? Number((extrasSnap.data() as { entriesCount?: unknown })?.entriesCount || 0)
        : 0
      if (extrasCount <= 0) {
        return NextResponse.json(
          { error: "Has indicat extres, pero no n'hi ha cap registrat." },
          { status: 400 }
        )
      }
    }

    const visibleTemplate = await getVisibleTemplate(department)
    const now = Date.now()
    const { ref: runRef, snap: existingSnap, docId } = await findExistingExecutionRef(
      eventId,
      department,
      eventDay
    )

    if (mode === 'reopen') {
      if (!existingSnap.exists) {
        return NextResponse.json({ error: 'No existeix cap auditoria per reobrir' }, { status: 404 })
      }
      await runRef.set(
        {
          status: 'draft',
          completedAt: null,
          completedById: null,
          completedByName: null,
          compliancePct: 0,
          reviewBlockChecks: [],
          reviewItemChecks: [],
          reviewNote: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedByName: null,
          reopenedAt: now,
          reopenedById: auth.user.id,
          reopenedByName: auth.user.name || auth.user.email || 'Usuari',
          updatedAt: now,
        },
        { merge: true }
      )
      return NextResponse.json({ ok: true, executionId: docId, status: 'draft' }, { status: 200 })
    }

    const commonData = {
      eventId,
      eventSummary: eventSummary || null,
      eventCode: eventCode || null,
      eventLocation: eventLocation || null,
      eventDay: /^\d{4}-\d{2}-\d{2}$/.test(eventDay) ? eventDay : null,
      department,
      templateId: visibleTemplate?.id || null,
      templateName: visibleTemplate?.name || null,
      templateSnapshot: Array.isArray(visibleTemplate?.blocks) ? visibleTemplate?.blocks : [],
      incidentsReviewed: true,
      incidentOutcome,
      incidentIds,
      extrasRequired: requiresExtras,
      extraOutcome: requiresExtras ? extraOutcome : 'none',
      notes: notes || null,
      auditAnswers,
      updatedAt: now,
    }

    if (mode === 'save') {
      await runRef.set(
        {
          ...commonData,
          status: 'draft',
          completedAt: null,
          completedById: null,
          completedByName: null,
          compliancePct: 0,
          reviewBlockChecks: [],
          reviewItemChecks: [],
          reviewNote: null,
          reviewedAt: null,
          reviewedById: null,
          reviewedByName: null,
          savedAt: now,
          savedById: auth.user.id,
          savedByName: auth.user.name || auth.user.email || 'Usuari',
          savedByDepartment: auth.user.department || null,
        },
        { merge: true }
      )
      void registerAuditAnswersInIndex(docId, auditAnswers, {
        templateName: visibleTemplate?.name || null,
        eventTitle: eventSummary || null,
        createdAt: now,
        eventId,
        department,
      })

      return NextResponse.json(
        {
          ok: true,
          executionId: docId,
          status: 'draft',
          incidentOutcome,
          incidentIds,
          extraOutcome: requiresExtras ? extraOutcome : 'none',
          templateId: visibleTemplate?.id || null,
        },
        { status: 200 }
      )
    }

    await runRef.set(
      {
        ...commonData,
        status: 'completed',
        completedAt: now,
        completedById: auth.user.id,
        completedByName: auth.user.name || auth.user.email || 'Usuari',
        completedByDepartment: auth.user.department || null,
      },
      { merge: true }
    )

    void registerAuditAnswersInIndex(docId, auditAnswers, {
      templateName: visibleTemplate?.name || null,
      eventTitle: eventSummary || null,
      createdAt: now,
      eventId,
      department,
    })

    return NextResponse.json(
      {
        ok: true,
        executionId: docId,
        status: 'completed',
        incidentOutcome,
        incidentIds,
        extraOutcome: requiresExtras ? extraOutcome : 'none',
        templateId: visibleTemplate?.id || null,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
