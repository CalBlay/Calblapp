export const PROJECT_MODULE_ROLES = [
  'admin',
  'direccio',
  'cap',
  'usuari',
  'comercial',
] as const

export type ProjectModuleRole = (typeof PROJECT_MODULE_ROLES)[number]
