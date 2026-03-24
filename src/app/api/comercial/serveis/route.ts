// file: src/app/api/comercial/serveis/route.ts
import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

type ServiceNode = {
  name: string
  templates: Array<{
    name: string
    concepts: Array<{ name: string; articles: string[] }>
  }>
}

const normalize = (value: unknown) => String(value || '').trim()

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'scripts', 'serveis.xlsx')
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'No s’ha trobat scripts/serveis.xlsx' },
        { status: 404 }
      )
    }

    let workbook: XLSX.WorkBook
    try {
      workbook = XLSX.readFile(filePath, { cellDates: false })
    } catch {
      const buffer = fs.readFileSync(filePath)
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
    }
    const sheet =
      workbook.Sheets['Export'] || workbook.Sheets[workbook.SheetNames[0]]

    if (!sheet) {
      return NextResponse.json(
        { error: 'No hi ha cap pestanya disponible' },
        { status: 400 }
      )
    }

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
    })

    const headers = rows[0] || []
    if (!headers[3]) headers[3] = 'Artículo'

    const norm = (v: string) => normalize(v).toLowerCase()
    const idxServicio = headers.findIndex((h) => norm(h) === 'servicio')
    const idxPlantilla = headers.findIndex((h) => norm(h) === 'plantilla')
    const idxConcepto = headers.findIndex((h) => norm(h) === 'concepto' || norm(h) === 'concepte')
    const idxArticulo = headers.findIndex((h) => norm(h) === 'articulo' || norm(h) === 'artículo')

    const isHeaderRow = (r: string[]) =>
      norm(r[idxServicio]) === 'servicio' &&
      norm(r[idxPlantilla]) === 'plantilla' &&
      (norm(r[idxConcepto]) === 'concepto' || norm(r[idxConcepto]) === 'concepte')

    const serviceMap = new Map<
      string,
      Map<string, Map<string, Set<string>>>
    >()

    rows.slice(1).forEach((r) => {
      if (isHeaderRow(r)) return
      const servei = normalize(r[idxServicio])
      const plantilla = normalize(r[idxPlantilla])
      const concepte = normalize(r[idxConcepto])
      const article = normalize(r[idxArticulo])

      if (!servei || !plantilla || !concepte) return

      if (!serviceMap.has(servei)) {
        serviceMap.set(servei, new Map())
      }
      const tplMap = serviceMap.get(servei)!
      if (!tplMap.has(plantilla)) {
        tplMap.set(plantilla, new Map())
      }
      const conceptMap = tplMap.get(plantilla)!
      if (!conceptMap.has(concepte)) {
        conceptMap.set(concepte, new Set())
      }
      if (article) {
        conceptMap.get(concepte)!.add(article)
      }
    })

    const services: ServiceNode[] = []
    serviceMap.forEach((tplMap, servei) => {
      const templates: ServiceNode['templates'] = []
      tplMap.forEach((conceptMap, plantilla) => {
        const concepts = Array.from(conceptMap.entries()).map(([name, set]) => ({
          name,
          articles: Array.from(set.values()),
        }))
        templates.push({ name: plantilla, concepts })
      })
      services.push({ name: servei, templates })
    })

    return NextResponse.json({ services })
  } catch (err) {
    console.error('[api/comercial/serveis] error', err)
    return NextResponse.json(
      { error: 'Error llegint serveis.xlsx' },
      { status: 500 }
    )
  }
}
