export function foldUserSearchText(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

type UserSearchFields = {
  name?: string | null
  email?: string | null
  phone?: string | null
  commercialName?: string | null
  role?: string | null
  department?: string | null
  id?: string | null
}

/** Cerca per tokens (sense accents); tots els termes han d’aparèixer en algun camp. */
export function matchesUserSearch(user: UserSearchFields, query: string): boolean {
  const q = foldUserSearchText(query)
  if (!q) return true

  const tokens = q.split(/\s+/).filter(Boolean)
  const haystack = [
    user.name,
    user.email,
    user.phone,
    user.commercialName,
    user.role,
    user.department,
    user.id,
  ]
    .map((v) => foldUserSearchText(v))
    .join(' ')

  return tokens.every((token) => haystack.includes(token))
}
