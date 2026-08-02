import { isPasswordHashed } from '@/lib/server/passwords'

/** Camps que un usuari pot editar al seu propi perfil (configuració). */
export const SELF_PROFILE_UPDATE_KEYS = new Set([
  'name',
  'nameFold',
  'email',
  'phone',
  'password',
  'updatedAt',
])

export const ADMIN_PASSWORD_FIELD = 'adminPassword'

export function stripPassword<T extends Record<string, unknown>>(data: T): Omit<T, 'password' | 'adminPassword'> {
  const { password: _password, adminPassword: _adminPassword, ...rest } = data
  return rest
}

export function resolveAdminVisiblePassword(data: Record<string, unknown>): string {
  const stored = String(data.password || '').trim()
  if (!stored) return ''
  if (isPasswordHashed(stored)) return ''
  return stored
}

export function serializeUserResponse(
  id: string,
  data: Record<string, unknown>,
  extras?: Record<string, unknown>
) {
  return stripPassword({
    id,
    ...data,
    ...extras,
  })
}

/** Llista/detall d'usuaris per a admin (inclou contrasenya visible de tots els usuaris). */
export function serializeAdminUserResponse(
  id: string,
  data: Record<string, unknown>,
  extras?: Record<string, unknown>
) {
  const base = stripPassword({
    id,
    ...data,
    ...extras,
  })

  return {
    ...base,
    password: resolveAdminVisiblePassword(data),
  }
}

export function pickSelfProfileUpdate(
  data: Record<string, unknown>,
  updatedAt = Date.now()
): Record<string, unknown> {
  const picked: Record<string, unknown> = { updatedAt }
  for (const key of SELF_PROFILE_UPDATE_KEYS) {
    if (key === 'updatedAt') continue
    if (key in data && data[key] !== undefined) {
      picked[key] = data[key]
    }
  }
  return picked
}
