'use client'

import { BellOff, BellRing, Users2 } from 'lucide-react'
import { initials } from '@/app/menu/missatgeria/utils'
import UserInviteSearchCombobox from '@/components/messaging/UserInviteSearchCombobox'
import { chatTheme } from '@/components/messaging/chatTheme'
import type { InviteUserOption } from '@/lib/messaging/userSearch'
import { cn } from '@/lib/utils'

type Props = {
  channelTitle: string
  channelSubtitle?: string
  avatarLabel?: string
  /** Text literal per l'avatar (p. ex. número de magatzem «04»). */
  avatarText?: string
  channelMuted?: boolean
  onToggleMute?: () => void
  participantsOpen?: boolean
  onToggleParticipants?: () => void
  canInvite?: boolean
  inviteUsers?: InviteUserOption[]
  inviteExcludeIds?: Set<string>
  onInvite?: (user: InviteUserOption) => void
  inviteAdding?: boolean
  inviteDisabled?: boolean
  trailingActions?: React.ReactNode
  className?: string
  tone?: 'default' | 'muted'
  /** Només icones d'acció (sense avatar ni títol duplicat). */
  showTitle?: boolean
}

export default function ChannelChatHeader({
  channelTitle,
  channelSubtitle,
  avatarLabel,
  avatarText,
  channelMuted = false,
  onToggleMute,
  participantsOpen = false,
  onToggleParticipants,
  canInvite = false,
  inviteUsers = [],
  inviteExcludeIds,
  onInvite,
  inviteAdding = false,
  inviteDisabled = false,
  trailingActions,
  className,
  tone = 'default',
  showTitle = true,
}: Props) {
  const mutedTone = tone === 'muted'
  const circleText = avatarText || initials(avatarLabel || channelTitle)

  const actionButtons = (
    <>
      {trailingActions}
      {onToggleMute ? (
        <button
          type="button"
          className={cn(
            'rounded-full p-2 transition',
            mutedTone
              ? 'text-slate-400 hover:bg-slate-100'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          )}
          onClick={onToggleMute}
          title={channelMuted ? 'Activar notificacions' : 'Silenciar notificacions'}
        >
          {channelMuted ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </button>
      ) : null}

      {canInvite && onInvite ? (
        <UserInviteSearchCombobox
          users={inviteUsers}
          excludeIds={inviteExcludeIds || new Set()}
          onPick={onInvite}
          adding={inviteAdding}
          disabled={inviteDisabled}
          variant="icon"
        />
      ) : null}

      {onToggleParticipants ? (
        <button
          type="button"
          className={cn(
            'rounded-full p-2 transition',
            participantsOpen
              ? mutedTone
                ? 'bg-slate-200 text-slate-600'
                : chatTheme.actionActive
              : mutedTone
                ? 'text-slate-400 hover:bg-slate-100'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          )}
          onClick={onToggleParticipants}
          title="Participants"
        >
          <Users2 className="h-4 w-4" />
        </button>
      ) : null}
    </>
  )

  if (!showTitle) {
    return (
      <div className={cn('flex shrink-0 items-center gap-1', className)}>{actionButtons}</div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5',
        mutedTone ? 'bg-slate-50' : 'bg-white',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            mutedTone ? chatTheme.avatarMuted : chatTheme.avatar
          )}
        >
          {circleText}
        </div>
        <div className="min-w-0">
          <div
            className={cn(
              'truncate text-sm font-semibold',
              mutedTone ? 'text-slate-500' : 'text-slate-900'
            )}
          >
            {channelTitle}
          </div>
          {channelSubtitle ? (
            <div className="truncate text-xs text-slate-500">{channelSubtitle}</div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">{actionButtons}</div>
    </div>
  )
}
