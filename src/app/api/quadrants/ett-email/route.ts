import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { resolveQuadrantCollection } from '@/lib/firestoreCollections'
import { requireAuth } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import { PERM } from '@/lib/permissionKeys'
import { findSenderEmail } from '@/lib/calendar/calendarEmail'
import { sendOutlookTextMail } from '@/services/graph/calendar'
import {
  buildEttScheduleEmailText,
  collectEttEmailSchedules,
  getQuadrantEmailResponsible,
} from '@/lib/quadrantEttEmail'

export const runtime = 'nodejs'

const normalizeEventId = (value: unknown) => String(value || '').trim().split('__')[0].trim()
const normalizeDepartment = (value: unknown) =>
  String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const normalizeName = (value: unknown) =>
  String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const readPhone = (value: FirebaseFirestore.DocumentData | undefined) =>
  String(value?.phone || value?.telefon || value?.mobile || '').trim()

async function attachResponsiblePhones(docs: Array<Record<string, unknown>>) {
  const refs = docs.map(getQuadrantEmailResponsible)
  const ids = Array.from(new Set(refs.map((ref) => ref.id).filter(Boolean)))
  const names = Array.from(new Set(refs.map((ref) => ref.name).filter(Boolean)))
  const phoneById = new Map<string, string>()
  const phoneByName = new Map<string, string>()

  await Promise.all(
    ids.map(async (id) => {
      const [personnel, user] = await Promise.all([
        firestoreAdmin.collection('personnel').doc(id).get(),
        firestoreAdmin.collection('users').doc(id).get(),
      ])
      const phone = readPhone(personnel.data()) || readPhone(user.data())
      if (phone) phoneById.set(id, phone)
    })
  )

  await Promise.all(
    names.map(async (name) => {
      const [personnel, user] = await Promise.all([
        firestoreAdmin.collection('personnel').where('name', '==', name).limit(1).get(),
        firestoreAdmin.collection('users').where('name', '==', name).limit(1).get(),
      ])
      const phone =
        readPhone(personnel.docs[0]?.data()) || readPhone(user.docs[0]?.data())
      if (phone) phoneByName.set(normalizeName(name), phone)
    })
  )

  return docs.map((doc, index) => {
    const ref = refs[index]
    const phone =
      ref.phone || phoneById.get(ref.id) || phoneByName.get(normalizeName(ref.name)) || ''
    return phone ? { ...doc, responsablePhone: phone } : doc
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  try {
    const user = accessUserFromAuth(auth.user as Parameters<typeof accessUserFromAuth>[0])
    const [canView, canConfirm] = await Promise.all([
      canViewUiPath({ user, path: '/menu/quadrants' }),
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/quadrants', 'confirm'),
      }),
    ])
    if (!canView || canConfirm !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const eventId = normalizeEventId(body.eventId)
    const draftId = String(body.draftId || '').trim()
    const department = normalizeDepartment(body.department)
    if (!eventId || !['serveis', 'logistica', 'cuina'].includes(department)) {
      return NextResponse.json({ error: 'Quadrant o departament no vàlid' }, { status: 400 })
    }

    const collectionName = await resolveQuadrantCollection(department, { prefer: 'singular' })
    const collection = firestoreAdmin.collection(collectionName)
    const querySnap = await collection.where('eventId', '==', eventId).get()
    const docs = querySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    if (draftId && !docs.some((doc) => doc.id === draftId)) {
      const draft = await collection.doc(draftId).get()
      if (draft.exists) docs.push({ id: draft.id, ...draft.data() })
    }
    if (docs.length === 0) {
      const direct = await collection.doc(eventId).get()
      if (direct.exists) docs.push({ id: direct.id, ...direct.data() })
    }

    const emailDocs = await attachResponsiblePhones(docs)
    const schedules = collectEttEmailSchedules(emailDocs, eventId, department)
    if (schedules.length === 0) {
      console.warn('[quadrants/ett-email POST] no schedules', {
        eventId,
        draftId,
        department,
        collectionName,
        documentsFound: docs.length,
      })
      return NextResponse.json(
        { error: 'No hi ha cap grup ETT confirmat amb una empresa i un correu assignats' },
        { status: 400 }
      )
    }

    const senderEmail = await findSenderEmail(auth.user)
    if (!senderEmail.includes('@')) {
      console.warn('[quadrants/ett-email POST] missing sender email', {
        userId: auth.user.id,
        eventId,
        department,
      })
      return NextResponse.json({ error: 'El teu usuari no té un correu d’enviament vàlid' }, { status: 400 })
    }

    const byRecipient = new Map<string, typeof schedules>()
    schedules.forEach((schedule) => {
      byRecipient.set(schedule.email, [...(byRecipient.get(schedule.email) || []), schedule])
    })

    const sentAt = new Date().toISOString()
    const deliveries = await Promise.all(Array.from(byRecipient.entries()).map(async ([email, recipientSchedules]) => {
      const first = recipientSchedules[0]
      const eventLabel = [first.eventCode, first.eventName].filter(Boolean).join(' · ')
      await sendOutlookTextMail({
        organizerEmail: senderEmail,
        toRecipients: [{ email, name: first.responsibleName || first.providerName }],
        subject: `Horaris ETT${eventLabel ? ` · ${eventLabel}` : ''}`,
        bodyText: buildEttScheduleEmailText(recipientSchedules),
      })
      await firestoreAdmin.collection('quadrant_ett_email_deliveries').add({
        eventId,
        department,
        providerId: first.providerId,
        providerName: first.providerName,
        recipientEmail: email,
        recipientName: first.responsibleName,
        schedules: recipientSchedules,
        sentAt,
        sentById: auth.user.id,
        sentByName: String(auth.user.name || auth.user.email || ''),
        sentByEmail: senderEmail,
      })
      return { email, providerName: first.providerName, schedules: recipientSchedules.length }
    }))

    return NextResponse.json({ ok: true, deliveries, sentAt })
  } catch (error) {
    console.error('[quadrants/ett-email POST]', error)
    return NextResponse.json({ error: 'No s’han pogut enviar els horaris a l’ETT' }, { status: 500 })
  }
}
