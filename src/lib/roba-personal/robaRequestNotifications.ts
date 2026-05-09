import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { normDeptLabel } from '@/lib/roba-personal/requestPermissions'

const PROD = DOTACIO_COLLECTIONS.products
const MAX_ROBA_REQUEST_BODY_CHARS = 3500

function mergeLinesByProduct(
  lines: Array<{ productId: string; quantity: number }>
): Array<{ productId: string; quantity: number }> {
  const m = new Map<string, number>()
  for (const l of lines) {
    const id = String(l.productId || '').trim()
    const q = Number(l.quantity)
    if (!id || !Number.isFinite(q) || q <= 0) continue
    m.set(id, (m.get(id) || 0) + q)
  }
  return [...m.entries()].map(([productId, quantity]) => ({ productId, quantity }))
}

async function linesSummaryForRobaRequest(
  lines: Array<{ productId: string; quantity: number }>
): Promise<string> {
  const merged = mergeLinesByProduct(lines)
  if (merged.length === 0) return ''

  const ids = merged.map((l) => l.productId)
  const labelById = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(PROD).doc(id)))
    for (const s of snaps) {
      if (!s.exists) continue
      const d = s.data() as { code?: string; name?: string; size?: string }
      const code = String(d.code || '').trim()
      const name = String(d.name || '').trim()
      const size = String(d.size || '').trim()
      const base =
        code && name
          ? `${code} — ${name}${size ? ` (${size})` : ''}`
          : code || name || s.id
      labelById.set(s.id, base)
    }
  }

  const parts = merged.map((l) => {
    const lb = labelById.get(l.productId) || l.productId
    return `${lb} × ${l.quantity}`
  })
  let out = parts.join('; ')
  if (out.length > MAX_ROBA_REQUEST_BODY_CHARS) {
    out = `${out.slice(0, MAX_ROBA_REQUEST_BODY_CHARS - 1)}…`
  }
  return out
}

const normLower = (s?: string) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** Usuari d’app vinculat a un document `personnel` (mateix id o camp `userId`). */
export async function lookupAppUserIdForPersonnelId(personnelId: string): Promise<string | null> {
  const rawId = String(personnelId || '').trim()
  if (!rawId) return null
  const userDoc = await db.collection('users').doc(rawId).get()
  if (userDoc.exists) return userDoc.id
  const byUserId = await db.collection('users').where('userId', '==', rawId).limit(1).get()
  if (!byUserId.empty) return byUserId.docs[0].id
  return null
}

/** Departament que rep les alertes de noves sol·licituds de roba (coincideix amb {@link DEPARTMENTS}). */
const RRHH_DEPARTMENT_LOWER = normLower('Recursos Humans')

export async function notifyRecursosHumansNewRobaRequest(params: {
  requestId: string
  reference: string
  requestingDepartment: string
  requestedByWorkerName: string
  lineCount: number
  lines: Array<{ productId: string; quantity: number }>
  createdByUserName?: string | null
}): Promise<void> {
  const snap = await db
    .collection('users')
    .where('departmentLower', '==', RRHH_DEPARTMENT_LOWER)
    .get()

  const uids = snap.docs.map((d) => d.id).filter(Boolean)
  if (!uids.length) return

  const worker = String(params.requestedByWorkerName || '').trim() || 'Sense nom'
  const dept = String(params.requestingDepartment || '').trim()
  const refCode = String(params.reference || '').trim()
  const linesSummary = await linesSummaryForRobaRequest(params.lines)
  const tram = String(params.createdByUserName || '').trim()
  const title = 'Nova sol·licitud de roba personal'
  const bodyParts = [
    `Treballador: ${worker}`,
    dept ? `Departament: ${dept}` : null,
    refCode ? `Referència: ${refCode}` : null,
    tram && tram !== worker ? `Tramitat per: ${tram}` : null,
    linesSummary
      ? `Material: ${linesSummary}`
      : `${params.lineCount} línia(es) (sense detall de producte)`,
  ].filter(Boolean)
  const body = bodyParts.join('\n')

  const now = Date.now()
  const batch = db.batch()

  for (const uid of uids) {
    const ref = db.collection('users').doc(uid).collection('notifications').doc()
    batch.set(ref, {
      type: 'roba_personal_request',
      title,
      body,
      requestId: params.requestId,
      reference: params.reference,
      requestingDepartment: params.requestingDepartment,
      requestedByWorkerName: worker,
      linesSummary: linesSummary || null,
      lineCount: params.lineCount,
      createdByUserName: tram || null,
      createdAt: now,
      read: false,
    })
  }

  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await Promise.all(
      uids.map((uid) =>
        rest.channels.get(`user:${uid}:notifications`).publish('created', {
          type: 'roba_personal_request',
          requestId: params.requestId,
          createdAt: now,
        })
      )
    )
  } catch (err) {
    console.error('[robaRequestNotifications] Ably publish error', err)
  }
}

