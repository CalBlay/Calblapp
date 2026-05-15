import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import { normDeptLabel } from '@/lib/roba-personal/requestPermissions'
import { sendOutlookTextMail } from '@/services/graph/calendar'
import * as XLSX from 'xlsx'

const PROD = DOTACIO_COLLECTIONS.products
const MAX_ROBA_REQUEST_BODY_CHARS = 3500
const RECIPIENT_CACHE_MS = 60_000

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

async function buildRobaRequestMailAttachment(params: {
  reference: string
  requestingDepartment: string
  requestedByWorkerName: string
  lines: Array<{ productId: string; quantity: number }>
}) {
  const merged = mergeLinesByProduct(params.lines)
  const ids = merged.map((l) => l.productId)
  const labelById = new Map<
    string,
    { code: string; name: string; size: string }
  >()
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(PROD).doc(id)))
    for (const s of snaps) {
      if (!s.exists) continue
      const d = s.data() as { code?: string; name?: string; size?: string }
      labelById.set(s.id, {
        code: String(d.code || '').trim(),
        name: String(d.name || '').trim(),
        size: String(d.size || '').trim(),
      })
    }
  }

  const rows = merged.map((line) => {
    const product = labelById.get(line.productId)
    return {
      Codi: product?.code || line.productId,
      Article: product?.name || line.productId,
      Talla: product?.size || '',
      Quantitat: line.quantity,
    }
  })

  const wb = XLSX.utils.book_new()
  const generatedAt = new Date()
  const titleRows = [
    ['CAL BLAY'],
    ['Sol·licitud de preparacio de roba personal'],
    [],
    ['Referencia', params.reference || '-'],
    ['Treballador', params.requestedByWorkerName || '-'],
    ['Departament', params.requestingDepartment || '-'],
    ['Data generacio', generatedAt.toLocaleString('ca-ES')],
    [],
  ]
  const ws = XLSX.utils.aoa_to_sheet(titleRows)
  XLSX.utils.sheet_add_json(ws, rows, {
    origin: 'A10',
    skipHeader: false,
  })
  ws['!cols'] = [
    { wch: 16 },
    { wch: 42 },
    { wch: 12 },
    { wch: 12 },
  ]
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Sollicitud')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const safeRef = String(params.reference || 'sollicitud-roba').replace(/[^\w.-]+/g, '-')

  return {
    name: `${safeRef}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBytesBase64: buffer.toString('base64'),
  }
}

async function buildRobaRequestBatchMailAttachment(params: {
  batchReference: string
  requests: Array<{
    reference: string
    requestingDepartment: string
    requestedByWorkerName: string
    createdByUserName?: string | null
    lines: Array<{ productId: string; quantity: number }>
  }>
}) {
  const allProductIds = params.requests.flatMap((request) => request.lines.map((line) => line.productId))
  const labelById = await getProductMetaMap(allProductIds)

  const rows = params.requests.flatMap((request) =>
    mergeLinesByProduct(request.lines).map((line) => {
      const product = labelById.get(line.productId)
      return {
        Referencia: request.reference || '-',
        Departament: request.requestingDepartment || '-',
        Treballador: request.requestedByWorkerName || '-',
        Sollicitant: String(request.createdByUserName || '').trim() || '-',
        Codi: product?.code || line.productId,
        Article: product?.name || line.productId,
        Talla: product?.size || '',
        Quantitat: line.quantity,
      }
    })
  )

  const wb = XLSX.utils.book_new()
  const generatedAt = new Date()
  const ws = XLSX.utils.aoa_to_sheet([
    ['CAL BLAY'],
    ['Remesa agrupada de roba personal a RRHH'],
    [],
    ['Referencia remesa', params.batchReference || '-'],
    ['Nombre de sollicituds', params.requests.length],
    ['Data generacio', generatedAt.toLocaleString('ca-ES')],
    [],
  ])
  XLSX.utils.sheet_add_json(ws, rows, {
    origin: 'A9',
    skipHeader: false,
  })
  ws['!cols'] = [
    { wch: 20 },
    { wch: 22 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 38 },
    { wch: 12 },
    { wch: 12 },
  ]
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Remesa RRHH')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const safeRef = String(params.batchReference || 'remesa-roba').replace(/[^\w.-]+/g, '-')

  return {
    name: `${safeRef}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    contentBytesBase64: buffer.toString('base64'),
  }
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

