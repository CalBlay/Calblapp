import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireCuinaCentralAdmin } from '@/lib/cuina-central/auth'
import { CUINA_CENTRAL_COLLECTIONS } from '@/lib/cuina-central/collections'
import type { ImportEntity } from '@/lib/cuina-central/types'
import { cleanText, pickCell, shiftDurationMinutes, slugDocId } from '@/lib/cuina-central/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ImportBody = {
  entity?: ImportEntity
  rows?: Record<string, unknown>[]
  mode?: 'incremental' | 'replace'
}

export async function POST(req: Request) {
  const auth = await requireCuinaCentralAdmin()
  if (!auth.ok) return auth.res

  const body = (await req.json().catch(() => ({}))) as ImportBody
  const entity = body.entity
  const rows = Array.isArray(body.rows) ? body.rows : []
  const mode = body.mode === 'replace' ? 'replace' : 'incremental'

  if (!entity || !rows.length) {
    return NextResponse.json({ error: 'Cal entity i rows' }, { status: 400 })
  }

  const now = Date.now()
  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  if (entity === 'articles') {
    const col = CUINA_CENTRAL_COLLECTIONS.articles
    if (mode === 'replace') {
      const snap = await db.collection(col).get()
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const code = pickCell(row, ['codi', 'code'])
      const name = pickCell(row, ['nom', 'name', 'article'])
      if (!code || !name) {
        skipped++
        continue
      }
      const id = slugDocId(code)
      const ref = db.collection(col).doc(id)
      const exists = (await ref.get()).exists
      await ref.set(
        {
          code,
          name,
          unit: pickCell(row, ['unitat', 'unit']) || 'kg',
          packagingLabel: pickCell(row, ['embalatge', 'packaging']),
          packagingQty: Number(pickCell(row, ['qty_embalatge', 'packagingqty'])) || null,
          line: 'bases',
          active: true,
          customFields: {},
          updatedAt: now,
          ...(exists ? {} : { createdAt: now }),
        },
        { merge: true }
      )
      exists ? updated++ : created++
    }
  } else if (entity === 'machines') {
    const col = CUINA_CENTRAL_COLLECTIONS.machines
    if (mode === 'replace') {
      const snap = await db.collection(col).get()
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    for (const row of rows) {
      const code = pickCell(row, ['codi', 'code'])
      const name = pickCell(row, ['nom', 'name', 'maquina'])
      if (!code || !name) {
        skipped++
        continue
      }
      const id = slugDocId(code)
      const ref = db.collection(col).doc(id)
      const exists = (await ref.get()).exists
      await ref.set(
        {
          code,
          name,
          location: pickCell(row, ['ubicacio', 'location']),
          zone: pickCell(row, ['zona', 'zone']),
          mapX: Number(pickCell(row, ['mapx', 'x'])) || null,
          mapY: Number(pickCell(row, ['mapy', 'y'])) || null,
          active: true,
          customFields: {},
          updatedAt: now,
          ...(exists ? {} : { createdAt: now }),
        },
        { merge: true }
      )
      exists ? updated++ : created++
    }
  } else if (entity === 'shifts') {
    const col = CUINA_CENTRAL_COLLECTIONS.shifts
    if (mode === 'replace') {
      const snap = await db.collection(col).get()
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    for (const row of rows) {
      const code = pickCell(row, ['codi', 'code'])
      const name = pickCell(row, ['nom', 'name', 'torn'])
      const startTime = pickCell(row, ['inici', 'start', 'hora_inici'])
      const endTime = pickCell(row, ['fi', 'end', 'hora_fi'])
      if (!code || !name || !startTime || !endTime) {
        skipped++
        continue
      }
      const id = slugDocId(code)
      const ref = db.collection(col).doc(id)
      const exists = (await ref.get()).exists
      await ref.set(
        {
          code,
          name,
          startTime,
          endTime,
          durationMinutes: shiftDurationMinutes(startTime, endTime),
          sortOrder: Number(pickCell(row, ['ordre', 'sort'])) || 0,
          active: true,
          customFields: {},
          updatedAt: now,
          ...(exists ? {} : { createdAt: now }),
        },
        { merge: true }
      )
      exists ? updated++ : created++
    }
  } else if (entity === 'rates') {
    const articlesSnap = await db.collection(CUINA_CENTRAL_COLLECTIONS.articles).get()
    const machinesSnap = await db.collection(CUINA_CENTRAL_COLLECTIONS.machines).get()
    const articleByCode = new Map(
      articlesSnap.docs.map((d) => [cleanText(d.data().code).toLowerCase(), d])
    )
    const machineByCode = new Map(
      machinesSnap.docs.map((d) => [cleanText(d.data().code).toLowerCase(), d])
    )
    if (mode === 'replace') {
      const snap = await db.collection(CUINA_CENTRAL_COLLECTIONS.machineArticleRates).get()
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    for (const row of rows) {
      const articleCode = pickCell(row, ['article_codi', 'codi_article', 'article'])
      const machineCode = pickCell(row, ['maquina_codi', 'codi_maquina', 'machine'])
      const qtyPerHour = Number(pickCell(row, ['qty_h', 'kg_h', 'rendiment']))
      const articleDoc = articleByCode.get(articleCode.toLowerCase())
      const machineDoc = machineByCode.get(machineCode.toLowerCase())
      if (!articleDoc || !machineDoc || !Number.isFinite(qtyPerHour) || qtyPerHour <= 0) {
        skipped++
        continue
      }
      const ad = articleDoc.data()
      const md = machineDoc.data()
      await db.collection(CUINA_CENTRAL_COLLECTIONS.machineArticleRates).add({
        articleId: articleDoc.id,
        articleCode: cleanText(ad.code),
        articleName: cleanText(ad.name),
        machineId: machineDoc.id,
        machineCode: cleanText(md.code),
        machineName: cleanText(md.name),
        unit: cleanText(ad.unit) || 'kg',
        qtyPerHour,
        notes: pickCell(row, ['notes', 'observacions']),
        customFields: {},
        createdAt: now,
        updatedAt: now,
      })
      created++
    }
  } else {
    return NextResponse.json({ error: 'Entity no vàlida' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, entity, mode, created, updated, skipped, errors })
}
