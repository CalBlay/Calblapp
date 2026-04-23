import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import { registerFinquesProduccioImagesInIndex } from '@/lib/media/storageMediaIndex'

export const runtime = 'nodejs'

const normalizeDept = (raw?: string) => {
  const base = (raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const compact = base.replace(/\s+/g, '')
  if (compact === 'foodlover' || compact === 'foodlovers') return 'foodlovers'
  return base
}

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
    const session = await getServerSession(authOptions)
    const role = normalizeRole(session?.user?.role)
    const dept = normalizeDept(
      (session?.user as {
        departmentLower?: string
        deptLower?: string
        department?: string
      })?.departmentLower ||
        (session?.user as { deptLower?: string })?.deptLower ||
        (session?.user as { department?: string })?.department
    )
    const canEdit =
      role === 'admin' ||
      role === 'direccio' ||
      role === 'comercial' ||
      dept === 'produccio' ||
      (role === 'cap' &&
        (dept === 'empresa' || dept === 'casaments' || dept === 'foodlovers'))

    // Permisos d'edició d'espais
    if (!canEdit) {
      return NextResponse.json(
        { error: 'No tens permisos per editar espais.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { id, produccio = {}, comercial = {}, ...rest } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Falta ID de la finca.' },
        { status: 400 }
      )
    }

    const ref = db.collection('finques').doc(id)

    // Helper netejar arrays
    const cleanArray = (arr: any) =>
      Array.isArray(arr)
        ? arr.map(x => String(x).trim()).filter(Boolean)
        : []

    // Formatem producció
    const produccioFormatted: Record<string, any> = {}

    for (const key of Object.keys(produccio)) {
      const value = produccio[key]

      if (Array.isArray(value)) {
        produccioFormatted[key] = cleanArray(value)
      } else if (typeof value === "string") {
        produccioFormatted[key] = value.trim()
      } else {
        produccioFormatted[key] = value
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
