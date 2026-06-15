// src/app/api/events/[id]/documents/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { getGraphToken, getSiteAndDrive } from '@/services/sharepoint/graph'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { isAllowedByClientOverride, isUiPermissionGranted } from '@/lib/server/permissions'
import {
  EVENT_VISIT_VIDEO_PERM,
  visitVideoAccessUserFromSession,
} from '@/lib/eventVisitVideoPermissions'
import {
  GOOGLE_PHOTOS_VIDEO_MIME,
  googlePhotosVideoViewUrl,
  isGooglePhotosVideoRef,
} from '@/lib/googlePhotosVideoLink'
import {
  GOOGLE_DRIVE_VIDEO_MIME,
  googleDriveVideoViewUrl,
  isGoogleDriveVideoRef,
} from '@/lib/googleDriveVideoLink'

export type EventDoc = {
  id: string
  title: string
  source: 'firestore-file' | 'firestore-link'
  url: string
  icon: 'pdf' | 'img' | 'doc' | 'sheet' | 'slide' | 'video' | 'link'
  mimeType?: string
  kind?: string
  updatedAt?: string | number | null
  createdBy?: string | null
}

function detectIcon(name: string): EventDoc['icon'] {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(n)) return 'img'
  if (/\.(mp4|mov|webm|avi|m4v)$/.test(n)) return 'video'
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
  if (m.startsWith('video/')) return 'video'
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

function storageProxyUrl(path: string): string {
  return `/api/storage/file?path=${encodeURIComponent(path)}`
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const { id } = await ctx.params
    const url = new URL(req.url)
    const eventCode = url.searchParams.get('eventCode')
    const prefixParam = url.searchParams.get('prefix') || 'file,zohoFile'
    const prefixes =
      prefixParam === 'all'
        ? ['file', 'cuinaFile', 'zohoFile', 'visitVideo']
        : prefixParam.split(',').map((p) => p.trim()).filter(Boolean)

    const wantsVisitVideoOnly =
      prefixes.length > 0 && prefixes.every((p) => p.toLowerCase() === 'visitvideo')

    const accessUser = visitVideoAccessUserFromSession(auth.user)

    const canViewDocs = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action('/menu/events', 'docs:view'),
    })

    const canAttachVisitVideo = await isUiPermissionGranted({
      user: accessUser,
      permission: EVENT_VISIT_VIDEO_PERM,
    })

    if (canViewDocs !== true && !(wantsVisitVideoOnly && canAttachVisitVideo)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const wantsVisitVideo = prefixes.some((p) => p.toLowerCase() === 'visitvideo')
    if (wantsVisitVideo && !canAttachVisitVideo && canViewDocs !== true) {
      const filtered = prefixes.filter((p) => p.toLowerCase() !== 'visitvideo')
      if (filtered.length === 0) return NextResponse.json({ docs: [] })
      ;(prefixes as string[]).splice(0, prefixes.length, ...filtered)
    }

    const wantsKitchen = prefixes.some((p) => p.toLowerCase() === 'cuinafile')
    if (wantsKitchen) {
      const canKitchen = await isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/events', 'docs:attach:kitchen'),
      })
      if (canKitchen !== true) {
        // if user can't access kitchen docs, silently drop that prefix
        // (still allows general docs via docs:view)
        const filtered = prefixes.filter((p) => p.toLowerCase() !== 'cuinafile')
        // if the request was ONLY for kitchen docs, return empty list
        if (filtered.length === 0) return NextResponse.json({ docs: [] })
        ;(prefixes as string[]).splice(0, prefixes.length, ...filtered)
      }
    }

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
      const okPrefix = prefixes.some((p) => new RegExp(`^${p}\\d+$`, 'i').test(k))
      return okPrefix && typeof v === 'string' && v.length > 0
    })

    const docs: EventDoc[] = []

    for (const [key, rawPath] of files) {
      const path = String(rawPath)
      const filename =
        typeof data[`${key}Name`] === 'string' && String(data[`${key}Name`]).trim()
          ? String(data[`${key}Name`]).trim()
          : filenameFromPath(path, key)
      const storedMimeType =
        typeof data[`${key}MimeType`] === 'string'
          ? String(data[`${key}MimeType`]).trim()
          : ''
      const storedAt = data[`${key}At`]
      const isVisitVideo = /^visitVideo\d+$/i.test(key)

      const doc: EventDoc = {
        id: key,
        title: filename,
        source: 'firestore-link',
        url: path,
        icon: detectIconFromMime(storedMimeType) || detectIcon(filename),
        mimeType: storedMimeType || undefined,
        kind: isVisitVideo ? 'Vídeo visita comercial' : undefined,
        updatedAt:
          typeof storedAt === 'string' || typeof storedAt === 'number' ? storedAt : null,
        createdBy:
          isVisitVideo && typeof data[`${key}By`] === 'string'
            ? String(data[`${key}By`]).trim() || null
            : undefined,
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

      // Google Fotos (vídeo de visita comercial)
      if (isGooglePhotosVideoRef(path)) {
        docs.push({
          ...doc,
          source: 'firestore-link',
          url: googlePhotosVideoViewUrl(path) || path,
          mimeType: storedMimeType || GOOGLE_PHOTOS_VIDEO_MIME,
          icon: 'video',
        })
        continue
      }

      // Google Drive (legacy)
      if (isGoogleDriveVideoRef(path)) {
        docs.push({
          ...doc,
          source: 'firestore-link',
          url: googleDriveVideoViewUrl(path) || path,
          mimeType: storedMimeType || GOOGLE_DRIVE_VIDEO_MIME,
          icon: 'video',
        })
        continue
      }

      // URL absoluta/relativa (SharePoint, etc.)
      if (looksLikeUrl(path)) {
        docs.push(doc)
        continue
      }

      try {
        await storageAdmin.bucket().file(path).getMetadata()
        docs.push({
          ...doc,
          source: 'firestore-file',
          url: storageProxyUrl(path),
        })
      } catch {
        // si un fitxer no existeix o no és una ruta de Storage, el saltem
      }
    }

    docs.sort((a, b) => {
      const time = (value: string | number | null | undefined) => {
        if (value == null || value === '') return 0
        const parsed = new Date(value).getTime()
        return Number.isFinite(parsed) ? parsed : 0
      }
      return time(b.updatedAt) - time(a.updatedAt)
    })

    return NextResponse.json({ docs })
  } catch (err) {
    console.error('⚠️ documents error', err)
    return NextResponse.json({ docs: [] }, { status: 500 })
  }
}
