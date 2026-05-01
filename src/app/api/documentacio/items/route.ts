export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { randomUUID } from 'crypto'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole, type Role } from '@/lib/roles'
import {
  canManageDocumentacioContent,
  documentacioItemVisibleToViewer,
  type DocumentacioItemListDTO,
  type DocumentacioItemRecord,
} from '@/lib/documentacio-access'
import { DOCUMENTACIO_ITEMS_SEARCH_TAG } from '@/lib/documentacio-cache'
import {
  findTopicInAmbit,
  isStaticDocumentacioAmbit,
  isValidDocumentacioAmbitSlug,
  isValidDocumentacioTopicSlug,
} from '@/lib/documentacio-structure'

const COLLECTION = 'documentacio_items'
const MAX_BYTES = 20 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
])

function requireDocumentacioPublisher(role: Role) {
  return canManageDocumentacioContent(role)
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.map((x) => String(x).trim()).filter(Boolean)
  } catch {
    return []
  }
}

function parseRoles(raw: string | null): Role[] {
  const list = parseJsonArray(raw)
  const out: Role[] = []
  for (const r of list) {
    const n = normalizeRole(r)
    out.push(n)
  }
  return [...new Set(out)]
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const ambitRaw = String(searchParams.get('ambit') || '')
  const topicSlug = String(searchParams.get('topicSlug') || '').trim()

  const ambit = String(ambitRaw || '').trim()
  if (!isValidDocumentacioAmbitSlug(ambit) || !topicSlug || !isValidDocumentacioTopicSlug(topicSlug)) {
    return NextResponse.json({ error: 'Paràmetres invàlids' }, { status: 400 })
  }

  const snap = await db
    .collection(COLLECTION)
    .where('ambit', '==', ambit)
    .select(
      'ambit',
      'ambitTitle',
      'topicSlug',
      'topicTitle',
      'label',
      'kind',
      'href',
      'status',
      'reviewAt',
      'updatedAt',
      'departments',
      'roles'
    )
    .get()

  const role = auth.role
  const department = auth.user.department || ''

  const items: DocumentacioItemListDTO[] = []
  snap.docs.forEach((doc) => {
    const row = doc.data() as Omit<DocumentacioItemRecord, 'id'>
    if (row.topicSlug !== topicSlug) return
    const item: DocumentacioItemRecord = { id: doc.id, ...row }
    if (
      documentacioItemVisibleToViewer({
        item,
        viewerRole: role,
        viewerDepartment: department,
      })
    ) {
      const topicTitle =
        row.topicTitle != null && String(row.topicTitle).trim() ? String(row.topicTitle).trim() : undefined
      const ambitTitle =
        row.ambitTitle != null && String(row.ambitTitle).trim() ? String(row.ambitTitle).trim() : undefined
      items.push({
        id: item.id,
        ambit: item.ambit,
        ...(ambitTitle ? { ambitTitle } : {}),
        topicSlug: item.topicSlug,
        ...(topicTitle ? { topicTitle } : {}),
        label: item.label,
        kind: item.kind,
        href: item.href,
        status: item.status,
        reviewAt: item.reviewAt,
        updatedAt: item.updatedAt,
      })
    }
  })

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  if (!requireDocumentacioPublisher(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const form = await req.formData()
    const ambitRaw = String(form.get('ambit') || '').trim()
    const ambitTitleIn = String(form.get('ambitTitle') || '').trim()
    const topicSlug = String(form.get('topicSlug') || '').trim()
    const topicTitleIn = String(form.get('topicTitle') || '').trim()
    const label = String(form.get('label') || '').trim()
    const kind = String(form.get('kind') || 'file') === 'link' ? 'link' : 'file'
    const hrefIn = String(form.get('href') || '').trim()
    const status =
      String(form.get('status') || 'published') === 'draft' ? 'draft' : 'published'
    const reviewAtRaw = String(form.get('reviewAt') || '').trim()
    const reviewAt = reviewAtRaw || null

    const departments = parseJsonArray(String(form.get('departments') || '[]'))
    const roles = parseRoles(String(form.get('roles') || '[]'))

    if (!isValidDocumentacioAmbitSlug(ambitRaw)) {
      return NextResponse.json(
        { error: 'Identificador d’àmbit no vàlid (només minúscules i guions).' },
        { status: 400 }
      )
    }
    const ambit = ambitRaw
    const knownStaticAmbit = isStaticDocumentacioAmbit(ambit)
    let ambitTitleStored: string | null = null
    if (!knownStaticAmbit) {
      if (ambitTitleIn) {
        ambitTitleStored = ambitTitleIn
      } else {
        const prevAmbit = await db
          .collection(COLLECTION)
          .where('ambit', '==', ambit)
          .limit(1)
          .select('ambitTitle')
          .get()
        const inherited = String(prevAmbit.docs[0]?.data()?.ambitTitle ?? '').trim()
        if (!inherited) {
          return NextResponse.json(
            { error: 'Per a un àmbit nou, cal el títol de l’àmbit (nom visible).' },
            { status: 400 }
          )
        }
        ambitTitleStored = inherited
      }
    }
    if (!isValidDocumentacioTopicSlug(topicSlug)) {
      return NextResponse.json(
        { error: 'Identificador de tema no vàlid (només minúscules i guions).' },
        { status: 400 }
      )
    }
    const knownTopic = findTopicInAmbit(ambit, topicSlug)
    let topicTitleStored: string | null = null
    if (!knownTopic) {
      if (topicTitleIn) {
        topicTitleStored = topicTitleIn
      } else {
        const prevTopic = await db
          .collection(COLLECTION)
          .where('ambit', '==', ambit)
          .where('topicSlug', '==', topicSlug)
          .limit(1)
          .select('topicTitle')
          .get()
        const inherited = String(prevTopic.docs[0]?.data()?.topicTitle ?? '').trim()
        if (!inherited) {
          return NextResponse.json(
            { error: 'Per a un tema nou, cal el títol del tema (nom visible).' },
            { status: 400 }
          )
        }
        topicTitleStored = inherited
      }
    }
    if (!label) {
      return NextResponse.json({ error: 'Cal un títol visible' }, { status: 400 })
    }

    let href = ''
    let storagePath: string | null = null

    if (kind === 'link') {
      if (!hrefIn || !/^https?:\/\//i.test(hrefIn)) {
        return NextResponse.json({ error: 'URL no vàlida' }, { status: 400 })
      }
      href = hrefIn
    } else {
      const file = form.get('file')
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: 'Cal un fitxer' }, { status: 400 })
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Fitxer massa gran (màx. 20 MB)' }, { status: 400 })
      }
      const ct = file.type || 'application/octet-stream'
      if (!ALLOWED_TYPES.has(ct)) {
        return NextResponse.json({ error: 'Tipus de fitxer no permès' }, { status: 400 })
      }

      const bytes = Buffer.from(await file.arrayBuffer())
      const safeName = (file.name || 'document').replace(/\s+/g, '_')
      const path = `documentacio/${ambit}/${topicSlug}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`

      const bucket = storageAdmin.bucket()
      const fileRef = bucket.file(path)
      await fileRef.save(bytes, {
        contentType: ct,
        resumable: false,
      })

      const [signed] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
      })

      href = signed
      storagePath = path
    }

    const now = Date.now()
    const createdBy = auth.user.id
    const createdByName = String(auth.user.name || auth.user.email || 'Admin')

    const payload: Omit<DocumentacioItemRecord, 'id'> = {
      ambit,
      ...(ambitTitleStored ? { ambitTitle: ambitTitleStored } : {}),
      topicSlug,
      ...(topicTitleStored ? { topicTitle: topicTitleStored } : {}),
      label,
      kind,
      href,
      storagePath,
      departments,
      roles: roles as string[],
      status,
      reviewAt,
      createdBy,
      createdByName,
      createdAt: now,
      updatedAt: now,
    }

    const ref = await db.collection(COLLECTION).add(payload)

    revalidateTag(DOCUMENTACIO_ITEMS_SEARCH_TAG)

    return NextResponse.json({
      item: { id: ref.id, ...payload } satisfies DocumentacioItemRecord,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconegut'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