type RrhhRecipient = {
  userId: string
  name: string
  email: string | null
}

let rrhhRecipientsCache:
  | {
      expiresAt: number
      value: RrhhRecipient[]
    }
  | null = null

const deptLeadRecipientsCache = new Map<string, { expiresAt: number; value: string[] }>()

async function getProductMetaMap(
  ids: string[]
): Promise<Map<string, { code: string; name: string; size: string }>> {
  const out = new Map<string, { code: string; name: string; size: string }>()
  const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))]
  for (let i = 0; i < uniqueIds.length; i += 10) {
    const chunk = uniqueIds.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(PROD).doc(id)))
    for (const s of snaps) {
      if (!s.exists) continue
      const d = s.data() as { code?: string; name?: string; size?: string }
      out.set(s.id, {
        code: String(d.code || '').trim(),
        name: String(d.name || '').trim(),
        size: String(d.size || '').trim(),
      })
    }
  }
  return out
}

async function getProductLabelMap(ids: string[]): Promise<Map<string, string>> {
  const meta = await getProductMetaMap(ids)
  const out = new Map<string, string>()
  for (const [id, product] of meta) {
    const base =
      product.code && product.name
        ? `${product.code} â€” ${product.name}${product.size ? ` (${product.size})` : ''}`
        : product.code || product.name || id
    out.set(id, base)
  }
  return out
}

function parseExtraEmails(raw?: string | null): string[] {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

function uniqueEmailList(raw?: string | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const email of parseExtraEmails(raw)) {
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }
  return out
}

async function listRrhhRecipients(): Promise<RrhhRecipient[]> {
  if (rrhhRecipientsCache && rrhhRecipientsCache.expiresAt > Date.now()) {
    return rrhhRecipientsCache.value
  }
  const snap = await db
    .collection('users')
    .where('departmentLower', '==', RRHH_DEPARTMENT_LOWER)
    .get()

  const recipients = snap.docs.map((d) => {
    const data = d.data() as { name?: string; email?: string }
    const name = String(data.name || '').trim() || 'Sense nom'
    const emailRaw = String(data.email || '').trim()
    return {
      userId: d.id,
      name,
      email: emailRaw.includes('@') ? emailRaw : null,
    }
  })
  rrhhRecipientsCache = {
    expiresAt: Date.now() + RECIPIENT_CACHE_MS,
    value: recipients,
  }
  return recipients
}

async function listDepartmentLeadUserIds(params: {
  requestingDepartment: string
  excludeUserIds?: string[]
}): Promise<string[]> {
  const dept = String(params.requestingDepartment || '').trim()
  if (!dept) return []

  const exclude = new Set(
    (params.excludeUserIds || []).map((x) => String(x).trim()).filter(Boolean)
  )
  const cacheKey = normLower(dept)
  const cached = deptLeadRecipientsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value.filter((id) => !exclude.has(id))
  }

  const snap = await db.collection('users').get()
  const userIds = snap.docs
    .filter((d) => {
      const data = d.data() as {
        isDepartmentRobaLead?: boolean
        departmentLower?: string
        department?: string
      }
      if (data.isDepartmentRobaLead !== true) return false
      if (!d.id || exclude.has(d.id)) return false
      const userDept = String(data.departmentLower || data.department || '').trim()
      return Boolean(userDept) && departmentsInSameRobaScope(userDept, dept)
    })
    .map((d) => d.id)
  deptLeadRecipientsCache.set(cacheKey, {
    expiresAt: Date.now() + RECIPIENT_CACHE_MS,
    value: userIds,
  })
  return userIds.filter((id) => !exclude.has(id))
}

