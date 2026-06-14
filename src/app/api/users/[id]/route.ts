// file: src/app/api/users/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { preparePasswordForStorage } from '@/lib/server/passwords'
import {
  pickSelfProfileUpdate,
  serializeAdminUserResponse,
  serializeUserResponse,
} from '@/lib/server/userApiSerialization'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normLower = (s?: string) =>
  unaccent((s || '').toString().trim()).toLowerCase()

const isTreballador = (role?: string) => normLower(role) === 'treballador'
const isCapDepartament = (role?: string) => normalizeRole(role) === 'cap'
const requiresCorporateEmail = (role?: string, isAdmin?: boolean) =>
  Boolean(isAdmin) || ['admin', 'direccio', 'cap'].includes(normalizeRole(role))

const canonicalRoleLabel = (role?: string, isAdmin?: boolean) => {
  if (Boolean(isAdmin) || normalizeRole(role) === 'admin') return 'Admin'
  switch (normalizeRole(role)) {
    case 'direccio':
      return 'Direccio'
    case 'cap':
      return 'Cap Departament'
    case 'treballador':
      return 'Treballador'
    case 'comercial':
      return 'Comercial'
    case 'observer':
      return 'Observer'
    case 'usuari':
      return 'Usuari'
    default:
      return String(role || '').trim()
  }
}

const canonicalDepartmentLabel = (department?: string) => {
  const raw = String(department || '').trim()
  const key = normLower(raw).replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
  if (!raw) return raw
  if (key.includes('recursos') && key.includes('humans')) return 'Recursos Humans'
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

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
  /** Responsable de roba del departament (mòdul Roba personal). */
  isDepartmentRobaLead?: boolean
  /** Responsable de transports dins logística. */
  isTransportLead?: boolean
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  email?: string | null
  phone?: string | null
  updatedAt?: number
  createdAt?: number
  userId?: string
  password?: string
}

// ──────────────────────────────────────────────────────────────
// GET: obtenir usuari per ID
// ──────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { id } = await context.params
    const isSelf = auth.user.id === id
    if (!isSelf) {
      const denied = requireRoles(auth, ['admin'])
      if (denied) return denied.res
    }

    const snap = await db.collection('users').doc(id).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    const data = snap.data() as Record<string, unknown>
    const extras = {
      role: canonicalRoleLabel(String(data.role || ''), Boolean(data.isAdmin)),
      department: canonicalDepartmentLabel(String(data.department || '')),
    }

    if (isSelf) {
      return NextResponse.json(serializeUserResponse(snap.id, data, extras))
    }

    return NextResponse.json(serializeAdminUserResponse(snap.id, data, extras))
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
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { id } = await context.params
    const isSelf = auth.user.id === id
    const isAdmin = auth.role === 'admin'

    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as Partial<UserUpdate> & { password?: string }
    const data: Partial<UserUpdate> & { password?: string } = isAdmin
      ? body
      : (pickSelfProfileUpdate(body as Record<string, unknown>) as Partial<UserUpdate> & {
          password?: string
        })

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

    const finalRole =
      typeof rawUpdate.role === 'string' ? rawUpdate.role : String(currentData.role || '')
    const finalDepartment =
      typeof rawUpdate.department === 'string' ? rawUpdate.department : String(currentData.department || '')
    const canKeepTransportLead =
      isCapDepartament(finalRole) && normLower(finalDepartment) === 'logistica'
    rawUpdate.isTransportLead = canKeepTransportLead ? Boolean(rawUpdate.isTransportLead) : false

    // 🔹 Si NO és treballador → netegem camps específics de torns
    if (!isTreballador(rawUpdate.role) && !isCapDepartament(rawUpdate.role)) {
      rawUpdate.available = undefined
      rawUpdate.isDriver = undefined
      rawUpdate.workerRank = undefined
    }

    const passwordPlain =
      typeof (data as { password?: string }).password === 'string'
        ? (data as { password?: string }).password!.trim()
        : ''
    if (passwordPlain) {
      rawUpdate.password = (await preparePasswordForStorage(passwordPlain)) || undefined
    } else {
      delete (rawUpdate as { password?: string }).password
    }

    // 🔹 Eliminar propietats undefined
    const update = Object.fromEntries(
      Object.entries(rawUpdate).filter(([, v]) => v !== undefined)
    ) as UserUpdate & { password?: string }

    // 🔹 Guardar usuari a `users`
    await db
      .collection('users')
      .doc(id)
      .set({ ...update, userId: id }, { merge: true })

    // 🔹 Si és treballador → sincronitzar col·lecció `personnel`
    if (isTreballador(update.role) || isCapDepartament(update.role)) {
      const personRef = db.collection('personnel').doc(id)
      const snap = await personRef.get()
      const snapData = snap.data() || {}
      const isCap = isCapDepartament(update.role)

      const body = {
        id,
        name: update.name ?? snapData.name ?? '',
        department: update.department ?? snapData.department ?? '',
        departmentLower:
          update.departmentLower ?? snapData.departmentLower ?? '',
        role: isCap ? 'responsable' : 'treballador',
        available: update.available ?? snapData.available ?? true,
        isDriver: update.isDriver ?? snapData.isDriver ?? false,
        workerRank: isCap ? 'responsable' : update.workerRank ?? snapData.workerRank ?? 'equip',
        email: update.email ?? snapData.email ?? null,
        phone: update.phone ?? snapData.phone ?? null,
        updatedAt: Date.now(),
        createdAt: snap.exists
          ? snapData.createdAt ?? Date.now()
          : Date.now(),
      }

      await personRef.set(body, { merge: true })
    }

    // 🔹 Retornar document final (mai exposar password)
    const final = await db.collection('users').doc(id).get()
    const finalData = (final.data() || {}) as Record<string, unknown>
    return NextResponse.json(
      serializeAdminUserResponse(id, finalData, {
        role: canonicalRoleLabel(String(finalData.role || ''), Boolean(finalData.isAdmin)),
        department: canonicalDepartmentLabel(String(finalData.department || '')),
      })
    )
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
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const denied = requireRoles(auth, ['admin'])
    if (denied) return denied.res

    const { id } = await context.params

    await db.collection('users').doc(id).delete()

    return new NextResponse(null, { status: 204 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
