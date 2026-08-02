// src/app/api/events/[id]/documents/route.ts
import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { storageAdmin } from '@/lib/firebaseAdmin'
import { getGraphToken, getSharePointItemMeta, getSiteAndDrive } from '@/services/sharepoint/graph'
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
import {
  eventDocumentsCacheKey,
  getCachedEventDocuments,
  setCachedEventDocuments,
} from '@/lib/events/eventDocumentsCache.server'

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

type SharePointContext = {
  driveId: string
  accessToken: string
}

function buildBaseDoc(
  key: string,
  path: string,
  data: Record<string, unknown>
): EventDoc {
  const storedName =
    typeof data[`${key}Name`] === 'string' ? String(data[`${key}Name`]).trim() : ''
  const filename = storedName || filenameFromPath(path, key)
  const storedMimeType =
    typeof data[`${key}MimeType`] === 'string'
      ? String(data[`${key}MimeType`]).trim()
      : ''
  const storedAt = data[`${key}At`]
  const isVisitVideo = /^visitVideo\d+$/i.test(key)

  return {
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
}

function needsSharePointMeta(doc: EventDoc, key: string, data: Record<string, unknown>) {
  const storedName =
    typeof data[`${key}Name`] === 'string' ? String(data[`${key}Name`]).trim() : ''
  const storedMimeType =
    typeof data[`${key}MimeType`] === 'string'
      ? String(data[`${key}MimeType`]).trim()
      : ''
  if (storedName && storedMimeType) return false
  if (storedName && doc.icon !== 'link') return false
  return true
}

async function resolveDocumentEntry(
  key: string,
  rawPath: string,
  data: Record<string, unknown>,
  sharePointCtx: SharePointContext | null
): Promise<EventDoc | null> {
  const path = String(rawPath)
  const doc = buildBaseDoc(key, path, data)

  if (isGooglePhotosVideoRef(path)) {
    return {
      ...doc,
      source: 'firestore-link',
      url: googlePhotosVideoViewUrl(path) || path,
      mimeType: doc.mimeType || GOOGLE_PHOTOS_VIDEO_MIME,
      icon: 'video',
    }
  }

  if (isGoogleDriveVideoRef(path)) {
    return {
      ...doc,
      source: 'firestore-link',
      url: googleDriveVideoViewUrl(path) || path,
      mimeType: doc.mimeType || GOOGLE_DRIVE_VIDEO_MIME,
      icon: 'video',
    }
  }

  if (path.startsWith('/api/sharepoint/file')) {
    const itemId = parseItemId(path)
    if (itemId && sharePointCtx && needsSharePointMeta(doc, key, data)) {
      try {
        const meta = await getSharePointItemMeta(
          itemId,
          sharePointCtx.driveId,
          sharePointCtx.accessToken
        )
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
    return doc
  }

  if (looksLikeUrl(path)) {
    return doc
  }

  try {
    await storageAdmin.bucket().file(path).getMetadata()
    return {
      ...doc,
      source: 'firestore-file',
      url: storageProxyUrl(path),
    }
  } catch {
    return null
  }
}

async function listEventDocuments(
  eventId: string,
  eventCode: string | null,
  prefixes: string[]
): Promise<EventDoc[]> {
  let snap = await db.collection('stage_verd').doc(eventId).get()

  if (!snap.exists && eventCode) {
    const alt = await db
      .collection('stage_verd')
      .where('code', '==', eventCode)
      .limit(1)
      .get()
    if (!alt.empty) snap = alt.docs[0]
  }

  if (!snap.exists) return []

  const data = snap.data() || {}

  const files = Object.entries(data).filter(([k, v]) => {
    const okPrefix = prefixes.some((p) => new RegExp(`^${p}\\d+$`, 'i').test(k))
    return okPrefix && typeof v === 'string' && v.length > 0
  }) as Array<[string, string]>

  const hasSharePointLookup = files.some(([key, path]) => {
    if (!String(path).startsWith('/api/sharepoint/file')) return false
    const doc = buildBaseDoc(key, String(path), data)
    return needsSharePointMeta(doc, key, data)
  })

  let sharePointCtx: SharePointContext | null = null
  if (hasSharePointLookup) {
    const [{ driveId }, { access_token }] = await Promise.all([
      getSiteAndDrive(),
      getGraphToken(),
    ])
    sharePointCtx = { driveId, accessToken: access_token }
  }

  const resolved = await Promise.all(
    files.map(([key, path]) => resolveDocumentEntry(key, path, data, sharePointCtx))
  )

  const docs = resolved.filter((doc): doc is EventDoc => doc !== null)

  docs.sort((a, b) => {
    const time = (value: string | number | null | undefined) => {
      if (value == null || value === '') return 0
      const parsed = new Date(value).getTime()
      return Number.isFinite(parsed) ? parsed : 0
    }
    return time(b.updatedAt) - time(a.updatedAt)
  })

  return docs
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

    const [canViewDocs, canAttachVisitVideo] = await Promise.all([
      isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/events', 'docs:view'),
      }),
      isUiPermissionGranted({
        user: accessUser,
        permission: EVENT_VISIT_VIDEO_PERM,
      }),
    ])

    if (canViewDocs !== true && !(wantsVisitVideoOnly && canAttachVisitVideo)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (prefixes.some((p) => p.toLowerCase() === 'visitvideo')) {
      if (!canAttachVisitVideo && canViewDocs !== true) {
        const filtered = prefixes.filter((p) => p.toLowerCase() !== 'visitvideo')
        if (filtered.length === 0) return NextResponse.json({ docs: [] })
        prefixes.splice(0, prefixes.length, ...filtered)
      }
    }

    if (prefixes.some((p) => p.toLowerCase() === 'cuinafile')) {
      const canKitchen = await isAllowedByClientOverride({
        userId: auth.user.id,
        role: auth.user.role,
        permission: PERM.action('/menu/events', 'docs:attach:kitchen'),
      })
      if (canKitchen !== true) {
        const filtered = prefixes.filter((p) => p.toLowerCase() !== 'cuinafile')
        if (filtered.length === 0) return NextResponse.json({ docs: [] })
        prefixes.splice(0, prefixes.length, ...filtered)
      }
    }

    const cacheKey = eventDocumentsCacheKey(id, eventCode, prefixParam)
    const cached = getCachedEventDocuments(cacheKey)
    if (cached) {
      return NextResponse.json(
        { docs: cached },
        { headers: { 'Cache-Control': 'private, max-age=30' } }
      )
    }

    const docs = await listEventDocuments(id, eventCode, prefixes)
    setCachedEventDocuments(cacheKey, docs)

    return NextResponse.json(
      { docs },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    )
  } catch (err) {
    console.error('⚠️ documents error', err)
    return NextResponse.json({ docs: [] }, { status: 500 })
  }
}
