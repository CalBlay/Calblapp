// âœ… file: src/app/api/calendar/manual/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import type { AccessUser } from '@/lib/accessControl'
import { isUiPermissionGranted } from '@/lib/server/permissions'

export const runtime = 'nodejs'

/* ----------------------------------------------------
   POST â†’ Crear esdeveniment manual
---------------------------------------------------- */
export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const accessUser: AccessUser & { id: string } = {
      id: auth.user.id,
      role: auth.user.role ?? undefined,
      department: auth.user.department ?? undefined,
      canRespondSurveys: Boolean(auth.user.canRespondSurveys),
      isDepartmentRobaLead: Boolean(auth.user.isDepartmentRobaLead),
      robaLinkedPersonnelId: auth.user.robaLinkedPersonnelId ?? null,
    }
    const ok = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action('/menu/calendar', 'manual:create'),
    })
    if (!ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as Record<string, unknown>

    if (!body.NomEvent || !body.DataInici) {
      return NextResponse.json(
        { error: 'Falten camps obligatoris: NomEvent o DataInici' },
        { status: 400 }
      )
    }

    const id = `manual_${Date.now()}`

    const codeValue = String(body.code || '').trim()
    const hasManualCode = codeValue !== ''

    const newEvent: Record<string, unknown> = {
      NomEvent: body.NomEvent,
      Servei: body.Servei || '',
      Comercial: body.Comercial || '',
      Responsable: String(body.Responsable || '').trim(),
      LN: body.LN || 'Altres',
      DataInici: body.DataInici,
      DataFi: body.DataFi || body.DataInici,
      NumPax: body.NumPax ? Number(body.NumPax) : null,
      Ubicacio: body.Ubicacio || '',
      code: codeValue, // IMPORTANT
      Hora: body.Hora || '',
      StageGroup: 'Confirmat',
      origen: 'manual',
      attachments: body.attachments || [],
      collection: 'verd',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (hasManualCode) {
      newEvent.codeSource = 'manual'
      newEvent.codeConfirmed = true
    }

    await db.collection('stage_verd').doc(id).set(newEvent)

    return NextResponse.json({ ok: true, id })
  } catch (err: unknown) {
    console.error('âŒ Error POST manual:', err)
    return NextResponse.json(
      { error: 'Error desant a Firestore', details: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}

/* ----------------------------------------------------
   GET â†’ Llistar esdeveniments manuals
---------------------------------------------------- */
export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const accessUser: AccessUser & { id: string } = {
      id: auth.user.id,
      role: auth.user.role ?? undefined,
      department: auth.user.department ?? undefined,
      canRespondSurveys: Boolean(auth.user.canRespondSurveys),
      isDepartmentRobaLead: Boolean(auth.user.isDepartmentRobaLead),
      robaLinkedPersonnelId: auth.user.robaLinkedPersonnelId ?? null,
    }
    const ok = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.view('/menu/calendar'),
    })
    if (!ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const snapshot = await db
      .collection('stage_verd')
      .where('origen', '==', 'manual')
      .get()

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    return NextResponse.json({ data })
  } catch (err: unknown) {
    console.error('âŒ Error GET manuals:', err)
    return NextResponse.json(
      { error: 'Error llegint de Firestore', details: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}


