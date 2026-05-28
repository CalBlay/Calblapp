import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'

type UserRow = {
  id: string
  name?: string
  email?: string
  role?: string
  department?: string
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const snap = await firestoreAdmin.collection('users').limit(500).get()
  const users: UserRow[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id: d.id,
      name: typeof data.name === 'string' ? data.name : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
      role: typeof data.role === 'string' ? data.role : undefined,
      department: typeof data.department === 'string' ? data.department : undefined,
    }
  })

  users.sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'ca', { sensitivity: 'base' }))

  return NextResponse.json({ users })
}

