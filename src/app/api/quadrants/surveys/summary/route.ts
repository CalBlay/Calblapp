import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { normalizeRole } from '@/lib/roles'
import { listSurveyKeysByDepartmentAndRange } from '@/lib/quadrantSurveys'

export const runtime = 'nodejs'

type SurveySummaryToken = {
  role?: string
  department?: string
  userDepartment?: string
  dept?: string
  departmentName?: string
} | null

const norm = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export async function GET(req: NextRequest) {
  try {
    const token = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET })) as SurveySummaryToken
    const role = normalizeRole(String(token?.role || ''))
    const department = norm(
      String(
        token?.department ??
          token?.userDepartment ??
          token?.dept ??
          token?.departmentName ??
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

    const surveyKeys = await listSurveyKeysByDepartmentAndRange(
      department,
      start,
      end
    )

    return NextResponse.json({ surveyKeys })
  } catch (error) {
    console.error('[quadrants/surveys/summary] GET error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
