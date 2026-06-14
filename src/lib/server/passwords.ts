import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

export function isPasswordHashed(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('$2a$') || trimmed.startsWith('$2b$') || trimmed.startsWith('$2y$')
}

export async function hashPassword(plain: string): Promise<string> {
  const trimmed = plain.trim()
  if (!trimmed) return ''
  return bcrypt.hash(trimmed, BCRYPT_ROUNDS)
}

/** Comprova contrasenya (bcrypt legacy o text pla al camp `password` de Firestore). */
export async function verifyPasswordWithMigration(
  plain: string,
  stored: string
): Promise<{ ok: boolean; rehash?: string }> {
  const input = plain.trim()
  const doc = stored.trim()
  if (!input || !doc) return { ok: false }

  if (isPasswordHashed(doc)) {
    const ok = await bcrypt.compare(input, doc)
    return { ok }
  }

  return { ok: input === doc }
}

/** Desa la contrasenya en text pla al camp `password` (visibilitat admin). */
export async function preparePasswordForStorage(plain?: string): Promise<string | undefined> {
  const trimmed = (plain || '').trim()
  if (!trimmed) return undefined
  if (isPasswordHashed(trimmed)) return trimmed
  return trimmed
}
