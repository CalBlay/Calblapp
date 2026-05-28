// ✅ file: src/app/api/events/create/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import type { AccessUser } from '@/lib/accessControl'
import { isUiPermissionGranted } from '@/lib/server/permissions'

export const runtime = 'nodejs'

/**
 * 📥 POST — Crea un nou esdeveniment manual dins la col·lecció "stage_verd"
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const accessUser: AccessUser & { id: string } = {
      id: auth.user.id,
      role: auth.user.role,
      department: auth.user.department,
      canRespondSurveys: Boolean(auth.user.canRespondSurveys),
      isDepartmentRobaLead: Boolean(auth.user.isDepartmentRobaLead),
      robaLinkedPersonnelId: auth.user.robaLinkedPersonnelId ?? null,
      opsProjectsConfigurable:
        typeof auth.user.opsProjectsConfigurable === 'boolean'
          ? auth.user.opsProjectsConfigurable
          : undefined,
    }
    const ok = await isUiPermissionGranted({
      user: accessUser,
      permission: PERM.action('/menu/calendar', 'manual:create'),
    })
    if (!ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()

    // 🧩 Validació mínima
    if (!data.NomEvent || !data.DataInici) {
      return NextResponse.json(
        { error: 'Falten camps obligatoris: NomEvent o DataInici' },
        { status: 400 }
      )
    }

    // 🆔 ID segur i consistent
    const id = `manual_${Date.now()}`

    // 🧠 Prepara el payload final
    const codeValue = String(data.code || '').trim()
    const hasManualCode = codeValue !== ''

    const payload: Record<string, unknown> = {
      id,
      NomEvent: data.NomEvent,
      Servei: data.Servei || '',
      Comercial: data.Comercial || '',
      LN: data.LN || 'Altres',
      StageGroup: 'Confirmat',
      collection: 'stage_verd',
      origen: 'manual',
      DataInici: data.DataInici,
      DataFi: data.DataFi || data.DataInici,
      HoraInici: data.HoraInici || null,
      HoraFi: data.HoraFi || null,
      Ubicacio: data.Ubicacio || '',
      NumPax: data.NumPax ? Number(data.NumPax) : null,
      code: codeValue,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (hasManualCode) {
      payload.codeSource = 'manual'
      payload.codeConfirmed = true
    }

    console.log('🔥 Event manual creat:', payload)

    // 🔥 Desa al Firestore amb docId personalitzat
    await firestoreAdmin.collection('stage_verd').doc(id).set(payload)

    // 🟢 IMPORTANT — Retornem ID perquè CalendarNewEventModal pugui adjuntar fitxers
    return NextResponse.json({ success: true, id }, { status: 200 })

  } catch (err: unknown) {
    console.error('❌ Error creant esdeveniment manual:', err)
    return NextResponse.json(
      { error: 'Error desant a Firestore', details: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}

