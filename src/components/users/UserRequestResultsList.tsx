// file: src/components/users/UserRequestResultsList.tsx
'use client'

import useSWR from 'swr'
import { Button } from '@/components/ui/button'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type UserRequestResultNotification = {
  read?: boolean
  body?: string
}

export function UserRequestResultsList({ onAfterAction }: { onAfterAction?: () => void }) {
  const { data, error, mutate } = useSWR(
    '/api/notifications?mode=list&type=user_request_result',
    fetcher
  )

  const notifications = Array.isArray(data?.notifications) ? data.notifications : []
  const pending = notifications.filter((n: UserRequestResultNotification) => !n.read)
  const first = pending[0]

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markAllRead', type: 'user_request_result' }),
    })
    await mutate()
    onAfterAction?.()
  }

  if (error) return null
  if (!pending.length) return null

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm text-emerald-700">
          <span className="font-semibold">Resposta:</span>{' '}
          <span className="break-words">
            {formatMessage(first?.body)}
          </span>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-sm"
          onClick={markAllRead}
        >
          Acceptar
        </Button>
      </div>
    </div>
  )
}

export default UserRequestResultsList

function formatMessage(body?: string) {
  if (!body) return 'L’usuari s’ha donat d’alta.'

  const passwordMatch = body.match(/Contrasenya temporal:\s*([^\s]+)/i)
  const password = passwordMatch?.[1]
  const nameMatch = body.match(/S'ha creat l'usuari\s+(.+?)\.\s*Contrasenya temporal:/i)
  const name = nameMatch?.[1]

  if (!password && !name) return body

  const before = body.split('S\'ha creat l\'usuari')[0] || ''
  const afterPassword = password ? body.split(password)[1] || '' : ''

  return (
    <>
      {before}S'ha creat l'usuari{' '}
      {name ? <span className="font-semibold text-emerald-800">{name}</span> : null}
      {'. Contrasenya temporal: '}
      {password ? (
        <span className="font-semibold text-emerald-800">{password}</span>
      ) : null}
      {afterPassword}
    </>
  )
}
