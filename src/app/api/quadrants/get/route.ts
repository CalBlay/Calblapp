import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { isIsoDateDayParam } from '@/lib/firestoreStageRangeQuery'
import { computeQuadrantsGet } from '@/lib/api/quadrantsGetRange'
import { QUADRANTS_LIST_CACHE_TAG } from '@/lib/quadrantsListCache'
import { requireQuadrantsModuleRead } from '@/lib/server/quadrantsReadAuth'

const RANGE_REVALIDATE_SEC = 90

const getQuadrantsCached = unstable_cache(
  async (start: string, end: string, departmentNorm: string) =>
    computeQuadrantsGet(start, end, departmentNorm),
  ['api-quadrants-get-v1'],
  { revalidate: RANGE_REVALIDATE_SEC, tags: [QUADRANTS_LIST_CACHE_TAG] }
)

const normalize = (s?: string | null): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export async function GET(req: Request) {
  const auth = await requireQuadrantsModuleRead()
  if (!auth.ok) return auth.res

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

    const skipCache = searchParams.get('skipCache') === '1'

    const { quadrants } = skipCache
      ? await computeQuadrantsGet(start, end, department)
      : await getQuadrantsCached(start, end, department)
    return NextResponse.json({ quadrants })
  } catch (e: unknown) {
    console.error('[quadrants/get] ERROR:', e)
    const message = e instanceof Error ? e.message : 'Error intern'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
