import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { computeQuadrantsGet } from '@/lib/api/quadrantsGetRange'

const RANGE_REVALIDATE_SEC = 90

const getQuadrantsCached = unstable_cache(
  async (start: string, end: string, departmentNorm: string) =>
    computeQuadrantsGet(start, end, departmentNorm),
  ['api-quadrants-get-v1'],
  { revalidate: RANGE_REVALIDATE_SEC }
)

const normalize = (s?: string | null): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const departmentRaw = searchParams.get('department') || 'serveis'
    const department = normalize(departmentRaw)

    if (!start || !end) {
      return NextResponse.json({ error: 'Falten dates' }, { status: 400 })
    }
    if (!isIsoDateDayParam(start) || !isIsoDateDayParam(end)) {
      return NextResponse.json(
        { error: 'start i end han de ser dates YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const { quadrants } = await getQuadrantsCached(start, end, department)
    return NextResponse.json({ quadrants })
  } catch (e: any) {
    console.error('[quadrants/get] ERROR:', e)
    return NextResponse.json(
      { error: e?.message || 'Error intern' },
      { status: 500 }
    )
  }
}