export async function notifyRecursosHumansNewRobaRequest(params: {
  requestId: string
  reference: string
  requestingDepartment: string
  requestedByWorkerName: string
  lineCount: number
  lines: Array<{ productId: string; quantity: number }>
  createdByUserName?: string | null
}): Promise<void> {
  const recipients = await listRrhhRecipients()
  const uids = recipients.map((r) => r.userId).filter(Boolean)
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

export async function notifyRobaDepartmentLeadsNewRequest(params: {
  requestId: string
  reference: string
  requestingDepartment: string
  requestedByWorkerName: string
  lineCount: number
  lines: Array<{ productId: string; quantity: number }>
  createdByUserName?: string | null
  excludeUserIds?: string[]
}): Promise<void> {
  const uids = await listDepartmentLeadUserIds({
    requestingDepartment: params.requestingDepartment,
    excludeUserIds: params.excludeUserIds,
  })
  if (!uids.length) return

  const worker = String(params.requestedByWorkerName || '').trim() || 'Sense nom'
  const dept = String(params.requestingDepartment || '').trim()
  const refCode = String(params.reference || '').trim()
  const linesSummary = await linesSummaryForRobaRequest(params.lines)
  const tram = String(params.createdByUserName || '').trim()
  const title = 'Nova sol·licitud del departament'
  const body = [refCode, worker, dept, linesSummary || `${params.lineCount} línia(es)`]
    .filter(Boolean)
    .join(' · ')

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
    console.error('[robaRequestNotifications] Ably publish dept request error', err)
  }
}

