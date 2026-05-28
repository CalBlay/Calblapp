export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  joinRecipientEmails,
  listCompresCapRecipients,
} from '@/lib/roba-personal/purchaseRecipient'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'

export async function GET() {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.compres)
  if (!auth.ok) return auth.res

  const recipients = await listCompresCapRecipients()
  const toDefault = joinRecipientEmails(recipients)
  const missingEmail = recipients.filter((r) => !r.email)

  return NextResponse.json({
    recipients,
    toDefault,
    hasEmail: Boolean(toDefault),
    missingEmailCount: missingEmail.length,
    hint:
      recipients.length === 0
        ? 'No hi ha cap usuari amb rol «Cap departament» i departament «Compres». Afegiu-lo o ajusteu-lo al mòdul Usuaris.'
        : !toDefault
          ? 'Els caps de Compres no tenen correu electrònic al perfil. Ompliu el camp email al mòdul Usuaris.'
          : null,
  })
}
