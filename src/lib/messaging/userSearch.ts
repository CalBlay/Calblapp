export type InviteUserOption = {
  id: string
  name: string
  email?: string
  department?: string
  role?: string
}

const foldText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export function filterUsersForInviteSearch(
  users: InviteUserOption[],
  query: string,
  excludeIds: Set<string>
) {
  const pool = users.filter((user) => user.id && user.name && !excludeIds.has(user.id))
  const q = foldText(query)
  if (!q) return pool.slice(0, 40)

  return pool
    .map((user) => {
      const hay = foldText([user.name, user.email || '', user.department || '', user.role || ''].join(' '))
      if (hay.includes(q)) return { user, score: 80 }
      const tokens = q.split(/\s+/).filter(Boolean)
      const all = tokens.length > 0 && tokens.every((token) => hay.includes(token))
      return { user, score: all ? 60 : 0 }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name, 'ca'))
    .map((row) => row.user)
    .slice(0, 30)
}
