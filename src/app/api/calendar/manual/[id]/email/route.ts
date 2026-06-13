import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import { accessUserFromSession } from '@/lib/calendar/calendarApiAuth'
import {
  downloadSharePointFile,
  fileNameFromUrl,
  findSenderEmail,
  parseSharePointItemId,
  resolveEmailByName,
} from '@/lib/calendar/calendarEmail'
import { sendOutlookTextMail } from '@/services/graph/calendar'

export const runtime = 'nodejs'

type RecipientInput = {
  name?: string
  email?: string
}

type FileInput = {
  key?: string
  url?: string
  name?: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const ok = await isUiPermissionGranted({
      user: accessUserFromSession(auth.user),
      permission: CALENDAR_PERM.sendDocuments,
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = (await req.json()) as {
      collection?: string
      subject?: string
      message?: string
      recipients?: RecipientInput[]
      files?: FileInput[]
    }

    const collection = String(body.collection || 'stage_verd').trim()
    const subject = String(body.subject || '').trim()
    const message = String(body.message || '').trim()
    const recipientsInput = Array.isArray(body.recipients) ? body.recipients : []
    const filesInput = Array.isArray(body.files) ? body.files : []

    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'Falta assumpte' }, { status: 400 })
    if (filesInput.length === 0) {
      return NextResponse.json({ error: 'Cal seleccionar almenys un document' }, { status: 400 })
    }

    const toRecipients: Array<{ email: string; name: string }> = []
    const seen = new Set<string>()

    for (const recipient of recipientsInput) {
      const directEmail = String(recipient.email || '').trim()
      const name = String(recipient.name || '').trim()
      const email =
        directEmail.includes('@') ? directEmail : await resolveEmailByName(name)
      if (!email.includes('@')) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      toRecipients.push({ email, name: name || email })
    }

    if (toRecipients.length === 0) {
      return NextResponse.json(
        { error: 'No hi ha destinataris amb correu vàlid seleccionats' },
        { status: 400 }
      )
    }

    const senderEmail = await findSenderEmail(auth.user)
    if (!senderEmail.includes('@')) {
      return NextResponse.json(
        {
          error:
            'El vostre usuari no té correu corporatiu al perfil. Cal un email per enviar des d’Outlook.',
        },
        { status: 400 }
      )
    }

    const docSnap = await db.collection(collection).doc(id).get()
    const docData = docSnap.exists ? (docSnap.data() as Record<string, unknown>) : {}

    const attachments: Array<{
      name: string
      contentType?: string | null
      contentBytesBase64: string
    }> = []

    for (const file of filesInput) {
      const key = String(file.key || '').trim()
      const url = String(file.url || docData[key] || '').trim()
      if (!url) continue

      const itemId = parseSharePointItemId(url)
      if (!itemId) {
        return NextResponse.json(
          { error: `El document ${key || url} no és un fitxer de SharePoint vàlid` },
          { status: 400 }
        )
      }

      const fallbackName = String(file.name || fileNameFromUrl(url, key || 'document')).trim()
      const downloaded = await downloadSharePointFile(itemId)
      attachments.push({
        name: downloaded.name || fallbackName,
        contentType: downloaded.contentType,
        contentBytesBase64: downloaded.contentBytesBase64,
      })
    }

    if (attachments.length === 0) {
      return NextResponse.json({ error: 'No s’han pogut preparar els adjunts' }, { status: 400 })
    }

    await sendOutlookTextMail({
      organizerEmail: senderEmail,
      toRecipients,
      subject,
      bodyText: message || 'Documents adjunts de l’esdeveniment.',
      attachments,
    })

    return NextResponse.json({
      ok: true,
      recipients: toRecipients.length,
      attachments: attachments.length,
    })
  } catch (err) {
    console.error('[calendar/manual/[id]/email POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error intern' },
      { status: 500 }
    )
  }
}
