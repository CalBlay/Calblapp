export const SETTINGS_UI_PATH = '/menu/settings'
export const SETTINGS_SERVEIS_PATH = '/menu/settings/serveis'
export const SETTINGS_MAGATZEMS_PATH = '/menu/settings/magatzems'
export const SETTINGS_ARTICLES_PATH = '/menu/settings/articles'

export function canViewSettingsSubpath(
  canViewPath: (path: string) => boolean,
  subpath: string
): boolean {
  return canViewPath(subpath) || canViewPath(SETTINGS_UI_PATH)
}

export function canEditSettingsSubpath(
  canEditPath: (path: string) => boolean,
  subpath: string
): boolean {
  return canEditPath(subpath) || canEditPath(SETTINGS_UI_PATH)
}
