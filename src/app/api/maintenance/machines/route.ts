import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import * as XLSX from 'xlsx'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

type MachineRow = {
  id: string
  code: string
  name: string
  label: string
  active: boolean
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const firestoreSnap = await db.collection('maintenanceMachines').get()
    if (!firestoreSnap.empty) {
      const machines = firestoreSnap.docs
        .map((doc) => {
          const data = (doc.data() || {}) as Record<string, unknown>
          const code = String(data.code || '').trim()
          const name = String(data.name || '').trim()
          if (!code && !name) return null
          return {
            id: doc.id,
            code,
            name,
            label: code && name ? `${code} · ${name}` : code || name,
            active: data.active !== false,
          }
        })
        .filter((item): item is MachineRow => Boolean(item))
        .filter((item) => item.active !== false)

      return NextResponse.json({ machines })
    }

    const primaryPath = path.join(process.cwd(), 'scripts', 'Maquinaria.xlsx')
    const fallbackPath = path.join(process.cwd(), 'public', 'Maquinaria.xlsx')
    const filePath = fs.existsSync(primaryPath)
      ? primaryPath
      : fs.existsSync(fallbackPath)
      ? fallbackPath
      : null

    if (!filePath) {
      return NextResponse.json(
        { machines: [], error: 'File not found', details: { primaryPath, fallbackPath } },
        { status: 200 }
      )
    }
    let workbook: XLSX.WorkBook
    try {
      workbook = XLSX.readFile(filePath, { cellDates: false })
    } catch {
      const buffer = fs.readFileSync(filePath)
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
    }
    const sheetName = workbook.SheetNames.includes('Export') ? 'Export' : workbook.SheetNames[0]
    const ws = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]

    const machines = rows
      .map((row) => {
        const code = String(row[0] || '').trim()
        const name = String(row[1] || '').trim()
        if (!code && !name) return null
        return {
          code,
          name,
          label: code && name ? `${code} · ${name}` : code || name,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ machines })
  } catch (err) {
    console.error('[maintenance/machines] error', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'Error carregant maquinaria', details: message },
      { status: 500 }
    )
  }
}
