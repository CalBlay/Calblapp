// ✅ file: src/app/api/events/route.ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestore as db } from '@/services/db'
import { normalizeRole } from '@/lib/roles'

interface SessionUser {
  id?: string
  role?: string
  department?: string
  name?: string
  email?: string
}

/**
 * Representa un event construït a partir de Firestore (stage_verd)
 */
type BuiltEvent = {
  id: string
  summary: string
  start: string
  end: string
  location: string
  locationShort: string
  mapsUrl: string
  pax: number
  state: 'confirmed'
  name: string
  eventCode: string
  commercial: string
  servei?: string
  horaInici?: string
  isResponsible: boolean
}

// 🔹 Funcions auxiliars
function computeShortLocation(s?: string): string {
  const src = (s || '').trim()
  if (!src) return ''
  const i = src.search(/[,\|\.]/)
  const head = i === -1 ? src : src.slice(0, i)
  return head.trim()
}

function toMapsUrl(s?: string): string {
  const q = (s || '').trim()
  if (!q) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

const norm = (s?: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ events: [], responsables: {} }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role)
  const userName = (user.name || user.email || '').toString().trim()

  const { searchParams } = new URL(request.url)
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  if (!fromStr || !toStr) {
    return NextResponse.json({ events: [], responsables: {} })
  }

  // 🔹 1. Llegim col·lecció Firestore stage_verd
  const colRef = db.collection('stage_verd')
  const snap = await colRef.get()

  const fromDate = new Date(fromStr)
  const toDate = new Date(toStr)

  // 🔹 2. Construïm els esdeveniments
  const built: BuiltEvent[] = []
  snap.forEach((doc) => {
    const d = doc.data() as Record<string, unknown>
    const dataIniciRaw = String(d.DataInici || '')
    const dataInici = dataIniciRaw ? new Date(dataIniciRaw) : null
    if (!dataInici) return

    // Filtre per rang de dates
    if (dataInici < fromDate || dataInici > toDate) return

    const start = String(d.DataInici || '')
    const end = String(d.DataFi || start)
    const location = String(d.Ubicacio || '')
    const pax = Number(d.NumPax) || 0
    const eventCode = String(d.code || d.C_digo || '')
    const commercial = String(d.Comercial || '')
    const servei = String(d.Servei || d.Servicio || '')
    const summary = String(d.NomEvent || '')
    const name = String(d.NomEvent || '')
    const rawHora =
      typeof d?.HoraInici === 'string'
        ? d.HoraInici
        : typeof d?.horaInici === 'string'
        ? d.horaInici
        : typeof d?.Hora === 'string'
        ? d.Hora
        : typeof d?.hora === 'string'
        ? d.hora
        : ''
    const horaInici =
      typeof rawHora === 'string' ? rawHora.trim().slice(0, 5) : ''

    built.push({
      id: doc.id,
      summary,
      start,
      end,
      location,
      locationShort: computeShortLocation(location),
      mapsUrl: toMapsUrl(location),
      pax,
      state: 'confirmed',
      name,
      eventCode,
      commercial,
      servei,
      horaInici,
      isResponsible: false,
    })
  })

  // 🔹 3. Filtre per Treballador (si cal)
  let events = built
  if (role === 'treballador') {
    const needle = norm(userName)
    events = built.filter(e => needle && norm(e.summary).includes(needle))
  }

  // 🔹 4. Responsables (de moment buit per compatibilitat)
  const responsables = {} as Record<string, string[]>

  // 🔹 5. Retornem
  return NextResponse.json({ events, responsables })
}
