import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const norm = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    const role = normalizeRole(String((token as any)?.role || ''))
    const department = norm(
      String(
        (token as any)?.department ??
          (token as any)?.userDepartment ??
          (token as any)?.dept ??
          (token as any)?.departmentName ??
          ''
      )
    )

    if (!['admin', 'direccio', 'cap'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const start = String(searchParams.get('start') || '').slice(0, 10)
    const end = String(searchParams.get('end') || '').slice(0, 10)
    if (!start || !end) {
      return NextResponse.json({ error: 'Missing range' }, { status: 400 })
    }

    const snap = await db.collection('quadrantSurveys').where('department', '==', department).get()
    const surveyKeys = snap.docs
      .map((doc) => doc.data() as any)
      .filter((survey) => {
        const serviceDate = String(survey?.serviceDate || '').slice(0, 10)
        return serviceDate >= start && serviceDate <= end
      })
      .map((survey) => {
        const eventId = String(survey?.eventId || '').trim().split('__')[0]
        const serviceDate = String(survey?.serviceDate || '').slice(0, 10)
        return `${eventId}__${serviceDate}`
      })

    return NextResponse.json({ surveyKeys: Array.from(new Set(surveyKeys)) })
  } catch (error) {
    console.error('[quadrants/surveys/summary] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
