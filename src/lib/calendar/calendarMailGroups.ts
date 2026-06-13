export type CalendarMailGroupMember = {
  name: string
  email: string
}

export type CalendarMailGroup = {
  id: string
  name: string
  description?: string
  ln?: string
  members: CalendarMailGroupMember[]
  createdByUserId: string
  createdByName?: string
  createdAt: string
  updatedAt: string
}

export const CALENDAR_MAIL_GROUPS_COLLECTION = 'calendar_mail_groups'

export function normalizeMailGroupMembers(raw: unknown): CalendarMailGroupMember[] {
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const members: CalendarMailGroupMember[] = []

  for (const item of raw) {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const email = String(row.email || '').trim().toLowerCase()
    if (!email.includes('@')) continue
    if (seen.has(email)) continue
    seen.add(email)
    const name = String(row.name || email).trim() || email
    members.push({ name, email })
  }

  return members
}

export function serializeMailGroup(id: string, data: Record<string, unknown>): CalendarMailGroup {
  return {
    id,
    name: String(data.name || '').trim(),
    description: String(data.description || '').trim() || undefined,
    ln: String(data.ln || '').trim() || undefined,
    members: normalizeMailGroupMembers(data.members),
    createdByUserId: String(data.createdByUserId || '').trim(),
    createdByName: String(data.createdByName || '').trim() || undefined,
    createdAt: String(data.createdAt || '').trim(),
    updatedAt: String(data.updatedAt || '').trim(),
  }
}
