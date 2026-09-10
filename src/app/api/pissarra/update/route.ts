//filename: src/app/api/pissarra/update/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { JWT } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { CALENDAR_MANUAL_OVERRIDE_FIELDS } from '@/lib/calendar/manualOverrides'

// “La Bíblia” §3 Rols i Permisos — només Admin o Producció poden editar

export const runtime = 'nodejs'

export async function PUT(req: NextRequest) {
  try {
    const token = (await getToken({ req })) as JWT | null
    const role = normalizeRole(token?.role)
    const department = token?.department?.toLowerCase()

    const canEdit = role === 'admin' || department === 'produccio'
    if (!canEdit) {
      return NextResponse.json({ error: 'No autoritzat' }, { status: 403 })
    }

    const body = (await req.json()) as { id?: string; payload?: Record<string, unknown> }
    const { id, payload } = body
    if (!id || !payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Falten camps' }, { status: 400 })
    }

    const protectedFields = Object.keys(payload).filter((field) =>
      CALENDAR_MANUAL_OVERRIDE_FIELDS.has(field)
    )
    if (protectedFields.length > 0) {
      return NextResponse.json(
        {
          error: `Els camps de calendari s'han d'editar des del modal: ${protectedFields.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Si es canvia responsableName i hi ha code, cal reflectir-ho a quadrantsServeis
    // però la font principal és stage_verd: primer actualitzem stage_verd
    const ref = db.collection('stage_verd').doc(id)
    const now = new Date().toISOString()
    await ref.update({
      ...payload,
      lastWriteSource: 'pissarra',
      lastWriteAt: now,
    })

    // opcional: sincronitzar responsable a quadrantsServeis si arriba
    if (Object.prototype.hasOwnProperty.call(payload, 'responsableName')) {
      const doc = await ref.get()
      const data = doc.data() as { code?: string } | undefined
      const code = data?.code
      if (code) {
        const qs = await db.collection('quadrantsServeis').where('code', '==', code).limit(1).get()
        if (!qs.empty) {
          const name = payload.responsableName
          await qs.docs[0].ref.update({
            responsableName: typeof name === 'string' ? name : name != null ? String(name) : '',
          })
        }
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: unknown) {
    console.error('[api/pissarra/update] PUT error', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
