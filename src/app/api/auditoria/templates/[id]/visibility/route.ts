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

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })

    const role = normalizeRole(user.role || '')
    const userDept = resolveAuditDepartmentForUser(user.department || '')
    if (!['admin', 'direccio', 'cap'].includes(role)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { id } = await ctx.params
    const ref = firestoreAdmin.collection('audit_templates').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Plantilla no trobada' }, { status: 404 })

    const data = snap.data() as Record<string, unknown>
    const department = normalizeDept(String(data.department || ''))
    if (!department) return NextResponse.json({ error: 'Departament invalid' }, { status: 400 })
    if (role === 'cap' && userDept !== department) {
      return NextResponse.json({ error: 'Sense permisos sobre aquest departament' }, { status: 403 })
    }
    if (String(data.status || '') !== 'active') {
      return NextResponse.json({ error: 'Nomes es pot fer visible una plantilla activa' }, { status: 400 })
    }

    const now = Date.now()
    const deptSnap = await firestoreAdmin
      .collection('audit_templates')
      .where('department', '==', department)
      .get()

    const batch = firestoreAdmin.batch()
    deptSnap.docs.forEach((docSnap) => {
      batch.set(
        docSnap.ref,
        {
          isVisible: docSnap.id === id,
          updatedAt: now,
        },
        { merge: true }
      )
    })
    await batch.commit()

    return NextResponse.json({ ok: true, visibleTemplateId: id, department })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
