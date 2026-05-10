// file: src/app/api/quadrants/departments/route.ts
import { NextResponse } from 'next/server'
import {
  listQuadrantCollectionIds,
  quadrantCollectionToDept,
} from '@/lib/firestoreCollections'

export async function GET() {
  try {
    const ids = await listQuadrantCollectionIds()
    const set = new Set<string>()
    for (const id of ids) {
      const suf = quadrantCollectionToDept(id)
      if (suf) set.add(suf)
    }
    return NextResponse.json({
      departments: Array.from(set).sort((a, b) => a.localeCompare(b, 'ca')),
    })
  } catch (e) {
    console.error('[quadrants/departments]', e)
    return NextResponse.json({ departments: [] }, { status: 200 })
  }
}
