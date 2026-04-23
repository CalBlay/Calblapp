// ✅ file: src/app/api/calendar/manual/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'


export const runtime = 'nodejs'

/**
 * 🟢 POST — Desa o actualitza un fitxer adjunt (file1, file2, ...)
 * Cridat des de l'AttachFileButton
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = await params

  try {
    const body = await req.json()
    const { collection = 'stage_verd', field = 'file1', url } = body as {
      collection?: string
      field?: string
      url?: string
    }

    if (!collection || !id || !url) {
      return NextResponse.json(
        { error: 'Falten camps obligatoris (collection, id, url)' },
        { status: 400 }
      )
    }

    await db
      .collection(collection)
      .doc(id)
      .set({ [field]: url, updatedAt: new Date().toISOString() }, { merge: true })

    console.log(`✅ Fitxer ${field} desat correctament a ${collection}/${id}`)
    return NextResponse.json({ ok: true, field, url })
  } catch (err) {
    console.error('❌ Error POST fitxer manual:', err)
    return NextResponse.json({ error: 'Error desant fitxer' }, { status: 500 })
  }
}

/**
 * ✏️ PUT — Actualitza camps generals de l’esdeveniment
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = await params

  try {
    const body = await req.json()
    const { collection, ...data } = body as Record<string, unknown>

    if (!collection || typeof collection !== 'string') {
      console.error('❌ Falta la col·lecció o és invàlida:', collection)
      return NextResponse.json({ error: 'Falta la col·lecció' }, { status: 400 })
    }

    const docRef = db.collection(collection).doc(id)
    const now = new Date().toISOString()
    let codeMeta: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(data, 'code')) {
      const snap = await docRef.get()
      const prevCode = String(snap.get('code') || '').trim()
      const nextCode = String(data.code || '').trim()
      if (prevCode !== nextCode) {
        codeMeta = {
          codeSource: 'manual',
          codeConfirmed: Boolean(nextCode),
        }
      }
    }

    await docRef.set({ ...data, ...codeMeta, updatedAt: now }, { merge: true })

    console.log(`✅ Esdeveniment ${id} actualitzat correctament a ${collection}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('❌ Error actualitzant esdeveniment:', err)
    return NextResponse.json({ error: 'Error actualitzant esdeveniment' }, { status: 500 })
  }
}

/**
 * 🗑️ DELETE — Elimina l’esdeveniment complet
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const collection = url.searchParams.get('collection')

    if (!collection || !collection.startsWith('stage_')) {
      console.error('❌ Col·lecció invàlida o buida:', collection)
      return NextResponse.json({ error: 'Col·lecció invàlida' }, { status: 400 })
    }

    await db.collection(collection).doc(id).delete()

    console.log(`🗑️ Esdeveniment ${id} eliminat de ${collection}`)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error eliminant esdeveniment'
    console.error('Error DELETE:', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