/** Notifica el sol·licitant (app): material preparat + dia de recollida. */
export async function notifyRobaRequestMaterialReady(params: {
  targetUserId: string
  requestId: string
  reference: string
  requestingDepartment: string
  pickupDate: string
  workerName?: string
  /** Missatge de RRHH (disponibilitat, retard d’estoc, etc.) */
  pickupAvailabilityMessage?: string
}): Promise<void> {
  const uid = String(params.targetUserId || '').trim()
  if (!uid) return

  const title = 'Roba: material preparat (recollida a RRHH)'
  const extra = params.pickupAvailabilityMessage?.trim()
    ? ` · ${params.pickupAvailabilityMessage.trim()}`
    : ''
  const body = `${params.reference} · ${params.requestingDepartment} · data prevista de recollida al magatzem/RRHH: ${params.pickupDate}${params.workerName ? ` · treballador: ${params.workerName}` : ''}${extra}`

  const now = Date.now()
  const ref = db.collection('users').doc(uid).collection('notifications').doc()
  await ref.set({
    type: 'roba_personal_ready',
    title,
    body,
    requestId: params.requestId,
    reference: params.reference,
    requestingDepartment: params.requestingDepartment,
    pickupDate: params.pickupDate,
    requestedByWorkerName: params.workerName ?? null,
    createdAt: now,
    read: false,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await rest.channels.get(`user:${uid}:notifications`).publish('created', {
      type: 'roba_personal_ready',
      requestId: params.requestId,
      createdAt: now,
    })
  } catch (err) {
    console.error('[robaRequestNotifications] Ably publish ready error', err)
  }
}

/**
 * Avisa els usuaris marcats com a responsables de roba del departament sol·licitant
 * (mateix missatge que el sol·licitant: data + nota de disponibilitat).
 */
export async function notifyRobaDepartmentLeadsPickupDate(params: {
  requestingDepartment: string
  excludeUserIds?: string[]
  requestId: string
  reference: string
  pickupDate: string
  workerName?: string
  pickupAvailabilityMessage?: string
}): Promise<void> {
  const deptKey = normDeptLabel(params.requestingDepartment)
  if (!deptKey) return

  const snap = await db.collection('users').where('departmentLower', '==', deptKey).get()
  const exclude = new Set(
    (params.excludeUserIds || []).map((x) => String(x).trim()).filter(Boolean)
  )

  const uids = snap.docs
    .filter((d) => (d.data() as { isDepartmentRobaLead?: boolean }).isDepartmentRobaLead === true)
    .map((d) => d.id)
    .filter((id) => Boolean(id) && !exclude.has(id))

  if (!uids.length) return

  const title = 'Roba: data de recollida al magatzem (cap de roba)'
  const extra = params.pickupAvailabilityMessage?.trim()
    ? ` · ${params.pickupAvailabilityMessage.trim()}`
    : ''
  const body = `${params.reference} · ${params.requestingDepartment} · el material es pot recollir a RRHH el ${params.pickupDate}${params.workerName ? ` · sol·licitant/treballador: ${params.workerName}` : ''}${extra}`

  const now = Date.now()
  const batch = db.batch()

  for (const uid of uids) {
    const ref = db.collection('users').doc(uid).collection('notifications').doc()
    batch.set(ref, {
      type: 'roba_personal_ready',
      title,
      body,
      requestId: params.requestId,
      reference: params.reference,
      requestingDepartment: params.requestingDepartment,
      pickupDate: params.pickupDate,
      requestedByWorkerName: params.workerName ?? null,
      createdAt: now,
      read: false,
    })
  }

  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await Promise.all(
      uids.map((uid) =>
        rest.channels.get(`user:${uid}:notifications`).publish('created', {
          type: 'roba_personal_ready',
          requestId: params.requestId,
          createdAt: now,
        })
      )
    )
  } catch (err) {
    console.error('[robaRequestNotifications] Ably dept lead pickup error', err)
  }
}

/**
 * El responsable de roba / RRHH ha registrat l’entrega: el treballador amb usuari rep avís per confirmar recepció.
 */
