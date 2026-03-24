// file: src/app/menu/events/[id]/page.tsx
import React from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

import { fetchGoogleEventById, GoogleEvent } from '@/services/googleCalendar'
import EventMenuModal from '@/components/events/EventMenuModal'

interface Params {
  params: { id: string }
}

export default async function EventDetailPage({ params }: Params) {
  const session = await getServerSession(authOptions)
  const user = session?.user
  const eventId = params.id

  const ev: GoogleEvent | null = await fetchGoogleEventById(eventId)
  if (!ev) {
    return (
      <div className="p-6">
        <Link href="/menu/events" className="text-blue-600">
          &larr; Tornar
        </Link>
        <p className="mt-4 text-red-600">Esdeveniment no trobat.</p>
      </div>
    )
  }

  // 🔎 Comprovació server-side de responsable
  let isResponsible = false
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
      if (respName && userName && respName === userName) {
        isResponsible = true
      }
    }
  }

  // Rol global
  const role = (user?.role || '').toLowerCase()
  const isPrivileged =
    role === 'admin' ||
    role === 'direccio' ||
    (role.includes('cap') && role.includes('depart')) ||
    isResponsible

  return (
    <div className="p-6">
      {/* Info bàsica */}
      <h1 className="text-2xl font-bold">{ev.summary}</h1>

      {/* Passem props a EventMenuModal */}
      <EventMenuModal
        event={{ id: eventId, summary: ev.summary || '', start: ev.start.dateTime ?? ev.start.date ?? '' }}
        user={{ id: user?.id, role: user?.role, department: user?.department ?? undefined, name: user?.name ?? undefined }}
        onClose={() => {}}
      />
    </div>
  )
}
