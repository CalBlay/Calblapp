import { useMemo } from 'react'
import { useSession } from 'next-auth/react'
import type { AccessUser } from '@/lib/accessControl'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  hasRobaOperationalApiAccess,
  isRobaRrhhOperationalUser,
  ROBA_SUBMODULE_PATHS,
  ROBA_WORKFLOW_UI_PATHS,
} from '@/lib/robaPersonalPermissions'

type SessionRobaUser = AccessUser & { id?: string }

/** Alineat amb les APIs `/api/roba-personal/*` (scope de sessió + permís UI de pestanya). */
export function useRobaPersonalApiAccess() {
  const { data: session, status } = useSession()
  const { ready: uiPermsReady, canViewPath } = useUiPermissions()

  const user = session?.user as SessionRobaUser | undefined
  const isAuth = status === 'authenticated'
  const userId = String(user?.id || '').trim()

  const isRrhhFull = Boolean(user && isRobaRrhhOperationalUser(user))
  const isDeptLeadLimited = Boolean(user?.isDepartmentRobaLead) && !isRrhhFull
  const isWorkerSelf =
    Boolean(String(user?.robaLinkedPersonnelId || '').trim()) &&
    !isRrhhFull &&
    !isDeptLeadLimited

  const hasRobaScope = Boolean(user && hasRobaOperationalApiAccess(user))

  const canViewWorkflowUi = useMemo(
    () => ROBA_WORKFLOW_UI_PATHS.some((path) => canViewPath(path)),
    [canViewPath]
  )
  const canViewEntreguesUi = canViewPath(ROBA_SUBMODULE_PATHS.entregues)

  const canFetchRequests =
    isAuth && Boolean(userId) && uiPermsReady && hasRobaScope && canViewWorkflowUi
  const canFetchDeliveries =
    isAuth &&
    Boolean(userId) &&
    uiPermsReady &&
    hasRobaScope &&
    canViewEntreguesUi &&
    (isDeptLeadLimited || isWorkerSelf)

  return {
    isAuth,
    userId,
    uiPermsReady,
    /** RRHH / admin (comptadors de preparació). */
    isFullUser: isRrhhFull,
    isDeptLeadLimited,
    isWorkerSelf,
    hasRobaScope,
    canViewWorkflowUi,
    canViewEntreguesUi,
    canFetchRequests,
    canFetchDeliveries,
  }
}
