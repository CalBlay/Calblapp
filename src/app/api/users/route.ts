// file: src/app/api/users/route.ts
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { saveUserAccessAssignment } from '@/lib/server/userAccessAssignment'
import { preparePasswordForStorage } from '@/lib/server/passwords'
import { serializeAdminUserResponse } from '@/lib/server/userApiSerialization'
import type { UserAccessAssignmentInput } from '@/lib/permissions/types'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const unaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const normLower = (s?: string) =>
  unaccent((s || '').toString().trim()).toLowerCase()

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

const isTreballador = (role?: string) => normLower(role) === 'treballador'
const isCapDepartament = (role?: string) => normalizeRole(role) === 'cap'
const requiresCorporateEmail = (role?: string, isAdmin?: boolean) =>
  Boolean(isAdmin) || ['admin', 'direccio', 'cap'].includes(normalizeRole(role))

// ──────────────────────────────────────────────────────────────
// Tipus
// ──────────────────────────────────────────────────────────────
interface UserPayload {
  name: string
  nameFold: string
  password: string
  role: string
  isAdmin?: boolean
  department: string
  departmentLower: string
  commercialName?: string
  commercialNameFold?: string
  email: string | null
  phone: string | null
  opsEventsConfigurable?: boolean
  opsEventsEnabled?: boolean
  opsProjectsConfigurable?: boolean
  opsChannelsConfigurable?: string[]
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  isTransportLead?: boolean
  available?: boolean
  isDriver?: boolean
  workerRank?: string
  createdAt: number
  updatedAt: number
}

type PersonnelDoc = {
  createdAt?: number
}

// ──────────────────────────────────────────────────────────────
// GET: retorna tots els usuaris
// ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view')
    const isRestrictedView = view === 'project-options' || view === 'commercial-options'

    if (!isRestrictedView) {
      const denied = requireRoles(auth, ['admin'])
      if (denied) return denied.res
    }

    const snap = await db.collection('users').get()
    const users = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>
      const role = canonicalRoleLabel(String(data.role || ''), Boolean(data.isAdmin))
      const department = canonicalDepartmentLabel(String(data.department || ''))

      if (view === 'project-options') {
        return {
          id: d.id,
          name: String(data.name || ''),
          role,
          email: String(data.email || ''),
          department,
        }
      }

      if (view === 'commercial-options') {
        return {
          id: d.id,
          name: String(data.name || ''),
          role,
          department,
        }
      }

      return serializeAdminUserResponse(d.id, data, { role, department })
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
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const denied = requireRoles(auth, ['admin'])
    if (denied) return denied.res

    const body = (await req.json()) as {
      id?: string
      name?: string
      password?: string
      role?: string
      isAdmin?: boolean
      department?: string
      commercialName?: string
      email?: string
      phone?: string
      opsEventsConfigurable?: boolean
      opsEventsEnabled?: boolean
      opsProjectsConfigurable?: boolean
      opsChannelsConfigurable?: string[]
      canRespondSurveys?: boolean
      isTransportLead?: boolean
      available?: boolean
      isDriver?: boolean
      workerRank?: string
      isDepartmentRobaLead?: boolean
      accessAssignment?: UserAccessAssignmentInput
    }

    const {
      id,
      name = '',
      password = '',
      role = '',
      isAdmin = false,
      department = '',
      commercialName = '',
      email = '',
      phone = '',
      opsEventsConfigurable = false,
      opsEventsEnabled = false,
      opsProjectsConfigurable = true,
      opsChannelsConfigurable = [],
      canRespondSurveys = false,
      isTransportLead = false,
      available,
      isDriver,
      workerRank,
      isDepartmentRobaLead = false,
      accessAssignment,
    } = body

    if (requiresCorporateEmail(role, isAdmin) && !email.trim()) {
      return NextResponse.json(
        { error: 'Email corporatiu obligatori per admin, direccio i caps de departament' },
        { status: 400 }
      )
    }

    const passwordTrimmed = password.toString().trim()
    if (!id && !passwordTrimmed) {
      return NextResponse.json({ error: 'Contrasenya obligatòria per a usuaris nous' }, { status: 400 })
    }

    // 🔹 Construir payload base
    let userPayload: UserPayload = {
      name: name.trim(),
      nameFold: normLower(name),
      password: '',
      role: role.trim(),
      isAdmin: Boolean(isAdmin || normalizeRole(role) === 'admin'),
      department: department.trim(),
      departmentLower: normLower(department),
      commercialName: commercialName.trim() || undefined,
      commercialNameFold: commercialName.trim() ? normLower(commercialName) : undefined,
      email: email.trim() || null,
      phone: phone.trim() || null,
      opsEventsConfigurable: Boolean(opsEventsConfigurable),
      opsEventsEnabled: Boolean(opsEventsEnabled),
      opsProjectsConfigurable: Boolean(opsProjectsConfigurable),
      opsChannelsConfigurable: Array.isArray(opsChannelsConfigurable)
        ? opsChannelsConfigurable.map(String).filter(Boolean)
        : [],
      canRespondSurveys: Boolean(canRespondSurveys),
      isDepartmentRobaLead: Boolean(isDepartmentRobaLead),
      isTransportLead:
        isCapDepartament(role) && normLower(department) === 'logistica'
          ? Boolean(isTransportLead)
          : false,
      available: isTreballador(role) || isCapDepartament(role) ? (available ?? true) : undefined,
      isDriver: isTreballador(role) || isCapDepartament(role) ? (isDriver ?? false) : undefined,
      workerRank:
        isTreballador(role) || isCapDepartament(role) ? (workerRank || 'equip') : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (passwordTrimmed) {
      userPayload.password = (await preparePasswordForStorage(passwordTrimmed)) || ''
    } else {
      delete (userPayload as Partial<UserPayload>).password
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
        createdAt: snap.exists
          ? ((snap.data() as PersonnelDoc | undefined)?.createdAt ?? Date.now())
          : Date.now(),
        updatedAt: Date.now(),
      }

      if (!snap.exists) await personRef.set(person)
      else await personRef.set(person, { merge: true })
    }

    if (accessAssignment && !id) {
      await saveUserAccessAssignment({
        userId,
        role: userPayload.role,
        department: userPayload.department,
        overrides: accessAssignment.overrides ?? [],
        updatedBy: auth.user.id,
      })
    }

    // 🔹 Retornar resultat (mai exposar password)
    return NextResponse.json(serializeAdminUserResponse(userId, userPayload as unknown as Record<string, unknown>), {
      status: 201,
    })
  } catch (error: unknown) {
    console.error('🛑 POST /api/users failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
