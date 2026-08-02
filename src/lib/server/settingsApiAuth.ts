import type { AccessUser } from '@/lib/accessControl'
import {
  SETTINGS_SERVEIS_PATH,
  SETTINGS_UI_PATH,
} from '@/lib/settingsPermissions'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

async function canViewSettingsSubpathUi(
  user: AccessUser & { id: string },
  subpath: string
): Promise<boolean> {
  if (await canViewUiPath({ user, path: subpath })) return true
  return canViewUiPath({ user, path: SETTINGS_UI_PATH })
}

async function canEditSettingsSubpathUi(
  user: AccessUser & { id: string },
  subpath: string
): Promise<boolean> {
  if (await canEditUiPath({ user, path: subpath })) return true
  return canEditUiPath({ user, path: SETTINGS_UI_PATH })
}

export async function requireSettingsServeisView(auth: AuthSuccess): Promise<boolean> {
  const user = accessUserFromAuth(auth.user)
  return canViewSettingsSubpathUi(user, SETTINGS_SERVEIS_PATH)
}

export async function requireSettingsServeisEdit(auth: AuthSuccess): Promise<boolean> {
  const user = accessUserFromAuth(auth.user)
  return canEditSettingsSubpathUi(user, SETTINGS_SERVEIS_PATH)
}
