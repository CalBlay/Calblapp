import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap'])
const isIsoDate = (value?: string | null) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())
const isTime = (value?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim())

type UpdateItem = {
  id: string
  PreparacioData?: string
  PreparacioHora?: string
}

async function authContext(req: NextRequest) {
  const token = await getToken({ req })
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: 'No autenticat' }, { status: 401 }) }
  }

  const role = normalizeRole(String((token as { role?: string }).role || 'treballador'))
  if (!EDIT_ROLES.has(role)) {
    return { error: NextResponse.json({ ok: false, error: 'Sense permisos' }, { status: 403 }) }
  }

  return { role }
}

function normalizeUpdates(body: unknown): UpdateItem[] {
  if (Array.isArray(body)) return body as UpdateItem[]
  if (body && typeof body === 'object' && Array.isArray((body as { updates?: UpdateItem[] }).updates)) {
    return (body as { updates: UpdateItem[] }).updates
  }
  if (body && typeof body === 'object') return [body as UpdateItem]
  return []
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authContext(req)
    if ('error' in auth) return auth.error

    const body = await req.json()
    const updates = normalizeUpdates(body)

    if (!updates.length) {
      return NextResponse.json({ ok: false, error: 'No hi ha canvis per guardar' }, { status: 400 })
    }

    const batch = db.batch()
    let applied = 0

    for (const item of updates) {
      const id = String(item?.id || '').trim()
      if (!id) {
        return NextResponse.json({ ok: false, error: 'Falta ID del document' }, { status: 400 })
      }

      const updateFields: Record<string, string> = {}

      if (item.PreparacioData !== undefined) {
        if (!isIsoDate(item.PreparacioData)) {
          return NextResponse.json(
            { ok: false, error: `PreparacioData invàlida per ${id}` },
            { status: 400 }
          )
        }
        updateFields.PreparacioData = item.PreparacioData
      }

      if (item.PreparacioHora !== undefined) {
        if (!isTime(item.PreparacioHora)) {
          return NextResponse.json(
            { ok: false, error: `PreparacioHora invàlida per ${id}` },
            { status: 400 }
          )
        }
        updateFields.PreparacioHora = item.PreparacioHora
      }

      if (!Object.keys(updateFields).length) continue

      batch.update(db.collection('stage_verd').doc(id), updateFields)
      applied += 1
    }

    if (!applied) {
      return NextResponse.json({ ok: false, error: 'Cap canvi vàlid per guardar' }, { status: 400 })
    }

    await batch.commit()

    return NextResponse.json({ ok: true, updated: applied })
  } catch (err) {
    console.error('Error actualitzant preparacio logistica:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
