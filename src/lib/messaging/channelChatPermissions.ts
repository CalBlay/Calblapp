import { normalizeRole } from '@/lib/roles'

export type ChannelInvitePermissionInput = {
  channelId?: string | null
  /** Valor definitiu de GET /members (undefined mentre carrega). */
  apiCanManage?: boolean
  membersLoaded?: boolean
  /** Pista del llistat (sales Ops, canal, etc.). */
  hintCanManage?: boolean
  actorUserId?: string
  actorRole?: string
  responsibleUserId?: string | null
}

/** Mateixa regla a tots els mòduls Ops; sense esperar només l'API de membres. */
export function resolveChannelInvitePermission(input: ChannelInvitePermissionInput): boolean {
  if (!input.channelId) return false

  if (input.apiCanManage) return true
  if (input.hintCanManage) return true

  if (!input.membersLoaded) {
    if (input.hintCanManage === false) return false
  }

  const role = normalizeRole(input.actorRole || '')
  if (role === 'admin' || role === 'direccio') return true

  const responsibleId = String(input.responsibleUserId || '').trim()
  if (responsibleId && responsibleId === String(input.actorUserId || '').trim()) {
    return true
  }

  return false
}

export function canShowChannelInvite(input: ChannelInvitePermissionInput): boolean {
  return resolveChannelInvitePermission(input)
}

export function canManageChannelParticipants(input: ChannelInvitePermissionInput): boolean {
  return resolveChannelInvitePermission(input)
}
