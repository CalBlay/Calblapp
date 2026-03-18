export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const normLower = (s?: string) => unaccent((s || '').toString().trim()).toLowerCase()

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const requestedDept = searchParams.get('department') || ''
    const roleNorm = normalizeRole((session.user as { role?: string })?.role || '')
    const isPrivileged = roleNorm === 'admin' || roleNorm === 'direccio'
    const sessionDept = (session.user as { department?: string })?.department || ''
    const resolvedDept = isPrivileged ? requestedDept : sessionDept
    const deptLower = normLower(resolvedDept)

    const [usersSnap, personnelSnap] = await Promise.all([
      firestoreAdmin.collection('users').get(),
      firestoreAdmin.collection('personnel').get(),
    ])

    const personnelIds = new Set(personnelSnap.docs.map((doc) => doc.id))

    const users = usersSnap.docs
      .filter((doc) => !personnelIds.has(doc.id))
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        return {
          id: doc.id,
          name: String(data.name || ''),
          role: String(data.role || ''),
          department: String(data.department || ''),
          departmentLower: normLower(String(data.department || '')),
          email: typeof data.email === 'string' ? data.email : '',
          phone: typeof data.phone === 'string' ? data.phone : '',
          available: typeof data.available === 'boolean' ? data.available : true,
          isDriver: typeof data.isDriver === 'boolean' ? data.isDriver : false,
          workerRank: typeof data.workerRank === 'string' ? data.workerRank : '',
        }
      })
      .filter((user) => !deptLower || user.departmentLower === deptLower)
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ success: true, data: users })
  } catch (error) {
    console.error('[api/personnel/linkable-users] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Error carregant usuaris vinculables' },
      { status: 500 }
    )
  }
}
