import type { IncidentMeetingAttendee } from '@/lib/incidentMeetingSession'

/** Assistents fixos de la reunió d’incidències (ordre de convocatòria). */
export const INCIDENT_MEETING_CORE_NAMES = [
  'Oriol',
  'David',
  'Gaston',
  'Jona',
  'Aroa',
  'Fred',
  'Sonia Albet',
] as const

/** Regles per desambiguar convocats amb nom similar (p. ex. dues «Sonia»). */
const CORE_HINT_RULES: Partial<
  Record<(typeof INCIDENT_MEETING_CORE_NAMES)[number], { excludeNameTokens?: string[]; emailContains?: string }>
> = {
  'Sonia Albet': { excludeNameTokens: ['planas'], emailContains: 'albet' },
}

export type AppUserRow = {
  id: string
  name: string
  email: string
  department?: string
}

export function foldPersonText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function isExcludedCoreUser(user: AppUserRow, hint: string) {
  const rules = CORE_HINT_RULES[hint as (typeof INCIDENT_MEETING_CORE_NAMES)[number]]
  if (!rules) return false
  const hay = foldPersonText([user.name, user.email].join(' '))
  if (rules.excludeNameTokens?.some((t) => hay.includes(foldPersonText(t)))) return true
  return false
}

function scoreNameMatch(user: AppUserRow, hint: string) {
  if (isExcludedCoreUser(user, hint)) return 0

  const u = foldPersonText(user.name)
  const h = foldPersonText(hint)
  if (!u || !h) return 0
  if (u === h) return 100

  const rules = CORE_HINT_RULES[hint as (typeof INCIDENT_MEETING_CORE_NAMES)[number]]
  let score = 0

  const hintTokens = h.split(/\s+/).filter(Boolean)
  if (hintTokens.length >= 2) {
    const allTokens = hintTokens.every((t) => u.includes(t))
    if (allTokens) score = 98
    else {
      const [firstHint, ...rest] = hintTokens
      const userFirst = u.split(/\s+/)[0] || ''
      if (userFirst === firstHint && rest.every((t) => u.includes(t))) score = 92
    }
  } else {
    const first = u.split(/\s+/)[0] || ''
    if (first === h) score = 85
    else if (u.startsWith(`${h} `) || u.startsWith(h)) score = 80
    else if (u.includes(` ${h} `) || u.includes(h)) score = 70
  }

  if (rules?.emailContains) {
    const email = foldPersonText(user.email)
    if (email.includes(foldPersonText(rules.emailContains))) score += 5
    else if (hintTokens.length >= 2) score = 0
  }

  return score
}

export function findUserForCoreName(users: AppUserRow[], hint: string): AppUserRow | null {
  let best: AppUserRow | null = null
  let bestScore = 0
  for (const user of users) {
    const score = scoreNameMatch(user, hint)
    if (score > bestScore) {
      bestScore = score
      best = user
    }
  }
  return bestScore >= 70 ? best : null
}

export function isCoreAttendeeKey(key: string) {
  return key.startsWith('core:')
}

export function resolveCoreMeetingAttendees(users: AppUserRow[]): IncidentMeetingAttendee[] {
  const usedIds = new Set<string>()
  const rows: IncidentMeetingAttendee[] = []

  for (const hint of INCIDENT_MEETING_CORE_NAMES) {
    const match = findUserForCoreName(
      users.filter((u) => !usedIds.has(u.id)),
      hint
    )
    if (match) {
      usedIds.add(match.id)
      rows.push({
        key: `core:${match.id}`,
        userId: match.id,
        name: match.name,
        email: match.email,
        department: match.department || '',
        attendance: null,
        absenceReason: '',
        receiveEmail: true,
      })
      continue
    }
    rows.push({
      key: `core:name:${foldPersonText(hint)}`,
      userId: '',
      name: hint,
      email: '',
      department: '',
      attendance: null,
      absenceReason: '',
      receiveEmail: true,
    })
  }

  return rows
}

/** Prioritza el correu desat a l’acta (manual) sobre el de l’usuari a usuaris. */
export function resolveMergedAttendeeEmail(
  saved: Pick<IncidentMeetingAttendee, 'email'>,
  core: Pick<IncidentMeetingAttendee, 'email'>
): string {
  const savedEmail = String(saved.email || '').trim().toLowerCase()
  const coreEmail = String(core.email || '').trim().toLowerCase()
  if (savedEmail.includes('@')) return savedEmail
  if (coreEmail.includes('@')) return coreEmail
  return savedEmail || coreEmail
}

/** Manté assistència guardada i convidats; re-injecta el nucli fix si falta. */
export function mergeMeetingAttendees(
  saved: IncidentMeetingAttendee[],
  core: IncidentMeetingAttendee[]
): IncidentMeetingAttendee[] {
  const savedByKey = new Map(saved.map((a) => [a.key, a]))
  const coreKeys = new Set(core.map((c) => c.key))
  const savedCore = saved.filter((a) => isCoreAttendeeKey(a.key))

  const mergedCore = core.map((c, index) => {
    let prev = savedByKey.get(c.key)
    // Migra assistència si el convocat fix ha canviat d’usuari (p. ex. Sonia Planas → Sonia Albet).
    if (!prev && savedCore[index] && savedCore[index].key !== c.key) {
      prev = savedCore[index]
    }
    if (!prev) return c
    return {
      ...c,
      attendance: prev.attendance,
      absenceReason: prev.absenceReason || '',
      name: c.name || prev.name,
      email: resolveMergedAttendeeEmail(prev, c),
      receiveEmail: prev.receiveEmail === false ? false : true,
    }
  })

  const guests = saved.filter((a) => !coreKeys.has(a.key) && !isCoreAttendeeKey(a.key))
  return [...mergedCore, ...guests]
}

export function filterUsersForGuestSearch(users: AppUserRow[], query: string, excludeIds: Set<string>) {
  const q = foldPersonText(query)
  const pool = users.filter((u) => u.email.includes('@') && !excludeIds.has(u.id))

  if (!q) return pool.slice(0, 40)

  return pool
    .map((user) => {
      const hay = foldPersonText([user.name, user.email, user.department || ''].join(' '))
      if (hay.includes(q)) return { user, score: 80 }
      const tokens = q.split(/\s+/).filter(Boolean)
      const all = tokens.length > 0 && tokens.every((t) => hay.includes(t))
      return { user, score: all ? 60 : 0 }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name, 'ca'))
    .map((row) => row.user)
    .slice(0, 30)
}
