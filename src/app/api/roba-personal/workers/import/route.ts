export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import Papa from 'papaparse'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import {
  personnelCreateFromRobaCsvLine,
  personnelPatchFromRobaCsvLine,
  str,
} from '@/lib/roba-personal/robaWorkerFromPersonnel'

const COL = DOTACIO_COLLECTIONS.workers

function normKey(k: string): string {
  return k
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function pickCell(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const nk = normKey(k)
    if (keys.includes(nk)) {
      return str(row[k])
    }
  }
  return ''
}

function workerCodeFromDoc(data: Record<string, unknown>): string {
  return str(data.workerCode) || str(data.code)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const contentType = req.headers.get('content-type') || ''
  let rows: Record<string, unknown>[] = []

  if (contentType.includes('text/csv')) {
    const csv = await req.text()
    const parsed = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
    })
    if (parsed.errors.length) {
      return NextResponse.json(
        { error: 'CSV invàlid', details: parsed.errors.slice(0, 5) },
        { status: 400 }
      )
    }
    rows = parsed.data
  } else {
    const body = (await req.json()) as { rows?: Record<string, unknown>[] }
    if (!Array.isArray(body.rows)) {
      return NextResponse.json(
        { error: 'Cal enviar { rows: [...] } o CSV amb capçalera.' },
        { status: 400 }
      )
    }
    rows = body.rows
  }

  const snap = await db.collection(COL).get()
  const byCode = new Map<string, { id: string; ref: DocumentReference }>()
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>
    const c = workerCodeFromDoc(data)
    if (c) byCode.set(c, { id: d.id, ref: d.ref })
  }

  const batchId = `csv_${Date.now()}`
  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  const merged = new Map<
    string,
    { name: string; code: string; department: string; sourceLine: number }
  >()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = pickCell(row, ['nom', 'name', 'nombre'])
    const code = pickCell(row, ['codi', 'code', 'codigo'])
    const department = pickCell(row, ['departament', 'department', 'departamento'])
    if (!name || !code || !department) {
      skipped++
      if (errors.length < 20) {
        errors.push(`Línia ${i + 2}: falta nom, codi o departament`)
      }
      continue
    }
    merged.set(code, { name, code, department, sourceLine: i + 2 })
  }

  let batch = db.batch()
  let ops = 0

  const flush = async () => {
    if (ops === 0) return
    await batch.commit()
    batch = db.batch()
    ops = 0
  }

  const now = FieldValue.serverTimestamp()

  for (const { name, code, department } of merged.values()) {
    const existing = byCode.get(code)
    if (existing) {
      batch.update(
        existing.ref,
        personnelPatchFromRobaCsvLine({
          name,
          department,
          workerCode: code,
          batchId,
          updatedAt: now,
        })
      )
      updated++
    } else {
      const ref = db.collection(COL).doc()
      batch.set(
        ref,
        personnelCreateFromRobaCsvLine({
          name,
          department,
          workerCode: code,
          batchId,
          now,
        })
      )
      byCode.set(code, { id: ref.id, ref })
      created++
    }
    ops++
    if (ops >= 200) await flush()
  }

  await flush()

  return NextResponse.json({
    ok: true,
    batchId,
    created,
    updated,
    skipped,
    errors,
  })
}
