/**
 * Fields we read from next-auth JWT tokens in API routes.
 * Keeps call sites typed without `(token as any)`.
 */
export type AppJwtPayload = {
  id?: string
  sub?: string
  name?: string
  user?: { name?: string | null; email?: string | null }
  email?: string
  role?: string
  userRole?: string
  department?: string
  userDepartment?: string
  dept?: string
  departmentName?: string
  canRespondSurveys?: boolean
}

export function readAppJwt(token: unknown): AppJwtPayload {
  if (!token || typeof token !== 'object') return {}
  return token as AppJwtPayload
}

export function jwtUserId(token: unknown): string {
  const t = readAppJwt(token)
  return String(t.id || t.sub || '').trim()
}

export function jwtUserName(token: unknown): string {
  const t = readAppJwt(token)
  return String(t.name || t.user?.name || '').trim()
}

export function jwtRoleFields(token: unknown): string {
  const t = readAppJwt(token)
  return String(t.userRole ?? t.role ?? '')
}

export function jwtDepartmentFields(token: unknown): string {
  const t = readAppJwt(token)
  return String(t.department ?? t.userDepartment ?? t.dept ?? t.departmentName ?? '')
}

export function jwtSessionEmail(token: unknown): string {
  const t = readAppJwt(token)
  return String(t.user?.email || t.email || '')
}
