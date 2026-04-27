export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

type Department = 'comercial' | 'serveis' | 'cuina' | 'logistica' | 'deco'

function normalizeDept(raw?: string): Department | null {
  const value = (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (value === 'comercial') return 'comercial'
  if (value === 'serveis') return 'serveis'
  if (value === 'cuina') return 'cuina'
  if (value === 'logistica') return 'logistica'
  if (value === 'deco' || value === 'decoracio' || value === 'decoracions') return 'deco'
  return null
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined

    if (!user?.id) {
      return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    }

    const role = normalizeRole(user.role || '')
    const userDept = resolveAuditDepartmentForUser(user.department || '')

    if (!['admin', 'direccio', 'cap'].includes(role)) {
      return NextResponse.json({ error: 'Sense permisos per crear plantilles' }, { status: 403 })
    }

    const body = (await req.json()) as { name?: string; department?: string }
    const name = (body.name || '').toString().trim()
    const department = normalizeDept(body.department || '')

    if (!name) {
      return NextResponse.json({ error: 'Nom de plantilla obligatori' }, { status: 400 })
    }
    if (!department) {
      return NextResponse.json({ error: 'Departament invalid' }, { status: 400 })
    }

    if (role === 'cap') {
      if (!userDept || userDept !== department) {
        return NextResponse.json(
          { error: 'Un cap nomes pot crear plantilles del seu departament' },
          { status: 403 }
        )
      }
    }

    const now = Date.now()
    const ref = await firestoreAdmin.collection('audit_templates').add({
      name,
      department,
      status: 'draft',
      isVisible: false,
      blocks: [],
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })

    return NextResponse.json({ id: ref.id, ok: true }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
