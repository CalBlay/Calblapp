import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import {
  SPACES_MANUAL_RESERVES_COLLECTION,
  SPACES_ACTION,
  SPACES_RESERVES_PATH,
} from '@/lib/spacesPermissions'
import { requireSpacesAction, requireSpacesEdit } from '@/lib/server/spacesApiAuth'
import { upsertSpacesZohoClient } from '@/services/spaces/zohoClients'

export const runtime = 'nodejs'

function normalizeText(value: unknown): string {
  return (value || '').toString().trim()
}

async function canCreateManualReserves(
  auth: AuthSuccess
): Promise<boolean> {
  const canAction = await requireSpacesAction(
    auth,
    SPACES_ACTION.RESERVES_MANUAL_CREATE,
    SPACES_RESERVES_PATH
  )
  if (canAction) return true
  return requireSpacesEdit(auth, SPACES_RESERVES_PATH)
}

async function canMutateManualReserveDoc(
  auth: AuthSuccess,
  docData: Record<string, unknown>
): Promise<boolean> {
  const ownerId = normalizeText(docData.createdBy)
  if (ownerId && ownerId === auth.user.id) return true
  return requireSpacesEdit(auth, SPACES_RESERVES_PATH)
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    if (!(await canCreateManualReserves(auth))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as Record<string, unknown>
    const comercial = normalizeText(body.Comercial)
    const nomClient = normalizeText(body.NomClient)
    const comentari = normalizeText(body.Comentari)
    const ubicacio = normalizeText(body.Ubicacio)
    const dataInici = normalizeText(body.DataInici)

    if (!comercial || !nomClient || !ubicacio || !dataInici) {
      return NextResponse.json(
        {
          error:
            'Falten camps obligatoris: Comercial, NomClient, Ubicacio o DataInici',
        },
        { status: 400 }
      )
    }

    const dataFi = normalizeText(body.DataFi) || dataInici
    const id = `spaces_manual_${Date.now()}`
    const now = new Date().toISOString()
    const userName = normalizeText(auth.user.name)
    const userEmail = normalizeText(auth.user.email)

    await db.collection(SPACES_MANUAL_RESERVES_COLLECTION).doc(id).set({
      Comercial: comercial,
      NomClient: nomClient,
      Comentari: comentari,
      Ubicacio: ubicacio,
      DataInici: dataInici,
      DataFi: dataFi,
      origen: 'spaces_manual',
      createdBy: auth.user.id,
      createdByName: userName || null,
      createdByEmail: userEmail || null,
      createdAt: now,
      updatedAt: now,
    })

    try {
      await upsertSpacesZohoClient(nomClient, 'manual')
    } catch (clientErr) {
      console.warn('[API-SPACES-MANUAL-RESERVES] client upsert', clientErr)
    }

    return NextResponse.json({ ok: true, id })
  } catch (err: unknown) {
    console.error('[API-SPACES-MANUAL-RESERVES] POST', err)
    return NextResponse.json(
      {
        error: 'Error desant la reserva manual',
        details: err instanceof Error ? err.message : 'Error intern',
      },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const body = (await req.json()) as Record<string, unknown>
    const id = normalizeText(body.id)
    if (!id) {
      return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    }

    const ref = db.collection(SPACES_MANUAL_RESERVES_COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Reserva no trobada' }, { status: 404 })
    }

    const existing = snap.data() as Record<string, unknown>
    if (!(await canMutateManualReserveDoc(auth, existing))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const comercial = normalizeText(body.Comercial)
    const nomClient = normalizeText(body.NomClient)
    const comentari = normalizeText(body.Comentari)
    const ubicacio = normalizeText(body.Ubicacio)
    const dataInici = normalizeText(body.DataInici)

    if (!comercial || !nomClient || !ubicacio || !dataInici) {
      return NextResponse.json(
        {
          error:
            'Falten camps obligatoris: Comercial, NomClient, Ubicacio o DataInici',
        },
        { status: 400 }
      )
    }

    const dataFi = normalizeText(body.DataFi) || dataInici
    const now = new Date().toISOString()

    await ref.set(
      {
        Comercial: comercial,
        NomClient: nomClient,
        Comentari: comentari,
        Ubicacio: ubicacio,
        DataInici: dataInici,
        DataFi: dataFi,
        updatedAt: now,
      },
      { merge: true }
    )

    try {
      await upsertSpacesZohoClient(nomClient, 'manual')
    } catch (clientErr) {
      console.warn('[API-SPACES-MANUAL-RESERVES] client upsert', clientErr)
    }

    return NextResponse.json({ ok: true, id })
  } catch (err: unknown) {
    console.error('[API-SPACES-MANUAL-RESERVES] PATCH', err)
    return NextResponse.json(
      {
        error: 'Error actualitzant la reserva manual',
        details: err instanceof Error ? err.message : 'Error intern',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const id = normalizeText(searchParams.get('id'))
    if (!id) {
      return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    }

    const ref = db.collection(SPACES_MANUAL_RESERVES_COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Reserva no trobada' }, { status: 404 })
    }

    const existing = snap.data() as Record<string, unknown>
    if (!(await canMutateManualReserveDoc(auth, existing))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[API-SPACES-MANUAL-RESERVES] DELETE', err)
    return NextResponse.json(
      {
        error: 'Error eliminant la reserva manual',
        details: err instanceof Error ? err.message : 'Error intern',
      },
      { status: 500 }
    )
  }
}
