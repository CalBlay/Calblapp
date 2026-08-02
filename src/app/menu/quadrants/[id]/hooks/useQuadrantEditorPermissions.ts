'use client'

import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'

/** Permisos d’accions de l’editor de quadrants (modal + vista operativa). */
export function useQuadrantEditorPermissions() {
  const { ready, canViewPath, hasAction } = useUiPermissions()
  const canView = canViewPath('/menu/quadrants')

  const canSave =
    canView &&
    (hasAction(PERM.action('/menu/quadrants', 'save')) ||
      hasAction(PERM.action('/menu/quadrants', 'draft:save')))

  const canConfirm =
    canView &&
    (hasAction(PERM.action('/menu/quadrants', 'confirm')) ||
      hasAction(PERM.action('/menu/quadrants', 'draft:confirm')))

  const canDeleteDraft = canView && hasAction(PERM.action('/menu/quadrants', 'draft:delete'))

  return { ready, canSave, canConfirm, canDeleteDraft }
}

export function quadrantEditorDisabledReason(params: {
  canAutoGen: boolean
  ready: boolean
  canSave: boolean
  canConfirm?: boolean
  busy?: boolean
  autoPreviewLoading?: boolean
  autoInsufficient?: boolean
  kind: 'save' | 'confirm'
}): string | null {
  const {
    canAutoGen,
    ready,
    canSave,
    canConfirm = canSave,
    busy,
    autoPreviewLoading,
    autoInsufficient,
    kind,
  } = params
  if (busy) return 'Processant…'
  if (!ready) return 'Carregant permisos…'
  if (!canAutoGen) return 'Omple dates i hores (inici i fi) per poder desar.'
  if (autoPreviewLoading) return 'Calculant proposta automàtica…'
  if (autoInsufficient) return 'Mode Auto sense prou dades; canvia a Semi-auto o Manual.'
  if (kind === 'confirm' && !canConfirm) return 'Sense permís per confirmar quadrants.'
  if (!canSave) return 'Sense permís per desar quadrants.'
  return null
}
