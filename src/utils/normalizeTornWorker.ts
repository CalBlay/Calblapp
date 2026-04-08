// filename: src/utils/normalizeTornWorker.ts

export type NormalizedRole = 'responsable' | 'conductor' | 'treballador'

export interface NormalizedWorker {
  key: string
  id?: string
  name: string
  role: NormalizedRole
  startTime: string
  endTime: string
  meetingPoint: string
  department: string
  plate?: string
}

/** Fila de treballador des d’API / Firestore (formes històriques diverses). */
export type TornWorkerInput = {
  id?: unknown
  workerId?: unknown
  uid?: unknown
  email?: unknown
  name?: unknown
  nom?: unknown
  displayName?: unknown
  role?: unknown
  startTime?: unknown
  endTime?: unknown
  meetingPoint?: unknown
  department?: unknown
  plate?: unknown
  matricula?: unknown
  vehiclePlate?: unknown
  vehicle?: { plate?: unknown } | null
}

const norm = (s?: string | null): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)

function toHHMM(input?: string | number | Date | null): string {
  if (!input) return ''
  const str = String(input)

  if (/^\d{2}:\d{2}$/.test(str)) return str
  if (/^\d{4}$/.test(str)) return `${str.slice(0, 2)}:${str.slice(2)}`

  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  return ''
}

function normalizeRole(r?: string): NormalizedRole {
  const x = norm(r)
  if (x.startsWith('res')) return 'responsable'
  if (x.startsWith('con')) return 'conductor'
  return 'treballador'
}

export function normalizeTornWorker(w?: TornWorkerInput | null): NormalizedWorker {
  const id =
    w?.id ||
    w?.workerId ||
    w?.uid ||
    w?.email ||
    undefined

  const name =
    w?.name ||
    w?.nom ||
    w?.displayName ||
    ''

  const role = normalizeRole(w?.role != null && w.role !== '' ? String(w.role) : undefined)

  const startTime = toHHMM(w?.startTime as string | number | Date | null | undefined)
  const endTime = toHHMM(w?.endTime as string | number | Date | null | undefined)

  const meetingPoint = String(w?.meetingPoint ?? '').trim()
  const dept = norm(String(w?.department ?? ''))
  const plateRaw =
    w?.plate ??
    w?.matricula ??
    w?.vehiclePlate ??
    w?.vehicle?.plate ??
    ''
  const plate = String(plateRaw || '').trim()

  const key = id ? String(id) : norm(name)

  return {
    key,
    id: id ? String(id) : undefined,
    name: String(name),
    role,
    startTime,
    endTime,
    meetingPoint,
    department: dept || 'sense departament',
    plate: plate || undefined,
  }
}
