export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { canAccessProjects } from '@/lib/projectAccess'
import { deriveProjectPhase } from '@/app/menu/projects/components/project-shared'
import Ably from 'ably'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string | null
}

const clean = (value: FormDataEntryValue | null) => String(value || '').trim()
const todayKey = () => new Date().toISOString().slice(0, 10)
const parseJsonField = <T,>(value: FormDataEntryValue | null, fallback: T): T => {
  if (value === null) return fallback
  try {
    return JSON.parse(String(value)) as T
  } catch {
    return fallback
  }
}
const normLower = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = session.user as SessionUser
  if (!canAccessProjects(user)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

async function uploadDocument(file: File, projectId: string) {
  const bytes = Buffer.from(await file.arrayBuffer())
  const fileName = file.name || `document-${Date.now()}`
  const path = `projects/${projectId}/${Date.now()}-${fileName.replace(/\s+/g, '_')}`

  const bucket = storageAdmin.bucket()
  const fileRef = bucket.file(path)
  await fileRef.save(bytes, {
    contentType: file.type || 'application/octet-stream',
    resumable: false,
  })

  const [url] = await fileRef.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
  })

  return {
    name: file.name || '',
    path,
    url,
    size: file.size,
    type: file.type || 'application/octet-stream',
  }
}

const buildStoredDocument = async (params: {
  file: File
  projectId: string
  category?: string
  label?: string
}) => {
  const uploaded = await uploadDocument(params.file, params.projectId)
  return {
    id: `doc-${Date.now()}`,
    category: params.category || 'general',
    label: params.label || uploaded.name || 'Document',
    ...uploaded,
  }
}

async function findUserByName(rawName: string) {
  const name = rawName.trim()
  if (!name) return null

  let snap = await db.collection('users').where('name', '==', name).limit(1).get()
  if (snap.empty) {
    snap = await db.collection('users').where('nameFold', '==', normLower(name)).limit(1).get()
  }

  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) }
}

async function notifyProjectOwner(params: {
  userId: string
  projectId: string
  projectName: string
  baseUrl: string
}) {
  const { userId, projectId, projectName, baseUrl } = params
  const title = "T'han assignat un projecte"
  const body = `Ara ets responsable del projecte: ${projectName || 'Projecte'}`
  const now = Date.now()

  await db.collection('users').doc(userId).collection('notifications').add({
    title,
    body,
    createdAt: now,
    read: false,
    type: 'project_assignment',
    projectId,
  })

  const apiKey = process.env.ABLY_API_KEY
  if (apiKey) {
    try {
      const rest = new Ably.Rest({ key: apiKey })
      await rest.channels.get(`user:${userId}:notifications`).publish('created', {
        type: 'project_assignment',
        projectId,
        createdAt: now,
      })
    } catch (err) {
      console.error('[projects] Ably publish error', err)
    }
  }

  try {
    await fetch(`${baseUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title,
        body,
        url: `/menu/projects/${projectId}`,
      }),
    })
  } catch (err) {
    console.error('[projects] push error', err)
  }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const snap = await db.collection('projects').orderBy('updatedAt', 'desc').get()
    const projects = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))

    return NextResponse.json({ projects })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const form = await req.formData()
    const baseUrl = new URL(req.url).origin
    const now = Date.now()
    const docRef = db.collection('projects').doc()
    const file = form.get('file')
    const document =
      file instanceof File && file.size > 0
        ? await buildStoredDocument({
            file,
            projectId: docRef.id,
            category: 'initial',
            label: clean(form.get('fileLabel')) || 'Document inicial',
          })
        : null
    const owner = clean(form.get('owner'))
    const ownerUser = await findUserByName(owner)
    const departments = parseJsonField<string[]>(form.get('departments'), [])
    const blocks = parseJsonField<Record<string, unknown>[]>(form.get('blocks'), [])
    const sprints = parseJsonField<Record<string, unknown>[]>(form.get('sprints'), [])
    const rooms = parseJsonField<Record<string, unknown>[]>(form.get('rooms'), [])
    const kickoff = parseJsonField<Record<string, unknown> | null>(form.get('kickoff'), null)
    const documents = parseJsonField<Record<string, unknown>[]>(form.get('documents'), [])

    const payload = {
      name: clean(form.get('name')),
      sponsor: clean(form.get('sponsor')),
      owner,
      ownerUserId: ownerUser?.id || '',
      context: clean(form.get('context')),
      strategy: clean(form.get('strategy')),
      risks: clean(form.get('risks')),
      startDate: clean(form.get('startDate')) || todayKey(),
      launchDate: clean(form.get('launchDate')),
      budget: clean(form.get('budget')),
      status: '',
      phase: clean(form.get('phase')) || 'definition',
      departments,
      blocks,
      sprints,
      rooms,
      kickoff,
      document,
      documents: document ? [...documents, document] : documents,
      createdAt: now,
      updatedAt: now,
      createdById: auth.user.id,
      createdByName: auth.user.name || '',
      updatedById: auth.user.id,
      updatedByName: auth.user.name || '',
    }

    payload.phase = deriveProjectPhase({
      launchDate: payload.launchDate,
      kickoff: payload.kickoff as Parameters<typeof deriveProjectPhase>[0]['kickoff'],
      blocks: payload.blocks as Parameters<typeof deriveProjectPhase>[0]['blocks'],
    })

    await docRef.set(payload)

    if (ownerUser?.id && payload.status !== 'draft') {
      await notifyProjectOwner({
        userId: ownerUser.id,
        projectId: docRef.id,
        projectName: payload.name,
        baseUrl,
      })
    }

    return NextResponse.json({ id: docRef.id, document }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
