// src/app/api/personnel/[id]/request-user/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import Ably from 'ably'

import { normalizeRole } from '@/lib/roles'
import { internalApiHeaders } from '@/lib/server/internalApiAuth'

interface SessionUser {
  id?: string
  userId?: string
  name?: string
  role?: string
  deptLower?: string
  department?: string
  [key: string]: unknown
}

interface PersonnelDoc {
  name?: string
  role?: string
  department?: string
  departmentLower?: string
  workerRank?: string | null
  email?: string | null
  phone?: string | null
  maxHoursWeek?: number | null
  driver?: {
    isDriver: boolean
    camioGran: boolean
    camioPetit: boolean
  }
  available?: boolean
  [key: string]: unknown
}


interface UserRequestDoc {
  personId: string
  departmentLower: string
  department?: string | null
  requestedByUserId: string | null
  requestedByName: string | null
  email?: string | null
  phone?: string | null
  maxHoursWeek?: number | null
  createdAt: number
  updatedAt: number
  status: 'pending' | 'approved' | 'rejected'
  name: string
  role: string
  workerRank?: string | null
  driver: PersonnelDoc['driver']
  available: boolean
}

const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normLower = (s?: string) =>
  unaccent((s || '').toString().trim()).toLowerCase()

const requiredFields = ['name', 'role', 'department', 'email', 'phone'] as const

function findMissingFields(person: PersonnelDoc) {
  const missing: string[] = []
  const isEmpty = (v?: unknown) => {
    if (v === undefined || v === null) return true
    if (typeof v === 'string' && v.trim() === '') return true
    return false
  }

  requiredFields.forEach(field => {
    if (isEmpty((person as Record<string, unknown>)[field])) missing.push(field)
  })

  const dept = normLower(person.department || person.departmentLower)
  const deptRaw = normLower(
    `${person.department || ''} ${person.departmentLower || ''}`
  )
  const isServeis = dept.includes('servei') || deptRaw.includes('servei')
  if (person.driver?.isDriver && !isServeis) {
    const hasType = person.driver.camioGran || person.driver.camioPetit
    if (!hasType) missing.push('driverType')
  }

  return missing
}

async function notifyAdmins(params: {
  title: string
  body: string
  personId: string
  requesterName: string
  department: string
  baseUrl: string
}) {
  const { title, body, personId, requesterName, department, baseUrl } = params

  const snap = await firestoreAdmin.collection('users').get()
  const admins = snap.docs.filter(d => {
    const data = d.data() as { role?: string }
    return normalizeRole(String(data.role || '')) === 'admin'
  })

  if (!admins.length) return

  const now = Date.now()
  const batch = firestoreAdmin.batch()

  admins.forEach((d) => {
    const notifRef = d.ref.collection('notifications').doc()
    batch.set(notifRef, {
      title,
      body,
      createdAt: now,
      read: false,
      type: 'user_request',
      personId,
      requesterName,
      department,
    })
  })

  await batch.commit()

  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) {
    console.warn('[request-user] Missing ABLY_API_KEY, skipping realtime')
    return
  }

  const rest = new Ably.Rest({ key: apiKey })
  const channel = rest.channels.get('admin:user-requests')
  await channel.publish('created', {
    personId,
    requesterName,
    department,
    createdAt: now,
  })

  // Push a admins (mòbil)
  try {
    for (const d of admins) {
      await fetch(`${baseUrl}/api/push/send`, {
        method: 'POST',
        headers: internalApiHeaders(),
        body: JSON.stringify({
          userId: d.id,
          title: 'Nova sol·licitud d’usuari',
          body: `${requesterName} ha enviat una sol·licitud.`,
          url: '/menu/users',
        }),
      })
    }
  } catch (err) {
    console.error('[request-user] push error:', err)
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { id } = await ctx.params
  const personId = id

  const su = session.user as SessionUser
  const requesterId = su.id || su.userId || ''
  const requesterName = su.name || '—'
  const requesterRole = normalizeRole(su.role)
  const requesterDeptLower = su.deptLower || normLower(su.department)

  const isPrivileged =
    requesterRole === 'admin' || requesterRole === 'direccio'
  const isCapDept = [
    'capdepartament',
    'cap_departament',
    'cap',
    'capdept',
    'head',
  ].includes(requesterRole)

  try {
    console.log('📩 Nova sol·licitud → personId:', personId)

    // Carreguem el personal
    const personSnap = await firestoreAdmin.collection('personnel').doc(personId).get()
    if (!personSnap.exists) {
      console.error('❌ No existeix el personal:', personId)
      return NextResponse.json(
        { success: false, error: 'No existeix el personal' },
        { status: 404 }
      )
    }
    const p = personSnap.data() as unknown as PersonnelDoc

    const personDeptLower = normLower(p.departmentLower || p.department)

    const missing = findMissingFields(p)
    if (missing.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Falten camps obligatoris per sol·licitar usuari: ${missing.join(', ')}`,
          missing,
        },
        { status: 400 }
      )
    }

    // Comprovació permisos
    if (!isPrivileged) {
      if (!isCapDept) {
        return NextResponse.json(
          { success: false, error: 'Permís denegat (rol)' },
          { status: 403 }
        )
      }
      if (personDeptLower !== requesterDeptLower) {
        return NextResponse.json(
          { success: false, error: 'Només pots demanar usuaris del teu departament' },
          { status: 403 }
        )
      }
    }

    // Si ja té usuari → sortim
    const userDoc = await firestoreAdmin.collection('users').doc(personId).get()
    if (userDoc.exists) {
      console.warn('⚠️ Aquest treballador ja té usuari:', personId)
      return NextResponse.json(
        { success: false, error: 'Aquest treballador ja té usuari' },
        { status: 409 }
      )
    }

    // Si ja hi ha sol·licitud pendent → idempotent
    const reqRef = firestoreAdmin.collection('userRequests').doc(personId)
    const reqSnap = await reqRef.get()
    const existing = reqSnap.data() as unknown as UserRequestDoc | undefined
    if (reqSnap.exists && existing?.status === 'pending') {
      console.log('ℹ️ Ja hi ha una sol·licitud pendent per:', personId)
      return NextResponse.json({
        success: true,
        alreadyPending: true,
        status: 'pending',
      })
    }

    // Crear/actualitzar sol·licitud
    const now = Date.now()
    const payload: UserRequestDoc = {
      personId,
      departmentLower: personDeptLower,
      department: p.department || null,
      requestedByUserId: requesterId || null,
      requestedByName: requesterName || null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      maxHoursWeek: p.maxHoursWeek ?? null,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      name: p.name || '',
      role: p.role || 'equip',
      workerRank: p.workerRank || null,
      driver: p.driver || {
        isDriver: false,
        camioGran: false,
        camioPetit: false,
      },
      available: p.available ?? true,
    }

    console.log('📝 Guardant sol·licitud userRequests:', payload)
    await reqRef.set(payload, { merge: true })

    await notifyAdmins({
      title: 'Nova sol·licitud d’usuari',
      body: `${requesterName} demana crear usuari per a ${p.name || personId} (${p.department || ''}).`,
      personId,
      requesterName,
      department: p.department || '',
      baseUrl: req.nextUrl.origin,
    })

    console.log('✅ Sol·licitud guardada correctament per:', personId)
    return NextResponse.json({ success: true, status: 'pending' })
  } catch (e: unknown) {
    console.error('[request-user] error:', e)
    if (e instanceof Error) {
      return NextResponse.json(
        { success: false, error: e.message },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Error intern' },
      { status: 500 }
    )
  }
}
