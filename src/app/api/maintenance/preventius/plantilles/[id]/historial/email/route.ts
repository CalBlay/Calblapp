import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { sendMaintenanceHistoryEmail } from '@/services/graph/calendar'

export const runtime = 'nodejs'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
  email?: string | null
}

type HistoryEmailPayload = {
  recipientEmail?: string
  recipientName?: string
  subject?: string
  message?: string
  templateName?: string
  periodicity?: string | null
  location?: string | null
  recordsCount?: number
  validatedCount?: number
  attachment?: {
    name?: string
    path?: string
    contentType?: string | null
  }
}

async function findUserEmail(userId: string) {
  const directSnap = await db.collection('users').doc(userId).get()
  if (directSnap.exists) {
    const directData = directSnap.data() as { email?: string | null } | undefined
    const email = String(directData?.email || '').trim()
    if (email) return email
  }

  const byUserIdSnap = await db.collection('users').where('userId', '==', userId).limit(1).get()
  if (!byUserIdSnap.empty) {
    const data = byUserIdSnap.docs[0].data() as { email?: string | null }
    const email = String(data.email || '').trim()
    if (email) return email
  }

  return ''
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (!['admin', 'direccio', 'cap'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as HistoryEmailPayload
  const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase()
  const recipientName = String(body.recipientName || recipientEmail).trim() || recipientEmail
  const subject = String(body.subject || '').trim()
  const message = String(body.message || '').trim()
  const templateName = String(body.templateName || 'Historial de manteniment').trim()
  const attachmentName = String(body.attachment?.name || '').trim()
  const attachmentPath = String(body.attachment?.path || '').trim()
  const attachmentType =
    String(body.attachment?.contentType || 'application/pdf').trim() || 'application/pdf'

  if (!recipientEmail || !recipientEmail.includes('@') || !subject || !attachmentName || !attachmentPath) {
    return NextResponse.json({ error: 'Falten dades per enviar el correu' }, { status: 400 })
  }

  const senderEmail = String(user.email || '').trim() || (await findUserEmail(user.id))
  if (!senderEmail) {
    return NextResponse.json(
      { error: 'L usuari que envia el correu no te email corporatiu configurat' },
      { status: 400 }
    )
  }

  try {
    await sendMaintenanceHistoryEmail({
      senderEmail,
      recipient: {
        email: recipientEmail,
        name: recipientName,
      },
      subject,
      templateName,
      periodicity: body.periodicity || null,
      location: body.location || null,
      recordsCount: Number(body.recordsCount || 0),
      validatedCount: Number(body.validatedCount || 0),
      message,
      attachments: [
        {
          name: attachmentName,
          path: attachmentPath,
          contentType: attachmentType,
        },
      ],
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
