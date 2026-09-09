import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import { accessUserFromSession } from '@/lib/calendar/calendarApiAuth'
import { findSenderEmail, resolveEmailByName } from '@/lib/calendar/calendarEmail'
import { isAllowedCalendarManualCollection } from '@/lib/calendar/calendarManualCollection'
import { sendOutlookTextMail } from '@/services/graph/calendar'

export const runtime = 'nodejs'

type RecipientInput = { name?: string; email?: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const allowed = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.sendCancellation,
    })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = (await req.json()) as {
      collection?: string
      subject?: string
      message?: string
      recipients?: RecipientInput[]
    }
    const collection = String(body.collection || '').trim()
    const subject = String(body.subject || '').trim()
    if (!id || !isAllowedCalendarManualCollection(collection) || !subject) {
      return NextResponse.json({ error: 'Falten dades obligatòries' }, { status: 400 })
    }

    const docRef = db.collection(collection).doc(id)
    const snap = await docRef.get()
    if (!snap.exists) return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
    if (snap.get('cancelled') !== true) {
      return NextResponse.json({ error: 'L\'esdeveniment no està cancel·lat' }, { status: 409 })
    }

    const recipients: Array<{ email: string; name: string }> = []
    const seen = new Set<string>()
    for (const item of Array.isArray(body.recipients) ? body.recipients : []) {
      const name = String(item.name || '').trim()
      const directEmail = String(item.email || '').trim()
      const email = directEmail.includes('@') ? directEmail : await resolveEmailByName(name)
      const key = email.toLowerCase()
      if (!email.includes('@') || seen.has(key)) continue
      seen.add(key)
      recipients.push({ email, name: name || email })
    }
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No hi ha destinataris vàlids seleccionats' }, { status: 400 })
    }

    const senderEmail = await findSenderEmail(auth.user)
    if (!senderEmail.includes('@')) {
      return NextResponse.json(
        { error: 'El vostre usuari no té correu corporatiu per enviar des d\'Outlook.' },
        { status: 400 }
      )
    }

    await sendOutlookTextMail({
      organizerEmail: senderEmail,
      toRecipients: recipients,
      subject,
      bodyText: String(body.message || '').trim() || 'Aquest esdeveniment ha estat cancel·lat.',
    })

    const now = new Date().toISOString()
    await docRef.set(
      {
        cancellationNoticeSentAt: now,
        cancellationNoticeSentByUserId: auth.user.id,
        cancellationNoticeRecipientCount: recipients.length,
        updatedAt: now,
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, recipients: recipients.length })
  } catch (error) {
    console.error('[calendar/manual/[id]/cancellation-email POST]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut enviar l\'avís' },
      { status: 500 }
    )
  }
}
