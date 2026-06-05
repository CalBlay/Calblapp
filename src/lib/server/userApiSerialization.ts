/** Camps que un usuari pot editar al seu propi perfil (configuració). */
export const SELF_PROFILE_UPDATE_KEYS = new Set([
  'name',
  'nameFold',
  'email',
  'phone',
  'password',
  'updatedAt',
])

export function stripPassword<T extends Record<string, unknown>>(data: T): Omit<T, 'password'> {
  const { password: _password, ...rest } = data
  return rest
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
