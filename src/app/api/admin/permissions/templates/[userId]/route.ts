import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { extractUserConfigTemplate } from '@/lib/permissions/userConfigTemplate'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const { userId } = await ctx.params
  const id = String(userId || '').trim()
  if (!id) return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  const [userSnap, assignmentSnap] = await Promise.all([
    firestoreAdmin.collection('users').doc(id).get(),
    firestoreAdmin.collection('user_access_assignments').doc(id).get(),
  ])

  if (!userSnap.exists) {
    return NextResponse.json({ error: 'Usuari no trobat' }, { status: 404 })
  }

  const assignment = assignmentSnap.exists
    ? (assignmentSnap.data() as UserAccessAssignmentDoc)
    : null

  const template = extractUserConfigTemplate(
    id,
    userSnap.data() as Record<string, unknown>,
    assignment
  )

  return NextResponse.json(template)
}