export async function notifyRecursosHumansRobaRequestSentToRrhh(params: {
  requestId: string
  reference: string
  requestingDepartment: string
  requestedByWorkerName: string
  lineCount: number
  lines: Array<{ productId: string; quantity: number }>
  createdByUserName?: string | null
  senderUserId: string
  extraEmail?: string | null
}): Promise<{ emailSent: boolean; emailSkippedReason?: string | null }> {
  const recipients = await listRrhhRecipients()
  const uids = recipients.map((r) => r.userId).filter(Boolean)
  if (!uids.length) {
    return { emailSent: false, emailSkippedReason: 'no_rrhh_recipients' }
  }

  const worker = String(params.requestedByWorkerName || '').trim() || 'Sense nom'
  const dept = String(params.requestingDepartment || '').trim()
  const refCode = String(params.reference || '').trim()
  const linesSummary = await linesSummaryForRobaRequest(params.lines)
  const tram = String(params.createdByUserName || '').trim()
  const title = 'Sol·licitud de roba enviada a RRHH'
  const bodyParts = [
    `Treballador: ${worker}`,
    dept ? `Departament: ${dept}` : null,
    refCode ? `Referència: ${refCode}` : null,
    tram ? `Enviada per: ${tram}` : null,
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
      type: 'roba_personal_sent_to_rrhh',
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
  if (apiKey) {
    try {
      const Ably = (await import('ably')).default
      const rest = new Ably.Rest({ key: apiKey })
      await Promise.all(
        uids.map((uid) =>
          rest.channels.get(`user:${uid}:notifications`).publish('created', {
            type: 'roba_personal_sent_to_rrhh',
            requestId: params.requestId,
            createdAt: now,
          })
        )
      )
    } catch (err) {
      console.error('[robaRequestNotifications] Ably publish sent_to_rrhh error', err)
    }
  }

  const senderSnap = await db.collection('users').doc(params.senderUserId).get()
  const organizerEmail = String(
    senderSnap.exists ? (senderSnap.data() as { email?: string }).email || '' : ''
  ).trim()
  if (!organizerEmail.includes('@')) {
    return { emailSent: false, emailSkippedReason: 'missing_sender_email' }
  }

  const toRecipients = uniqueEmailList(params.extraEmail).map((email) => ({ email, name: email }))
  if (!toRecipients.length) {
    return { emailSent: false, emailSkippedReason: 'missing_recipient_emails' }
  }

  const subject = `Roba personal - enviada a RRHH - ${refCode || params.requestId}`
  const bodyText = [
    'S ha enviat una sol·licitud de roba a RRHH.',
    '',
    ...bodyParts,
  ].join('\n')
  const attachment = await buildRobaRequestMailAttachment({
    reference: refCode || params.requestId,
    requestingDepartment: dept,
    requestedByWorkerName: worker,
    lines: params.lines,
  })

  await sendOutlookTextMail({
    organizerEmail,
    toRecipients,
    subject,
    bodyText,
    attachments: [attachment],
  })

  return { emailSent: true, emailSkippedReason: null }
}

export async function notifyRecursosHumansRobaRequestBatchSentToRrhh(params: {
  batchReference: string
  requestIds: string[]
  requests: Array<{
    reference: string
    requestingDepartment: string
    requestedByWorkerName: string
    createdByUserName?: string | null
    lines: Array<{ productId: string; quantity: number }>
  }>
  senderUserId: string
  extraEmail?: string | null
}): Promise<{ emailSent: boolean; emailSkippedReason?: string | null }> {
  const recipients = await listRrhhRecipients()
  const uids = recipients.map((r) => r.userId).filter(Boolean)
  if (!uids.length) {
    return { emailSent: false, emailSkippedReason: 'no_rrhh_recipients' }
  }

  const requestCount = params.requests.length
  const mergedLines = mergeLinesByProduct(params.requests.flatMap((request) => request.lines))
  const linesSummary = await linesSummaryForRobaRequest(mergedLines)
  const references = params.requests
    .map((request) => String(request.reference || '').trim())
    .filter(Boolean)
    .slice(0, 6)
  const departments = [...new Set(params.requests.map((request) => String(request.requestingDepartment || '').trim()).filter(Boolean))]
  const workers = params.requests
    .map((request) => String(request.requestedByWorkerName || '').trim())
    .filter(Boolean)
    .slice(0, 6)

  const title = 'Remesa agrupada de roba enviada a RRHH'
  const bodyParts = [
    `Remesa: ${params.batchReference}`,
    `${requestCount} sol·licitud(s) agrupades`,
    departments.length ? `Departaments: ${departments.join(', ')}` : null,
    references.length ? `Referències: ${references.join(', ')}${requestCount > references.length ? '…' : ''}` : null,
    workers.length ? `Treballadors: ${workers.join(', ')}${requestCount > workers.length ? '…' : ''}` : null,
    linesSummary ? `Material total: ${linesSummary}` : null,
  ].filter(Boolean)
  const body = bodyParts.join('\n')

  const now = Date.now()
  const batch = db.batch()
  for (const uid of uids) {
    const ref = db.collection('users').doc(uid).collection('notifications').doc()
    batch.set(ref, {
      type: 'roba_personal_sent_to_rrhh',
      title,
      body,
      requestId: params.requestIds[0] || null,
      requestIds: params.requestIds,
      reference: params.batchReference,
      requestingDepartment: departments.join(', '),
      requestedByWorkerName: requestCount === 1 ? workers[0] || null : null,
      linesSummary: linesSummary || null,
      lineCount: mergedLines.length,
      createdByUserName: null,
      createdAt: now,
      read: false,
    })
  }
  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const Ably = (await import('ably')).default
      const rest = new Ably.Rest({ key: apiKey })
      await Promise.all(
        uids.map((uid) =>
          rest.channels.get(`user:${uid}:notifications`).publish('created', {
            type: 'roba_personal_sent_to_rrhh',
            requestIds: params.requestIds,
            createdAt: now,
          })
        )
      )
    } catch (err) {
      console.error('[robaRequestNotifications] Ably publish batch sent_to_rrhh error', err)
    }
  }

  const senderSnap = await db.collection('users').doc(params.senderUserId).get()
  const organizerEmail = String(
    senderSnap.exists ? (senderSnap.data() as { email?: string }).email || '' : ''
  ).trim()
  if (!organizerEmail.includes('@')) {
    return { emailSent: false, emailSkippedReason: 'missing_sender_email' }
  }

  const toRecipients = uniqueEmailList(params.extraEmail).map((email) => ({ email, name: email }))
  if (!toRecipients.length) {
    return { emailSent: false, emailSkippedReason: 'missing_recipient_emails' }
  }

  const subject = `Roba personal - remesa agrupada RRHH - ${params.batchReference}`
  const bodyText = ['S ha enviat una remesa agrupada de roba a RRHH.', '', ...bodyParts].join('\n')
  const attachment = await buildRobaRequestBatchMailAttachment({
    batchReference: params.batchReference,
    requests: params.requests,
  })

  await sendOutlookTextMail({
    organizerEmail,
    toRecipients,
    subject,
    bodyText,
    attachments: [attachment],
  })

  return { emailSent: true, emailSkippedReason: null }
}

