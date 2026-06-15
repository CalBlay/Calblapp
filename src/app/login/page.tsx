// File: src/app/login/page.tsx
'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useState, Suspense } from 'react'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl: string = searchParams?.get('callbackUrl') ?? '/menu'

  const [user, setUser] = useState<string>('')
  const [pass, setPass] = useState<string>('')
  const [remember, setRemember] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill username if previously remembered
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('cb_login_username') : null
    if (saved) {
      setUser(saved)
      setRemember(true)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const username = user.trim()
    const password = pass

    let res: Awaited<ReturnType<typeof signIn>> | null = null
    try {
      res = await signIn('credentials', {
        redirect: false,
        username,
        password,
        callbackUrl,
      })
    } catch (err) {
      console.error('[AUTH] signIn exception', err)
      setLoading(false)
      setError('No s’ha pogut contactar amb el servidor. Comproveu la connexió i torneu a provar.')
      return
    }

    if (!res || typeof res !== 'object') {
      console.error('[AUTH] signIn resposta buida o invàlida', res)
      setLoading(false)
      setError(
        'El servidor d’autenticació no ha respost. Reinicieu `npm run dev` i comproveu que NEXTAUTH_SECRET està definit a .env.local.'
      )
      return
    }

    // NextAuth v4: només continuar quan `ok === true`.
    if (res.ok !== true) {
      const rawError = (res.error as string | undefined) || ''
      const isCreds =
        rawError === 'CredentialsSignin' ||
        rawError === 'credentials' ||
        res?.status === 401
      const isConfig = rawError === 'Configuration'

      let friendly: string
      if (isCreds) {
        friendly = 'Usuari o contrasenya incorrectes'
      } else if (isConfig) {
        friendly =
          'Error de configuració del servidor (sessió). Contacteu amb l’administrador.'
      } else if (rawError) {
        friendly = `Error iniciant sessió: ${rawError}`
      } else {
        friendly =
          res?.status && res.status >= 500
            ? 'El servidor ha rebutjat la sessió. Torneu a provar d’aquí una estona.'
            : 'No s’ha pogut iniciar sessió. Comproveu usuari i contrasenya o torneu a provar.'
      }

      console.error('[AUTH] signIn failed', JSON.stringify(res))
      setLoading(false)
      setError(friendly)
      return
    }

    // Remember username (never password)
    try {
      if (remember) localStorage.setItem('cb_login_username', username)
      else localStorage.removeItem('cb_login_username')
    } catch {
      // ignore storage errors
    }

    router.push(callbackUrl)
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center px-4 pb-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-5"
        noValidate
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold">Inicia sessio</h1>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="username" className="font-medium">
            Usuari
          </label>
          <input
            id="username"
            name="username"
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
            className="w-full h-12 rounded-lg border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-blue-500"
            aria-invalid={!!error}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="font-medium">
            Contrasenya
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
            className="w-full h-12 rounded-lg border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-blue-500"
            aria-invalid={!!error}
          />
        </div>

        <div className="flex items-center justify-between">
          <label htmlFor="remember" className="flex items-center gap-2 text-sm">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4"
            />
            Recorda'm
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-60 active:translate-y-px transition"
        >
          {loading ? 'Entrant...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Carregant...</div>}>
      <LoginInner />
    </Suspense>
  )
}
