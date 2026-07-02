export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import {
  fetchAssignedIncidentActionsForUser,
} from '@/lib/server/incidentActionsMine'
import {
  filterMineIncidentActions,
  isOverdueIncidentAction,
  isPendingIncidentActionStatus,
} from '@/lib/incidentActionsMine'
import { normalizeIncidentActionStatus } from '@/lib/incidentPolicy'
import { requireIncidentsModuleView } from '@/lib/server/incidentsApiAuth'

export async function GET(req: Request) {
  try {
    const auth = await requireIncidentsModuleView()
    if (!auth.ok) return auth.res

    const user = auth.user
    const userId = String(user.id || '').trim()
    if (!userId) {
      return NextResponse.json({ error: 'Usuari no vàlid' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const statusRaw = String(searchParams.get('status') || 'pending').trim().toLowerCase()
    const q = String(searchParams.get('q') || '').trim()
    const overdueOnly = searchParams.get('overdue') === '1'

    const status =
      statusRaw === 'all' ||
      statusRaw === 'pending' ||
      statusRaw === 'open' ||
      statusRaw === 'in_progress' ||
      statusRaw === 'done' ||
      statusRaw === 'cancelled'
        ? statusRaw
        : 'pending'

    const allRows = await fetchAssignedIncidentActionsForUser({
      userId,
      userName: user.name,
    })

    const pendingCount = allRows.filter((row) =>
      isPendingIncidentActionStatus(normalizeIncidentActionStatus(row.status))
    ).length
    const overdueCount = allRows.filter((row) => isOverdueIncidentAction(row)).length

    const actions = filterMineIncidentActions(allRows, {
      status: status as 'pending' | 'all' | 'open' | 'in_progress' | 'done' | 'cancelled',
      q,
      overdueOnly,
    })

    return NextResponse.json(
      {
        actions,
        pendingCount,
        overdueCount,
        totalAssigned: allRows.length,
      },
      { status: 200 }
    )
  } catch (e) {
    console.error('[incidents/actions/mine GET]', e)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}
