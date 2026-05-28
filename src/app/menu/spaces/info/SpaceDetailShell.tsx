'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'
import {
  SPACES_BBDD_ACTION_PATH,
  SPACES_BBDD_PATH,
  SPACES_ACTION,
} from '@/lib/spacesPermissions'
import SpaceDetailClient, { type EspaiDetall } from './SpaceDetailClient'

type Props = {
  espai: EspaiDetall
  forceReadOnly?: boolean
}

export default function SpaceDetailShell({ espai, forceReadOnly }: Props) {
  const router = useRouter()
  const { ready, canViewPath, canEditPath, hasAction } = useUiPermissions()
  const isNew = !espai.id

  const canViewBbdd = !ready || canViewPath(SPACES_BBDD_PATH)
  const canCreate =
    (!ready || canEditPath(SPACES_BBDD_PATH)) &&
    (!ready ||
      hasAction(PERM.action(SPACES_BBDD_ACTION_PATH, SPACES_ACTION.BBDD_CREATE)))

  useEffect(() => {
    if (!ready) return
    if (!canViewBbdd) {
      router.replace('/menu/spaces')
      return
    }
    if (isNew && !canCreate) {
      router.replace('/menu/spaces/info')
    }
  }, [ready, canViewBbdd, canCreate, isNew, router])

  if (!ready) {
    return <div className="p-6 text-sm text-gray-500">Carregant permisos…</div>
  }

  if (!canViewBbdd || (isNew && !canCreate)) return null

  return <SpaceDetailClient espai={espai} forceReadOnly={forceReadOnly} />
}
