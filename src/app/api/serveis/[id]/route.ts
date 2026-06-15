import { NextResponse } from 'next/server'
import { requireSettingsServeisEdit } from '@/lib/server/settingsApiAuth'
import { deleteServei, updateServei } from '@/lib/serveis/server'
import { requireAuth } from '@/lib/server/apiAuth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsServeisEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = (await req.json()) as { nom?: string }

  try {
    const servei = await updateServei(id, { nom: body.nom })
    return NextResponse.json({ servei })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut actualitzar el servei.' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsServeisEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  try {
    await deleteServei(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No s\'ha pogut eliminar el servei.' },
      { status: 400 }
    )
  }
}
