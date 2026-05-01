import { normalizeDept } from '@/lib/accessControl'
import { normalizeRole, type Role } from '@/lib/roles'

export type DocumentacioItemStatus = 'draft' | 'published'

export type DocumentacioItemRecord = {
  id: string
  ambit: string
  /** Títol visible de l’àmbit quan no és un dels tres estàtics (àmbits creats des del modal). */
  ambitTitle?: string | null
  topicSlug: string
  /** Títol visible del tema quan no està a l’estructura estàtica (temes creats des del modal). */
  topicTitle?: string | null
  label: string
  kind: 'file' | 'link'
  href: string
  storagePath: string | null
  departments: string[]
  roles: string[]
  status: DocumentacioItemStatus
  reviewAt: string | null
  createdBy: string
  createdByName: string
  createdAt: number
  updatedAt: number
}

/** Resposta API per llistes: sense `storagePath` ni metadades d’auditoria (menys payload). */
export type DocumentacioItemListDTO = Pick<
  DocumentacioItemRecord,
  | 'id'
  | 'ambit'
  | 'ambitTitle'
  | 'topicSlug'
  | 'topicTitle'
  | 'label'
  | 'kind'
  | 'href'
  | 'status'
  | 'reviewAt'
  | 'updatedAt'
>

/** Fila mínima per cerca server-side (menys bytes Firestore i memòria que el registre complet). */
export type DocumentacioItemSearchRow = Pick<
  DocumentacioItemRecord,
  | 'id'
  | 'label'
  | 'ambit'
  | 'ambitTitle'
  | 'topicSlug'
  | 'topicTitle'
  | 'kind'
  | 'href'
  | 'status'
  | 'departments'
  | 'roles'
>

/** Normalitza text per cerca (sense accents, minúscules). */
export function normalizeForSearch(raw: string) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Visibilitat: admin veu tot (inclosos esborranys).
 * La resta només publicats, i ha de complir departament (si hi ha llista) I rol (si hi ha llista).
 */
export function documentacioItemVisibleToViewer(params: {
  item: Pick<DocumentacioItemRecord, 'status' | 'departments' | 'roles'>
  viewerRole?: string | null
  viewerDepartment?: string | null
}): boolean {
  const role = normalizeRole(params.viewerRole)
  if (role === 'admin' || role === 'direccio') return true

  if (params.item.status !== 'published') return false

  const deptList = params.item.departments || []
  if (deptList.length > 0) {
    const viewerDept = normalizeDept(params.viewerDepartment)
    const okDept = deptList.some((d) => normalizeDept(d) === viewerDept)
    if (!okDept) return false
  }

  const roleList = (params.item.roles || []).map((r) => normalizeRole(r))
  if (roleList.length > 0) {
    if (!roleList.includes(role)) return false
  }

  return true
}

/** Publicar, esborrar documents i esborrats en massa (àmbit / tema). */
export function canManageDocumentacioContent(role?: string | null): boolean {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'direccio'
}

export const DOCUMENTACIO_ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Administrador' },
  { value: 'direccio', label: 'Direcció' },
  { value: 'cap', label: 'Cap de departament' },
  { value: 'treballador', label: 'Treballador' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'usuari', label: 'Usuari' },
  { value: 'observer', label: 'Observador' },
]
