// file: src/app/menu/events/[id]/page.tsx
import React from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/server/authOptions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import EventMenuModal from '@/components/events/EventMenuModal'

interface Params {
  params: { id: string }
}

export default async function EventDetailPage({ params }: Params) {
  const session = await getServerSession(authOptions)
  const user = session?.user
  const eventId = params.id

  const eventSnap = await db.collection('stage_verd').doc(eventId).get()
  if (!eventSnap.exists) {
    return (
      <div className="p-6">
        <Link href="/menu/events" className="text-blue-600">
          &larr; Tornar
        </Link>
        <p className="mt-4 text-red-600">Esdeveniment no trobat.</p>
      </div>
    )
  }

  const eventData = (eventSnap.data() || {}) as {
    NomEvent?: string
    DataInici?: string
    HoraInici?: string
    horaInici?: string
    Hora?: string
    hora?: string
  }
  const summary = String(eventData.NomEvent || '(Sense titol)').split('/')[0].trim()
  const rawDate = String(eventData.DataInici || '').trim()
  const rawTime =
    typeof eventData.HoraInici === 'string'
      ? eventData.HoraInici
      : typeof eventData.horaInici === 'string'
      ? eventData.horaInici
      : typeof eventData.Hora === 'string'
      ? eventData.Hora
      : typeof eventData.hora === 'string'
      ? eventData.hora
      : ''
  const trimmedTime = rawTime.trim().slice(0, 5)
  const eventStart = rawDate ? `${rawDate}T${trimmedTime || '12:00'}:00` : ''

  if (user?.department) {
    const deptNorm =
      user.department.charAt(0).toUpperCase() +
      user.department.slice(1).toLowerCase()
    const colName = `quadrants${deptNorm}`

    const snap = await db.collection(colName).doc(eventId).get()
    if (snap.exists) {
      const data = snap.data() || {}
      const respName = String(data?.responsable?.name || '').toLowerCase().trim()
      const userName = String(user.name || '').toLowerCase().trim()
      void (respName && userName && respName === userName)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{summary}</h1>
      <EventMenuModal
        event={{ id: eventId, summary, start: eventStart }}
        user={{
          id: user?.id,
          role: user?.role,
          department: user?.department ?? undefined,
          name: user?.name ?? undefined,
        }}
        onClose={() => {}}
      />
    </div>
  )
}
