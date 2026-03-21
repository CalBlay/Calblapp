import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import admin from 'firebase-admin'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { sendMaintenanceSupplierEmail } from '@/services/graph/calendar'

export const runtime = 'nodejs'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
  email?: string | null
}

type ExternalizePayload = {
  supplierName?: string
  supplierEmail?: string
  subject?: string
  message?: string
  externalReference?: string | null
  attachments?: Array<{
    name?: string
    path?: string
    contentType?: string | null
  }>
}

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const normalizeStatus = (value?: string) => {
  const v = (value || '').trim().toLowerCase()
  if (v === 'assignat') return 'assignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut' || v === 'validat') return 'validat'
  return 'nou'
}

async function findUserEmail(userId: string) {
  const directSnap = await db.collection('users').doc(userId).get()
  if (directSnap.exists) {
    const directData = directSnap.data() as { email?: string | null } | undefined
    const email = String(directData?.email || '').trim()
    if (email) return email
  }

  const byUserIdSnap = await db
    .collection('users')
    .where('userId', '==', userId)
    .limit(1)
    .get()
  if (!byUserIdSnap.empty) {
    const data = byUserIdSnap.docs[0].data() as { email?: string | null }
    const email = String(data.email || '').trim()
    if (email) return email
  }

  return ''
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department)
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json()) as ExternalizePayload
  const supplierName = String(body.supplierName || '').trim()
  const supplierEmail = String(body.supplierEmail || '').trim()
  const subject = String(body.subject || '').trim()
  const message = String(body.message || '').trim()
  const externalReference = String(body.externalReference || '').trim()
  const extraAttachments = Array.isArray(body.attachments)
    ? body.attachments
        .map((item) => ({
          name: String(item?.name || '').trim(),
          path: String(item?.path || '').trim(),
          contentType: String(item?.contentType || 'application/octet-stream').trim() || 'application/octet-stream',
        }))
        .filter((item) => item.name && item.path)
    : []

  if (!supplierName || !supplierEmail || !subject || !message) {
    return NextResponse.json({ error: 'Falten dades del proveidor o del correu' }, { status: 400 })
  }

  if (!supplierEmail.includes('@')) {
    return NextResponse.json({ error: 'Email del proveidor invalid' }, { status: 400 })
  }

  try {
    const ref = db.collection('maintenanceTickets').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const current = snap.data() as Record<string, any>
    const ticketType = String(current.ticketType || 'maquinaria').trim().toLowerCase()
    const capAllowed =
      role === 'cap' &&
      ((ticketType === 'deco' &&
        ['decoracio', 'decoracions', 'decoracion'].includes(dept)) ||
        (ticketType !== 'deco' && dept === 'manteniment'))
    if (role === 'cap' && !capAllowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const currentStatus = normalizeStatus(String(current.status || ''))
    if (currentStatus === 'validat') {
      return NextResponse.json(
        { error: 'Cal reobrir el ticket abans d enviar-lo a proveidor' },
        { status: 400 }
      )
    }

    const senderEmail = String(user.email || '').trim() || (await findUserEmail(user.id))
    if (!senderEmail) {
      return NextResponse.json(
        { error: 'L usuari que envia el correu no te email corporatiu configurat' },
        { status: 400 }
      )
    }

    await sendMaintenanceSupplierEmail({
      senderEmail,
      recipient: {
        email: supplierEmail,
        name: supplierName,
      },
      subject,
      ticketCode: String(current.ticketCode || current.incidentNumber || 'TIC').trim(),
      location: String(current.location || '').trim(),
      machine: String(current.machine || '').trim(),
      description: String(current.description || '').trim(),
      priority: String(current.priority || '').trim(),
      createdAt: current.createdAt || null,
      reference: externalReference || null,
      message,
      attachments: [
        ...(current.imagePath && typeof current.imagePath === 'string'
          ? [
              {
                name:
                  String(current.ticketCode || current.incidentNumber || 'ticket').trim() +
                  (String(current.imageMeta?.type || '').includes('png')
                    ? '.png'
                    : String(current.imageMeta?.type || '').includes('webp')
                      ? '.webp'
                      : '.jpg'),
                path: String(current.imagePath).trim(),
                contentType: String(current.imageMeta?.type || 'image/jpeg').trim() || 'image/jpeg',
              },
            ]
          : []),
        ...extraAttachments,
      ],
    })

    const now = Date.now()
    const nextExternalStatus = Array.isArray(current.externalizationHistory) && current.externalizationHistory.length > 0
      ? 'resent'
      : 'sent'
    const updates: Record<string, unknown> = {
      updatedAt: now,
      updatedById: user.id,
      updatedByName: user.name || '',
      externalized: true,
      supplierName,
      supplierEmail,
      externalReference: externalReference || null,
      externalStatus: nextExternalStatus,
      externalSentAt: now,
      externalSentById: user.id,
      externalSentByName: user.name || '',
      externalizationHistory: admin.firestore.FieldValue.arrayUnion({
        at: now,
        byId: user.id,
        byName: user.name || '',
        supplierName,
        supplierEmail,
        reference: externalReference || null,
        subject,
        message,
        attachmentNames: extraAttachments.map((item) => item.name),
        status: nextExternalStatus,
      }),
    }

    if (currentStatus !== 'espera') {
      updates.status = 'espera'
      updates.statusHistory = admin.firestore.FieldValue.arrayUnion({
        status: 'espera',
        at: now,
        byId: user.id,
        byName: user.name || '',
        note: `Enviat a proveidor ${supplierName}`,
      })
    }

    await ref.set(updates, { merge: true })

    const updatedSnap = await ref.get()
    const updated = updatedSnap.data() as Record<string, any>

    return NextResponse.json({
      success: true,
      ticket: {
        id: updatedSnap.id,
        ...updated,
        status: normalizeStatus(String(updated.status || '')),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
