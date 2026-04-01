import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { normalizeRole } from '@/lib/roles'
import { createQuadrantSurvey, listQuadrantSurveys } from '@/lib/quadrantSurveys'

export const runtime = 'nodejs'

const norm = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function getSessionContext(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return null

  return {
    userId: String((token as any).id || (token as any).sub || '').trim(),
    userName: String((token as any).name || (token as any)?.user?.name || '').trim(),
    role: normalizeRole(String((token as any).userRole ?? (token as any).role ?? '')),
    department: norm(
      String(
        (token as any).department ??
          (token as any).userDepartment ??
          (token as any).dept ??
          (token as any).departmentName ??
          ''
      )
    ),
  }
}

function canLaunchSurvey(role: string) {
  return role === 'admin' || role === 'direccio' || role === 'cap'
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionContext(req)
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const eventId = String(searchParams.get('eventId') || '').trim()
    const department = String(searchParams.get('department') || '').trim()
    const serviceDate = String(searchParams.get('serviceDate') || '').trim()

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const surveys = await listQuadrantSurveys({
      eventId,
      department: department || undefined,
      serviceDate: serviceDate || undefined,
    })

    return NextResponse.json({ surveys })
  } catch (error) {
    console.error('[quadrants/surveys] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext(req)
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canLaunchSurvey(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const eventId = String(body?.eventId || '').trim()
    const department = norm(String(body?.department || session.department || ''))
    const serviceDate = String(body?.serviceDate || '').trim()
    const deadlineAt = Number(body?.deadlineAt || 0)
    const targetGroupIds = Array.isArray(body?.targetGroupIds) ? body.targetGroupIds : []
    const targetWorkerIds = Array.isArray(body?.targetWorkerIds) ? body.targetWorkerIds : []
    const snapshot = body?.snapshot || {}

    if (!eventId || !department || !serviceDate || !deadlineAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const survey = await createQuadrantSurvey({
      eventId,
      department,
      serviceDate,
      deadlineAt,
      createdById: session.userId,
      createdByName: session.userName || 'Usuari',
      targetGroupIds,
      targetWorkerIds,
      snapshot: {
        eventName: String(snapshot?.eventName || '').trim(),
        location: String(snapshot?.location || '').trim(),
        service: snapshot?.service ? String(snapshot.service) : null,
        startTime: String(snapshot?.startTime || '').trim(),
        endTime: String(snapshot?.endTime || '').trim(),
        phaseType: snapshot?.phaseType ? String(snapshot.phaseType) : null,
        totalWorkers: Number(snapshot?.totalWorkers || 0),
        totalDrivers: Number(snapshot?.totalDrivers || 0),
      },
    })

    return NextResponse.json({ ok: true, survey })
  } catch (error) {
    console.error('[quadrants/surveys] POST error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
