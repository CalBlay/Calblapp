// src/app/api/spaces/route.ts
import { NextResponse } from 'next/server'
import { getSpacesByWeek } from '@/services/spaces/spaces'

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url)

    // ───────────────────────────────
    // 📥 Query params (NETS)
    // ───────────────────────────────
    const monthParam = searchParams.get('month')
    const yearParam = searchParams.get('year')

    const finca = searchParams.getAll('finca')
    const comercial = searchParams.getAll('comercial')
    const baseDate = searchParams.get('baseDate') || undefined

    // 🔑 filtres CLAU
    const stage = searchParams.getAll('stage')
    const ln = searchParams.getAll('ln')

    // ───────────────────────────────
    // 📅 Mes / any per defecte
    // ───────────────────────────────
    const today = new Date()
    const month = monthParam ? parseInt(monthParam, 10) : today.getMonth()
    const year = yearParam ? parseInt(yearParam, 10) : today.getFullYear()

    // ───────────────────────────────
    // 🔄 Crida ALINEADA amb service
    // getSpacesByWeek(
    //   month,
    //   year,
    //   finca,
    //   comercial,
    //   baseDate,
    //   stage,
    //   ln
    // )
    // ───────────────────────────────
    const { data, totalPaxPerDia } = await getSpacesByWeek(
      month,
      year,
      finca,
      comercial,
      baseDate,
      stage,
      ln
    )

    return NextResponse.json(
      { data, totalPaxPerDia },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API-SPACES]', error)
    return NextResponse.json(
      { error: 'Error carregant dades de disponibilitat' },
      { status: 500 }
    )
  }
}
