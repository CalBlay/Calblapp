export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import {
  buildRobaInventoryContext,
  purchaseDraftToText,
} from '@/lib/roba-personal/purchaseDraft'
import { listCompresCapRecipients } from '@/lib/roba-personal/purchaseRecipient'
import { sendOutlookTextMail } from '@/services/graph/calendar'

const LOG = DOTACIO_COLLECTIONS.purchaseEmailLog
const PROD = DOTACIO_COLLECTIONS.products

async function formatSolicitedPurchaseLines(
  lines: Array<{ productId: string; quantity: number }>
): Promise<string> {
  const header = '--- Articles sol·licitats ---\n'
  const ids = [...new Set(lines.map((l) => l.productId))]
  const snaps = await Promise.all(ids.map((id) => db.collection(PROD).doc(id).get()))
  const map = new Map(snaps.map((s) => [s.id, s]))

  const parts: string[] = [header]
  for (const line of lines) {
    const snap = map.get(line.productId)
    if (!snap?.exists) {
      parts.push(`ID ${line.productId} | quantitat ${line.quantity}\n`)
      continue
    }
    const p = snap.data() as {
      code?: string
      name?: string
      size?: string
      supplier?: string
    }
    const talla = (p.size ?? '').trim()
    parts.push(
      `${p.code} | ${p.name}${talla ? ` | talla ${talla}` : ''} | proveïdor ${p.supplier} | quantitat ${line.quantity}\n`
    )
  }
  return parts.join('').trimEnd()
}

function parseExtraEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export async function GET() {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const draft = await buildRobaInventoryContext()
  const text = purchaseDraftToText(draft)
  return NextResponse.json({ draft, text })
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as {
    lines?: Array<{ productId?: string; quantity?: number }>
    extraEmail?: string
    notes?: string
  }

  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => ({
      productId: String(l.productId || '').trim(),
      quantity: Number(l.quantity),
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)

  if (lines.length === 0) {
    return NextResponse.json(
      { error: 'Cal almenys una línia amb producte i quantitat.' },
      { status: 400 }
    )
  }

  const organizerSnap = await db.collection('users').doc(auth.userId).get()
  const organizerEmail = String(
    organizerSnap.exists ? (organizerSnap.data() as { email?: string }).email || '' : ''
  ).trim()

  if (!organizerEmail.includes('@')) {
    return NextResponse.json(
      {
        error:
          'El vostre usuari no té correu corporatiu al perfil. Cal un email (com al mòdul Projectes) per enviar des d’Outlook.',
      },
      { status: 400 }
    )
  }

  const caps = await listCompresCapRecipients()
  const seenTo = new Set<string>()
  const toRecipients: Array<{ email: string; name: string }> = []
  for (const c of caps) {
    const raw = String(c.email || '').trim()
    if (!raw.includes('@')) continue
    const key = raw.toLowerCase()
    if (seenTo.has(key)) continue
    seenTo.add(key)
    toRecipients.push({ email: raw, name: c.name })
  }

  const envFallback = String(process.env.ROBA_PERSONAL_PURCHASE_EMAIL_TO || '').trim()
  if (toRecipients.length === 0 && envFallback.includes('@')) {
    seenTo.add(envFallback.toLowerCase())
    toRecipients.push({ email: envFallback, name: 'Compres' })
  }

  if (toRecipients.length === 0) {
    return NextResponse.json(
      {
        error:
          'No hi ha cap destinatari: assigneu correu als caps de departament Compres (Usuaris) o definiu ROBA_PERSONAL_PURCHASE_EMAIL_TO.',
      },
      { status: 400 }
    )
  }

  const draft = await buildRobaInventoryContext()
  const solicitedBlock = await formatSolicitedPurchaseLines(lines)
  const draftBlock = purchaseDraftToText(draft)
  let bodyText = [solicitedBlock, draftBlock].filter(Boolean).join('\n\n')
  const notes = String(body.notes || '').trim()
  if (notes) {
    bodyText += `\n\n--- Anotacions ---\n${notes}`
  }

  const extraCc: Array<{ email: string; name: string }> = []
  const seenCc = new Set(seenTo)
  for (const addr of parseExtraEmails(String(body.extraEmail || ''))) {
    const key = addr.toLowerCase()
    if (seenCc.has(key)) continue
    seenCc.add(key)
    extraCc.push({ email: addr, name: addr })
  }

  const subject = `Roba personal — sol·licitud de compra — ${new Date().toLocaleDateString('ca-ES', {
    timeZone: 'Europe/Madrid',
  })}`

  let emailSent = false
  let emailError: string | undefined

  try {
    await sendOutlookTextMail({
      organizerEmail,
      toRecipients,
      ccRecipients: extraCc.length ? extraCc : undefined,
      subject,
      bodyText,
    })
    emailSent = true
  } catch (e: unknown) {
    emailError = e instanceof Error ? e.message : String(e)
  }

  const to = toRecipients.map((r) => r.email).join(', ')
  const ccLog = extraCc.map((r) => r.email).join(', ')

  await db.collection(LOG).add({
    to,
    cc: ccLog || null,
    subject,
    bodySummary: bodyText.slice(0, 4000),
    payloadSnapshot: { draft, lines, extraCc, notes: notes || null },
    sentAt: FieldValue.serverTimestamp(),
    createdByUserId: auth.userId,
    organizerEmail,
    emailSent,
    emailError: emailError || null,
  })

  if (!emailSent) {
    return NextResponse.json(
      {
        ok: false,
        emailSent: false,
        emailError,
        message: emailError || 'No s’ha pogut enviar el correu.',
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    emailSent: true,
    message: 'Correu enviat des del vostre Outlook (Microsoft 365).',
  })
}
