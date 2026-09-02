// ✅ file: src/app/api/calendar/manual/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import type { AccessUser } from '@/lib/accessControl'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import {
  isAllowedCalendarManualAttachField,
  isAllowedCalendarManualCollection,
  pickCalendarManualPutFields,
} from '@/lib/calendar/calendarManualCollection'

function accessUserFromSession(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean | null
  isDepartmentRobaLead?: boolean | null
  robaLinkedPersonnelId?: string | null
}): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
  }
}


export const runtime = 'nodejs'

const MODAL_OVERRIDE_FIELDS = new Set([
  'LN',
  'code',
  'NomEvent',
  'DataInici',
  'DataFi',
  'HoraInici',
  'HoraFi',
  'NumPax',
  'Ubicacio',
  'Servei',
  'Comercial',
  'ComercialIntern',
  'Responsable',
])

const comparable = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * 🟢 POST — Desa o actualitza un fitxer adjunt (file1, file2, ...)
 * Cridat des de l'AttachFileButton
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = await params

  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const ok = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: PERM.action('/menu/calendar', 'attach:sharepoint'),
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { collection = 'stage_verd', field = 'file1', url, name } = body as {
      collection?: string
      field?: string
      url?: string
      name?: string
    }

    if (!collection || !id || !url) {
      return NextResponse.json(
        { error: 'Falten camps obligatoris (collection, id, url)' },
        { status: 400 }
      )
    }

    if (!isAllowedCalendarManualCollection(collection)) {
      return NextResponse.json({ error: 'Col·lecció invàlida' }, { status: 400 })
    }

    const attachField = String(field || '').trim()
    if (!isAllowedCalendarManualAttachField(attachField)) {
      return NextResponse.json({ error: 'Camp de fitxer invàlid' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      [attachField]: url,
      updatedAt: new Date().toISOString(),
    }
    const fileName = String(name || '').trim()
    if (fileName) {
      payload[`${attachField}Name`] = fileName
    }

    await db.collection(collection).doc(id).set(payload, { merge: true })

    console.log(`✅ Fitxer ${attachField} desat correctament a ${collection}/${id}`)
    return NextResponse.json({ ok: true, field: attachField, url })
  } catch (err) {
    console.error('❌ Error POST fitxer manual:', err)
    return NextResponse.json({ error: 'Error desant fitxer' }, { status: 500 })
  }
}

/**
 * ✏️ PUT — Actualitza camps generals de l’esdeveniment
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = await params

  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const ok = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: PERM.action('/menu/calendar', 'manual:update'),
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const { collection, ...data } = body as Record<string, unknown>

    if (!collection || typeof collection !== 'string') {
      console.error('❌ Falta la col·lecció o és invàlida:', collection)
      return NextResponse.json({ error: 'Falta la col·lecció' }, { status: 400 })
    }

    if (!isAllowedCalendarManualCollection(collection)) {
      console.error('❌ Col·lecció invàlida:', collection)
      return NextResponse.json({ error: 'Col·lecció invàlida' }, { status: 400 })
    }

    const safeData = pickCalendarManualPutFields(data, MODAL_OVERRIDE_FIELDS)

    const docRef = db.collection(collection).doc(id)
    const now = new Date().toISOString()
    let codeMeta: Record<string, unknown> = {}
    const snap = await docRef.get()
    const previous = snap.exists ? snap.data() || {} : {}
    const manualOverrides: Record<string, true> = {
      ...((previous.manualOverrides && typeof previous.manualOverrides === 'object'
        ? previous.manualOverrides
        : {}) as Record<string, true>),
    }

    if (Object.prototype.hasOwnProperty.call(safeData, 'code')) {
      const prevCode = String(snap.get('code') || '').trim()
      const nextCode = String(safeData.code || '').trim()
      if (prevCode !== nextCode) {
        codeMeta = {
          codeSource: 'manual',
          codeConfirmed: Boolean(nextCode),
        }
      }
    }

    for (const [field, value] of Object.entries(safeData)) {
      if (!MODAL_OVERRIDE_FIELDS.has(field)) continue
      if (comparable(previous[field]) !== comparable(value)) {
        manualOverrides[field] = true
      }
    }

    await docRef.set(
      {
        ...safeData,
        ...codeMeta,
        manualOverrides,
        manualUpdatedAt: now,
        updatedAt: now,
      },
      { merge: true }
    )

    console.log(`✅ Esdeveniment ${id} actualitzat correctament a ${collection}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('❌ Error actualitzant esdeveniment:', err)
    return NextResponse.json({ error: 'Error actualitzant esdeveniment' }, { status: 500 })
  }
}

/**
 * 🗑️ DELETE — Elimina l’esdeveniment complet
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const ok = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: PERM.action('/menu/calendar', 'manual:delete'),
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const url = new URL(req.url)
    const collection = url.searchParams.get('collection')

    if (!collection || !isAllowedCalendarManualCollection(collection)) {
      console.error('❌ Col·lecció invàlida o buida:', collection)
      return NextResponse.json({ error: 'Col·lecció invàlida' }, { status: 400 })
    }

    await db.collection(collection).doc(id).delete()

    console.log(`🗑️ Esdeveniment ${id} eliminat de ${collection}`)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error eliminant esdeveniment'
    console.error('Error DELETE:', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
