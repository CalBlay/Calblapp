import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { canAccessIncidentsModule } from '@/lib/incidentPolicy'
import { capDepartmentMatchesIncidentOrigin } from '@/lib/incidentOriginDepartments'
import { normalizeRole } from '@/lib/roles'

/** Caps de departament (rol `cap`) per assignar accions derivades, filtrats per departament d’origen. */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'No autenticat' }, { status: 401 })
    if (!canAccessIncidentsModule(user)) {
      return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const deptRaw = String(searchParams.get('department') || '').trim()
    if (!deptRaw) {
      return NextResponse.json({ caps: [] as { id: string; name: string }[] }, { status: 200 })
    }

    const snap = await firestoreAdmin.collection('users').get()

    const caps = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>
        if (normalizeRole(String(data.role || '')) !== 'cap') return null
        if (!capDepartmentMatchesIncidentOrigin(deptRaw, String(data.department || ''))) return null
        const name = String(data.name || '').trim() || String(data.email || '').trim()
        if (!name) return null
        return { id: doc.id, name }
      })
      .filter(Boolean) as { id: string; name: string }[]

    caps.sort((a, b) => a.name.localeCompare(b.name, 'ca'))

    return NextResponse.json({ caps }, { status: 200 })
  } catch (e) {
    console.error('[incidents/caps GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
