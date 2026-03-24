// src/app/api/events/[id]/documents/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getDownloadURL } from 'firebase-admin/storage'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { getGraphToken, getSiteAndDrive } from '@/services/sharepoint/graph'

export type EventDoc = {
  id: string
  title: string
  source: 'firestore-file' | 'firestore-link'
  url: string
  icon: 'pdf' | 'img' | 'doc' | 'sheet' | 'slide' | 'link'
  mimeType?: string
}

function detectIcon(name: string): EventDoc['icon'] {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(n)) return 'img'
  if (n.endsWith('.doc') || n.endsWith('.docx')) return 'doc'
  if (n.endsWith('.xls') || n.endsWith('.xlsx')) return 'sheet'
  if (n.endsWith('.ppt') || n.endsWith('.pptx')) return 'slide'
  return 'link'
}

function detectIconFromMime(mime?: string): EventDoc['icon'] | null {
  if (!mime) return null
  const m = mime.toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.startsWith('image/')) return 'img'
  if (m.includes('sheet') || m.includes('excel')) return 'sheet'
  if (m.includes('presentation')) return 'slide'
  if (m.includes('word')) return 'doc'
  return null
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith('/')
}

function filenameFromPath(path: string, fallback: string) {
  try {
    const cleaned = (path.split('?')[0] || '').split('/').filter(Boolean)
    const last = cleaned[cleaned.length - 1]
    return decodeURIComponent(last || fallback)
  } catch {
    return fallback
  }
}

async function getSharePointMeta(itemId: string) {
  const { driveId } = await getSiteAndDrive()
  const { access_token } = await getGraphToken()

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}`,
    {
      headers: { Authorization: `Bearer ${access_token}` },
      cache: 'no-store',
    }
  )

  if (!res.ok) throw new Error(`SharePoint meta error ${res.status}`)

  const json = (await res.json()) as {
    name?: string
    file?: { mimeType?: string }
  }
  return {
    name: json.name,
    mimeType: json.file?.mimeType,
  }
}

function parseItemId(path: string): string | null {
  try {
    const url = path.startsWith('http') ? new URL(path) : new URL(path, 'http://local')
    return url.searchParams.get('itemId')
  } catch {
    return null
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params
    const url = new URL(req.url)
    const eventCode = url.searchParams.get('eventCode')
    const prefixParam = url.searchParams.get('prefix') || 'file'
    const prefixes =
      prefixParam === 'all'
        ? ['file', 'cuinaFile']
        : prefixParam.split(',').map((p) => p.trim()).filter(Boolean)

    let snap = await db.collection('stage_verd').doc(id).get()

    if (!snap.exists && eventCode) {
      const alt = await db
        .collection('stage_verd')
        .where('code', '==', eventCode)
        .limit(1)
        .get()
      if (!alt.empty) snap = alt.docs[0]
    }

    if (!snap.exists) {
      return NextResponse.json({ docs: [] })
    }

    const data = snap.data() || {}

    const files = Object.entries(data).filter(([k, v]) => {
      const okPrefix = prefixes.some((p) => k.startsWith(p))
      return okPrefix && typeof v === 'string' && v.length > 0
    })

    const bucket = storageAdmin.bucket()
    const docs: EventDoc[] = []

    for (const [key, rawPath] of files) {
      const path = String(rawPath)
      const filename = filenameFromPath(path, key)

      const doc: EventDoc = {
        id: key,
        title: filename,
        source: 'firestore-link',
        url: path,
        icon: detectIcon(filename),
      }

      // SharePoint proxy -> recuperem nom real + mime
      if (path.startsWith('/api/sharepoint/file')) {
        const itemId = parseItemId(path)
        if (itemId) {
          try {
            const meta = await getSharePointMeta(itemId)
            if (meta?.name) {
              doc.title = meta.name
              doc.icon = detectIcon(meta.name)
            }
            if (meta?.mimeType) {
              doc.mimeType = meta.mimeType
              const iconFromMime = detectIconFromMime(meta.mimeType)
              if (iconFromMime) doc.icon = iconFromMime
            }
          } catch (err) {
            console.warn('[events/documents] SharePoint meta error', err)
          }
        }
      }

      // URL absoluta/relativa (SharePoint, etc.)
      if (looksLikeUrl(path)) {
        docs.push(doc)
        continue
      }

      try {
        const file = bucket.file(path)
        const publicUrl = await getDownloadURL(file)

        docs.push({
          ...doc,
          source: 'firestore-file',
          url: publicUrl,
        })
      } catch {
        // si un fitxer no existeix o no és una ruta de Storage, el saltem
      }
    }

    return NextResponse.json({ docs })
  } catch (err) {
    console.error('⚠️ documents error', err)
    return NextResponse.json({ docs: [] }, { status: 500 })
  }
}