export async function notifyRobaWorkerDeliveryAck(params: {
  targetUserId: string
  deliveryId: string
  requestId: string
  deliveryReference: string
  requestingDepartment?: string
}): Promise<void> {
  const uid = String(params.targetUserId || '').trim()
  if (!uid) return

  const title = 'Roba: confirmeu la recepció (lliurament al treballador)'
  const dept = String(params.requestingDepartment || '').trim()
  const body = dept
    ? `${params.deliveryReference} · ${dept} · RRHH o el responsable de roba del departament ha registrat el lliurament al treballador. Reviseu el material i confirmeu amb signatura.`
    : `${params.deliveryReference} · RRHH o el responsable de roba ha registrat el lliurament al treballador. Reviseu el material i confirmeu amb signatura.`

  const now = Date.now()
  const ref = db.collection('users').doc(uid).collection('notifications').doc()
  await ref.set({
    type: 'roba_personal_delivery_ack',
    title,
    body,
    deliveryId: params.deliveryId,
    requestId: params.requestId,
    reference: params.deliveryReference,
    requestingDepartment: dept || null,
    createdAt: now,
    read: false,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await rest.channels.get(`user:${uid}:notifications`).publish('created', {
      type: 'roba_personal_delivery_ack',
      deliveryId: params.deliveryId,
      requestId: params.requestId,
      createdAt: now,
    })
  } catch (err) {
    console.error('[robaRequestNotifications] Ably delivery ack error', err)
  }
}

/**
 * El treballador indica que el material registrat a l’entrega no coincideix; avisa qui va registrar l’entrega.
 */
export async function notifyRobaResponsibleDeliveryDispute(params: {
  targetUserId: string
  deliveryId: string
  deliveryReference: string
  workerName?: string
  note?: string
}): Promise<void> {
  const uid = String(params.targetUserId || '').trim()
  if (!uid) return

  const extra = params.note?.trim() ? ` · ${params.note.trim().slice(0, 200)}` : ''
  const who = params.workerName?.trim() ? `${params.workerName.trim()} · ` : ''
  const title = 'Roba: incidència en una entrega'
  const body = `${who}${params.deliveryReference} · el treballador indica que el material no és correcte.${extra}`

  const now = Date.now()
  const ref = db.collection('users').doc(uid).collection('notifications').doc()
  await ref.set({
    type: 'roba_personal_delivery_dispute',
    title,
    body,
    deliveryId: params.deliveryId,
    reference: params.deliveryReference,
    createdAt: now,
    read: false,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await rest.channels.get(`user:${uid}:notifications`).publish('created', {
      type: 'roba_personal_delivery_dispute',
      deliveryId: params.deliveryId,
      createdAt: now,
    })
  } catch (err) {
    console.error('[robaRequestNotifications] Ably delivery dispute error', err)
  }
}

/** Després de corregir línies d’entrega: torna a avisar el treballador per confirmar. */
export async function notifyRobaWorkerDeliveryRevised(params: {
  targetUserId: string
  deliveryId: string
  requestId: string
  deliveryReference: string
  requestingDepartment?: string
}): Promise<void> {
  const uid = String(params.targetUserId || '').trim()
  if (!uid) return

  const dept = String(params.requestingDepartment || '').trim()
  const title = 'Roba: entrega actualitzada (confirmeu recepció)'
  const body = dept
    ? `${params.deliveryReference} · ${dept} · RRHH o el cap de roba ha corregit el registre del lliurament; reviseu el material i torneu a confirmar amb signatura.`
    : `${params.deliveryReference} · s’ha corregit el registre del lliurament; reviseu el material i torneu a confirmar amb signatura.`

  const now = Date.now()
  const ref = db.collection('users').doc(uid).collection('notifications').doc()
  await ref.set({
    type: 'roba_personal_delivery_revised',
    title,
    body,
    deliveryId: params.deliveryId,
    requestId: params.requestId,
    reference: params.deliveryReference,
    requestingDepartment: dept || null,
    createdAt: now,
    read: false,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) return

  try {
    const Ably = (await import('ably')).default
    const rest = new Ably.Rest({ key: apiKey })
    await rest.channels.get(`user:${uid}:notifications`).publish('created', {
      type: 'roba_personal_delivery_revised',
      deliveryId: params.deliveryId,
      requestId: params.requestId,
      createdAt: now,
    })
  } catch (err) {
    console.error('[robaRequestNotifications] Ably delivery revised error', err)
  }
}