export async function notifyRecursosHumansRobaRequestCancelled(params: {
  requestId: string
  reference: string
  requestingDepartment: string
  requestedByWorkerName: string
  cancelledByUserName?: string | null
  senderUserId: string
  extraEmail?: string | null
}): Promise<{ emailSent: boolean; emailSkippedReason?: string | null }> {
  const recipients = await listRrhhRecipients()
  const uids = recipients.map((r) => r.userId).filter(Boolean)

  const worker = String(params.requestedByWorkerName || '').trim() || 'Sense nom'
  const dept = String(params.requestingDepartment || '').trim()
  const refCode = String(params.reference || '').trim()
  const cancelledBy = String(params.cancelledByUserName || '').trim()
  const title = 'Sol·licitud de roba cancel·lada'
  const body = [
    refCode ? `Referència: ${refCode}` : null,
    worker ? `Treballador: ${worker}` : null,
    dept ? `Departament: ${dept}` : null,
    cancelledBy ? `Cancel·lada per: ${cancelledBy}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  if (uids.length > 0) {
    const now = Date.now()
    const batch = db.batch()
    for (const uid of uids) {
      const ref = db.collection('users').doc(uid).collection('notifications').doc()
      batch.set(ref, {
        type: 'roba_personal_cancelled',
        title,
        body,
        requestId: params.requestId,
        reference: params.reference,
        requestingDepartment: params.requestingDepartment,
        requestedByWorkerName: worker,
        createdByUserName: cancelledBy || null,
        createdAt: now,
        read: false,
      })
    }
    await batch.commit()

    const apiKey = process.env.ABLY_API_KEY
    if (apiKey) {
      try {
        const Ably = (await import('ably')).default
        const rest = new Ably.Rest({ key: apiKey })
        await Promise.all(
          uids.map((uid) =>
            rest.channels.get(`user:${uid}:notifications`).publish('created', {
              type: 'roba_personal_cancelled',
              requestId: params.requestId,
              createdAt: now,
            })
          )
        )
      } catch (err) {
        console.error('[robaRequestNotifications] Ably publish cancelled error', err)
      }
    }
  }

  const senderSnap = await db.collection('users').doc(params.senderUserId).get()
  const organizerEmail = String(
    senderSnap.exists ? (senderSnap.data() as { email?: string }).email || '' : ''
  ).trim()
  if (!organizerEmail.includes('@')) {
    return { emailSent: false, emailSkippedReason: 'missing_sender_email' }
  }

  const toRecipients = uniqueEmailList(params.extraEmail).map((email) => ({ email, name: email }))
  if (!toRecipients.length) {
    return { emailSent: false, emailSkippedReason: 'missing_recipient_emails' }
  }

  await sendOutlookTextMail({
    organizerEmail,
    toRecipients,
    subject: `Roba personal - cancel·lada - ${refCode || params.requestId}`,
    bodyText: ['S ha cancel·lat una sol·licitud de roba enviada a RRHH.', '', body].join('\n'),
  })

  return { emailSent: true, emailSkippedReason: null }
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
  const uids = await listDepartmentLeadUserIds({
    requestingDepartment: params.requestingDepartment,
    excludeUserIds: params.excludeUserIds,
  })
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
  proposedLinesSummary?: string
}): Promise<void> {
  const uid = String(params.targetUserId || '').trim()
  if (!uid) return

  const extra = params.note?.trim() ? ` · ${params.note.trim().slice(0, 200)}` : ''
  const props = params.proposedLinesSummary?.trim()
    ? ` · quantitats proposades: ${params.proposedLinesSummary.trim().slice(0, 280)}`
    : ''
  const who = params.workerName?.trim() ? `${params.workerName.trim()} · ` : ''
  const title = 'Roba: incidència en una entrega'
  const body = `${who}${params.deliveryReference} · el treballador sol·licita revisió del lliurament.${props}${extra}`

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
