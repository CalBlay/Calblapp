// file: src/app/api/users/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
const requiresCorporateEmail = (role?: string, isAdmin?: boolean) =>
  Boolean(isAdmin) || ['admin', 'direccio', 'cap'].includes(normalizeRole(role))

// ──────────────────────────────────────────────────────────────
// Tipus
// ──────────────────────────────────────────────────────────────
interface UserUpdate {
  name?: string
  nameFold?: string
  role?: string
  isAdmin?: boolean
  department?: string
  departmentLower?: string
  commercialName?: string
  commercialNameFold?: string
  opsEventsConfigurable?: boolean
  opsEventsEnabled?: boolean
  opsProjectsConfigurable?: boolean
  opsChannelsConfigurable?: string[]
  canRespondSurveys?: boolean
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  email?: string | null
  phone?: string | null
  updatedAt?: number
  createdAt?: number
  userId?: string
}

// ──────────────────────────────────────────────────────────────
// GET: obtenir usuari per ID
// ──────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    const snap = await db.collection('users').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    return NextResponse.json({ id: snap.id, ...snap.data() })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────
// PUT: modificar usuari
// ──────────────────────────────────────────────────────────────
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const data = (await req.json()) as Partial<UserUpdate>
    const currentSnap = await db.collection('users').doc(id).get()
    const currentData = currentSnap.data() || {}
    const nextRole = typeof data.role === 'string' ? data.role : currentData.role
    const nextIsAdmin =
      typeof data.isAdmin === 'boolean'
        ? data.isAdmin
        : Boolean((currentData as { isAdmin?: boolean }).isAdmin || normalizeRole(String(nextRole || '')) === 'admin')
    const nextEmail =
      typeof data.email === 'string'
        ? data.email.trim()
        : typeof currentData.email === 'string'
        ? currentData.email.trim()
        : ''

    if (requiresCorporateEmail(nextRole, nextIsAdmin) && !nextEmail) {
      return NextResponse.json(
        { error: 'Email corporatiu obligatori per admin, direccio i caps de departament' },
        { status: 400 }
      )
    }

    // 🔹 Construir objecte base d'actualització
    const rawUpdate: UserUpdate = {
      ...data,
      isAdmin: nextIsAdmin,
      userId: undefined, // no permetre canviar
      updatedAt: Date.now(),
    }

    if (Array.isArray(rawUpdate.opsChannelsConfigurable)) {
      rawUpdate.opsChannelsConfigurable = rawUpdate.opsChannelsConfigurable
        .map(String)
        .filter(Boolean)
    }

    // 🔹 Normalitzar departament
    if (typeof rawUpdate.department === 'string') {
      rawUpdate.department = rawUpdate.department.trim()
      rawUpdate.departmentLower = normLower(rawUpdate.department)
    }

    // 🔹 Normalitzar nom (per login case/accents insensitive)
    if (typeof rawUpdate.name === 'string') {
      rawUpdate.name = rawUpdate.name.trim()
      rawUpdate.nameFold = normLower(rawUpdate.name)
    }

    if (typeof rawUpdate.commercialName === 'string') {
      rawUpdate.commercialName = rawUpdate.commercialName.trim()
      rawUpdate.commercialNameFold = rawUpdate.commercialName ? normLower(rawUpdate.commercialName) : ''
    }

    // 🔹 Si NO és treballador → netegem camps específics de torns
    if (!isTreballador(rawUpdate.role)) {
      rawUpdate.available = undefined
      rawUpdate.isDriver = undefined
      rawUpdate.workerRank = undefined
    }

    // 🔹 Eliminar propietats undefined
    const update = Object.fromEntries(
      Object.entries(rawUpdate).filter(([, v]) => v !== undefined)
    ) as UserUpdate

    // 🔹 Guardar usuari a `users`
    await db
      .collection('users')
      .doc(id)
      .set({ ...update, userId: id }, { merge: true })

    // 🔹 Si és treballador → sincronitzar col·lecció `personnel`
    if (isTreballador(update.role)) {
      const personRef = db.collection('personnel').doc(id)
      const snap = await personRef.get()
      const snapData = snap.data() || {}

      const body = {
        id,
        name: update.name ?? snapData.name ?? '',
        department: update.department ?? snapData.department ?? '',
        departmentLower:
          update.departmentLower ?? snapData.departmentLower ?? '',
        role: 'treballador',
        available: update.available ?? snapData.available ?? true,
        isDriver: update.isDriver ?? snapData.isDriver ?? false,
        workerRank: update.workerRank ?? snapData.workerRank ?? 'equip',
        email: update.email ?? snapData.email ?? null,
        phone: update.phone ?? snapData.phone ?? null,
        updatedAt: Date.now(),
        createdAt: snap.exists
          ? snapData.createdAt ?? Date.now()
          : Date.now(),
      }

      await personRef.set(body, { merge: true })
    }

    // 🔹 Retornar document final
    const final = await db.collection('users').doc(id).get()
    return NextResponse.json({ id, ...final.data() })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ──────────────────────────────────────────────────────────────
// DELETE: eliminar usuari (no elimina personnel)
// ──────────────────────────────────────────────────────────────
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    await db.collection('users').doc(id).delete()

    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
