// file: src/app/api/users/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normLower = (s?: string) =>
  unaccent((s || '').toString().trim()).toLowerCase()

const isTreballador = (role?: string) => normLower(role) === 'treballador'
const isCapDepartament = (role?: string) => normalizeRole(role) === 'cap'
const requiresCorporateEmail = (role?: string) =>
  ['admin', 'direccio', 'cap'].includes(normalizeRole(role))

// ──────────────────────────────────────────────────────────────
// Tipus
// ──────────────────────────────────────────────────────────────
interface UserPayload {
  name: string
  nameFold: string
  password: string
  role: string
  department: string
  departmentLower: string
  email: string | null
  phone: string | null
  opsEventsConfigurable?: boolean
  opsEventsEnabled?: boolean
  opsProjectsConfigurable?: boolean
  opsChannelsConfigurable?: string[]
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  createdAt: number
  updatedAt: number
}

// ──────────────────────────────────────────────────────────────
// GET: retorna tots els usuaris
// ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view')
    const snap = await db.collection('users').get()
    const users = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      if (view === 'project-options') {
        return {
          id: d.id,
          name: String(data.name || ''),
          role: String(data.role || ''),
          email: String(data.email || ''),
          department: String(data.department || ''),
        }
      }
      return { id: d.id, ...data }
    })
    return NextResponse.json(users)
  } catch (error: unknown) {
    console.error('🛑 GET /api/users failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────
// POST: crea o actualitza usuari
// ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string
      name?: string
      password?: string
      role?: string
      department?: string
      email?: string
      phone?: string
      opsEventsConfigurable?: boolean
      opsEventsEnabled?: boolean
      opsProjectsConfigurable?: boolean
      opsChannelsConfigurable?: string[]
      available?: boolean
      isDriver?: boolean
      workerRank?: string
    }

    const {
      id,
      name = '',
      password = '',
      role = '',
      department = '',
      email = '',
      phone = '',
      opsEventsConfigurable = false,
      opsEventsEnabled = false,
      opsProjectsConfigurable = true,
      opsChannelsConfigurable = [],
      available,
      isDriver,
      workerRank,
    } = body

    if (requiresCorporateEmail(role) && !email.trim()) {
      return NextResponse.json(
        { error: 'Email corporatiu obligatori per admin, direccio i caps de departament' },
        { status: 400 }
      )
    }

    // 🔹 Construir payload base
    let userPayload: UserPayload = {
      name: name.trim(),
      nameFold: normLower(name),
      password: password.toString(),
      role: role.trim(),
      department: department.trim(),
      departmentLower: normLower(department),
      email: email.trim() || null,
      phone: phone.trim() || null,
      opsEventsConfigurable: Boolean(opsEventsConfigurable),
      opsEventsEnabled: Boolean(opsEventsEnabled),
      opsProjectsConfigurable: Boolean(opsProjectsConfigurable),
      opsChannelsConfigurable: Array.isArray(opsChannelsConfigurable)
        ? opsChannelsConfigurable.map(String).filter(Boolean)
        : [],
      available: isTreballador(role) || isCapDepartament(role) ? (available ?? true) : undefined,
      isDriver: isTreballador(role) || isCapDepartament(role) ? (isDriver ?? false) : undefined,
      workerRank:
        isTreballador(role) || isCapDepartament(role) ? (workerRank || 'equip') : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // ✅ Eliminar valors undefined del payload
    userPayload = Object.fromEntries(
      Object.entries(userPayload).filter(([, v]) => v !== undefined)
    ) as UserPayload

    // 🔹 Crear o actualitzar usuari a `users`
    let userId: string

    if (id) {
      const ref = db.collection('users').doc(id)
      await ref.set({ ...userPayload, userId: id }, { merge: true })
      userId = id
    } else {
      const ref = await db.collection('users').add(userPayload)
      await ref.set({ userId: ref.id }, { merge: true })
      userId = ref.id
    }

    // 🔹 Si és treballador o cap de departament → sincronitza `personnel`
    if (isTreballador(role) || isCapDepartament(role)) {
      const personRef = db.collection('personnel').doc(userId)
      const snap = await personRef.get()
      const isCap = isCapDepartament(role)

      const person = {
        id: userId,
        name: userPayload.name,
        department: userPayload.department,
        departmentLower: userPayload.departmentLower,
        role: isCap ? 'responsable' : 'treballador',
        available: userPayload.available ?? true,
        isDriver: userPayload.isDriver ?? false,
        workerRank: isCap ? 'responsable' : userPayload.workerRank || 'equip',
        email: userPayload.email,
        phone: userPayload.phone,
        createdAt: snap.exists ? (snap.data() as any).createdAt ?? Date.now() : Date.now(),
        updatedAt: Date.now(),
      }

      if (!snap.exists) await personRef.set(person)
      else await personRef.set(person, { merge: true })
    }

    // 🔹 Retornar resultat
    return NextResponse.json({ id: userId, ...userPayload }, { status: 201 })
  } catch (error: unknown) {
    console.error('🛑 POST /api/users failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
