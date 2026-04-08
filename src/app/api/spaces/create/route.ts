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

    if (!canEdit) {
      return NextResponse.json(
        { error: 'No tens permisos per crear espais.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { produccio = {}, comercial = {}, ...rest } = body

    const nom = String(rest.nom || '').trim()
    if (!nom) {
      return NextResponse.json(
        { error: 'El nom és obligatori per crear un espai.' },
        { status: 400 }
      )
    }

    const cleanArray = (arr: any) =>
      Array.isArray(arr)
        ? arr.map((x) => String(x).trim()).filter(Boolean)
        : []

    const produccioFormatted: Record<string, any> = {}

    for (const key of Object.keys(produccio)) {
      const value = produccio[key]

      if (Array.isArray(value)) {
        produccioFormatted[key] = cleanArray(value)
      } else if (typeof value === 'string') {
        produccioFormatted[key] = value.trim()
      } else {
        produccioFormatted[key] = value
      }
    }

    const codeValue = String(rest.code || '').trim()
    const tipusValue =
      rest.tipus || (codeValue.startsWith('CC') ? 'Propi' : 'Extern')

    const payload = {
      ...rest,
      nom,
      code: codeValue || undefined,
      tipus: tipusValue,
      comercial: {
        contacte: comercial.contacte || null,
        telefon: comercial.telefon || null,
        email: comercial.email || null,
        notes: comercial.notes || null,
        condicions: comercial.condicions || null,
      },
      produccio: produccioFormatted,
      origen: rest.origen || 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const docRef = db.collection('finques').doc()
    await docRef.set(payload)

    const imgList = Array.isArray(produccioFormatted.images)
      ? (produccioFormatted.images as string[]).map((x) => String(x).trim()).filter(Boolean)
      : []
    if (imgList.length) {
      void registerFinquesProduccioImagesInIndex(docRef.id, {
        nom,
        code: codeValue,
        images: imgList,
        createdAt: payload.createdAt as number,
      })
    }

    return NextResponse.json({ ok: true, id: docRef.id })
  } catch (err) {
    console.error('❌ Error creant espai:', err)
    return NextResponse.json(
      { error: 'Error intern al crear la finca.' },
      { status: 500 }
    )
  }
}
