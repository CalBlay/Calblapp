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
  isNew?: boolean
  sourceCollection?: 'stage_verd' | 'logistics_preparation_services'
  planningMode?: 'event' | 'service'
  PreparacioData?: string
  PreparacioHora?: string
  EventCode?: string
  NomEvent?: string
  NumPax?: string | number | null
  Ubicacio?: string
  DataInici?: string
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

function trimOrEmpty(value: unknown) {
  return String(value ?? '').trim()
}

function targetCollection(item: UpdateItem) {
  return item.sourceCollection === 'logistics_preparation_services'
    ? 'logistics_preparation_services'
    : 'stage_verd'
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

      const updateFields: Record<string, string | number | null | boolean> = {}

      if (item.PreparacioData !== undefined) {
        const value = trimOrEmpty(item.PreparacioData)
        if (value && !isIsoDate(value)) {
          return NextResponse.json(
            { ok: false, error: `PreparacioData invalida per ${id}` },
            { status: 400 }
          )
        }
        updateFields.PreparacioData = value
      }

      if (item.PreparacioHora !== undefined) {
        const value = trimOrEmpty(item.PreparacioHora)
        if (value && !isTime(value)) {
          return NextResponse.json(
            { ok: false, error: `PreparacioHora invalida per ${id}` },
            { status: 400 }
          )
        }
        updateFields.PreparacioHora = value
      }

      if (item.EventCode !== undefined) {
        const value = trimOrEmpty(item.EventCode)
        updateFields.code = value
        updateFields.codeConfirmed = value !== ''
        updateFields.codeSource = value !== '' ? 'manual' : ''
        if (item.planningMode === 'service' || item.sourceCollection === 'logistics_preparation_services') {
          updateFields.ParentEventCode = value
        }
      }

      if (item.NomEvent !== undefined) {
        const value = trimOrEmpty(item.NomEvent)
        updateFields.NomEvent = value
        if (item.planningMode === 'service' || item.sourceCollection === 'logistics_preparation_services') {
          updateFields.ParentEventName = value
        }
      }

      if (item.Ubicacio !== undefined) {
        updateFields.Ubicacio = trimOrEmpty(item.Ubicacio)
      }

      if (item.DataInici !== undefined) {
        const value = trimOrEmpty(item.DataInici)
        if (!value || !isIsoDate(value)) {
          return NextResponse.json(
            { ok: false, error: `DataInici invalida per ${id}` },
            { status: 400 }
          )
        }
        updateFields.DataInici = value
        updateFields.DataFi = value
        if (item.planningMode === 'service' || item.sourceCollection === 'logistics_preparation_services') {
          updateFields.ServiceDate = value
        }
      }

      if (item.NumPax !== undefined) {
        const value = trimOrEmpty(item.NumPax)
        if (!value) {
          updateFields.NumPax = null
        } else {
          const parsed = Number(value)
          if (!Number.isFinite(parsed) || parsed < 0) {
            return NextResponse.json(
              { ok: false, error: `NumPax invalid per ${id}` },
              { status: 400 }
            )
          }
          updateFields.NumPax = parsed
        }
      }

      if (!Object.keys(updateFields).length) continue

      if (item.isNew) {
        const dataInici = trimOrEmpty(updateFields.DataInici)
        const nomEvent = trimOrEmpty(updateFields.NomEvent)
        if (!dataInici || !nomEvent) {
          return NextResponse.json(
            { ok: false, error: `Les files noves necessiten NomEvent i DataInici (${id})` },
            { status: 400 }
          )
        }

        const createdId = `manual_${Date.now()}_${applied}`
        const code = trimOrEmpty(updateFields.code)
        const payload: Record<string, string | number | null | boolean> = {
          id: createdId,
          NomEvent: nomEvent,
          Servei: '',
          Comercial: '',
          LN: 'Altres',
          StageGroup: 'Confirmat',
          collection: 'stage_verd',
          origen: 'manual',
          DataInici: dataInici,
          DataFi: trimOrEmpty(updateFields.DataFi) || dataInici,
          HoraInici: '',
          HoraFi: '',
          Ubicacio: trimOrEmpty(updateFields.Ubicacio),
          NumPax: updateFields.NumPax ?? null,
          code,
          PreparacioData: trimOrEmpty(updateFields.PreparacioData),
          PreparacioHora: trimOrEmpty(updateFields.PreparacioHora),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          codeConfirmed: code !== '',
          codeSource: code !== '' ? 'manual' : '',
        }

        batch.set(db.collection('stage_verd').doc(createdId), payload)
      } else {
        updateFields.updatedAt = new Date().toISOString()
        batch.update(db.collection(targetCollection(item)).doc(id), updateFields)
      }

      applied += 1
    }

    if (!applied) {
      return NextResponse.json({ ok: false, error: 'Cap canvi valid per guardar' }, { status: 400 })
    }

    await batch.commit()

    return NextResponse.json({ ok: true, updated: applied })
  } catch (err) {
    console.error('Error actualitzant preparacio logistica:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
