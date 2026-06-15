/** Ajusta NEXTAUTH_URL en dev local quan .env.local apunta a producció. */
export function ensureNextAuthEnv() {
  if (process.env.NODE_ENV === 'production') return

  const configured = String(process.env.NEXTAUTH_URL || '').trim()
  const isLocalDev =
    !configured ||
    configured.includes('vercel.app') ||
    configured.includes('calblapp')

  if (isLocalDev) {
    const port = String(process.env.PORT || '3000').trim() || '3000'
    const localUrl = `http://localhost:${port}`
    process.env.NEXTAUTH_URL = localUrl
    process.env.AUTH_URL = localUrl
  }

  if (!process.env.NEXTAUTH_SECRET?.trim()) {
    console.error(
      '[AUTH] Falta NEXTAUTH_SECRET. Afegeix-lo a .env.local per evitar errors de configuració.'
    )
  }
}
