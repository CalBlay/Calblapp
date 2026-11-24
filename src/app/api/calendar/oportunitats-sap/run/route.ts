import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { isAllowedByClientOverride } from '@/lib/server/permissions'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'
import {
  enqueueCompresSalesOppJob,
  getOportunitatsSapControl,
  recordOportunitatsSapRun,
} from '@/lib/calendar/oportunitatsSapControl.server'

export const runtime = 'nodejs'

/**
 * Encua al PC worker (Gestor Compres) creació d’oportunitats SAP.
 * Prova controlada: només mails d’avui (Europe/Madrid) + confirm=true.
 */
export async function POST() {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const allowed = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: CALENDAR_PERM.syncOportunitatsSap,
    })
    if (allowed !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const control = await getOportunitatsSapControl()
    if (!control.enabled) {
      return NextResponse.json(
        {
          error:
            'Interruptor OFF. Activa «Oportunitats SAP» al Calendar abans de revisar.',
        },
        { status: 409 }
      )
    }

    const enqueued = await enqueueCompresSalesOppJob()
    const email = String(auth.user.email || auth.user.id || '')
    await recordOportunitatsSapRun({
      userEmail: email,
      jobId: enqueued.jobId,
      summary: enqueued.ok
        ? enqueued.hint || 'Feina encoada al PC worker'
        : null,
      error: enqueued.error,
    })

    if (!enqueued.ok) {
      return NextResponse.json(
        { ok: false, error: enqueued.error },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      jobId: enqueued.jobId,
      hint:
        enqueued.hint ||
        'Feina encoada: només mails d’avui → crear oportunitats a SAP (cal PC worker en marxa).',
      control: await getOportunitatsSapControl(),
    })
  } catch (error) {
    console.error('[oportunitats-sap/run POST]', error)
    return NextResponse.json(
      { error: 'Error encoant oportunitats SAP' },
      { status: 500 }
    )
  }
}
