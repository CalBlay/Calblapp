import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { registerFinquesProduccioImagesInIndex } from '@/lib/media/storageMediaIndex'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireSpacesBbddMutation } from '@/lib/server/spacesApiAuth'

export const runtime = 'nodejs'

type ProduccioPayload = Record<
  string,
  string | string[] | number | boolean | null | undefined
>

const normalizeSpaceCode = (raw?: unknown) =>
  String(raw || '')
    .trim()
    .toUpperCase()

async function codeAlreadyExists(code: string, currentId?: string): Promise<boolean> {
  if (!code) return false
  const snap = await db.collection('finques').get()
  return snap.docs.some((doc) => {
    if (currentId && doc.id === currentId) return false
    const data = doc.data() as Record<string, unknown>
    const current =
      normalizeSpaceCode(data.code) ||
      normalizeSpaceCode(data.codi) ||
      normalizeSpaceCode(doc.id)
    return current === code
  })
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canUpdate = await requireSpacesBbddMutation(auth, 'update')
    if (!canUpdate) {
      return NextResponse.json(
        { error: 'No tens permisos per editar espais.' },
        { status: 403 }
      )
    }

    const body = (await req.json()) as {
      id?: string
      produccio?: Record<string, unknown>
      comercial?: Record<string, unknown>
      [key: string]: unknown
    }
    const { id, produccio = {}, comercial = {}, ...rest } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Falta ID de la finca.' },
        { status: 400 }
      )
    }

    const ref = db.collection('finques').doc(id)

    // Helper netejar arrays
    const cleanArray = (arr: unknown) =>
      Array.isArray(arr)
        ? arr.map((x) => String(x).trim()).filter(Boolean)
        : []

    // Formatem producció
    const produccioFormatted: ProduccioPayload = {}

    for (const key of Object.keys(produccio)) {
      const value = produccio[key]

      if (Array.isArray(value)) {
        produccioFormatted[key] = cleanArray(value)
      } else if (typeof value === 'string') {
        produccioFormatted[key] = value.trim()
      } else if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value == null
      ) {
        produccioFormatted[key] = value
      } else {
        produccioFormatted[key] = String(value)
      }
    }

    const codeValue = normalizeSpaceCode(rest.code)
    if (codeValue && (await codeAlreadyExists(codeValue, id))) {
      return NextResponse.json(
        { error: 'Aquest codi ja existeix.' },
        { status: 409 }
      )
    }

    const payload = {
      ...rest,            // nom, LN, ubicacio, tipus, origen, code...
      code: codeValue || undefined,
      comercial: {
        contacte: comercial.contacte || null,
        telefon: comercial.telefon || null,
        email: comercial.email || null,
        notes: comercial.notes || null,
        condicions: comercial.condicions || null,
      },
      produccio: produccioFormatted,
      updatedAt: Date.now(),
    }

    await ref.set(payload, { merge: true })

    if (Array.isArray(produccioFormatted.images)) {
      const imgList = (produccioFormatted.images as string[]).map((x) => String(x).trim()).filter(Boolean)
      if (imgList.length) {
        void registerFinquesProduccioImagesInIndex(id, {
          nom: String(rest.nom || '').trim(),
          code: String(rest.code || '').trim(),
          images: imgList,
          createdAt: payload.updatedAt as number,
        })
      }
    }

    return NextResponse.json({ ok: true, id })

  } catch (err) {
    console.error('❌ Error desant espai:', err)
    return NextResponse.json(
      { error: 'Error intern al desar la finca.' },
      { status: 500 }
    )
  }
}
