'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { initials } from '@/app/menu/missatgeria/utils'
import { Button } from '@/components/ui/button'
import { chatTheme } from '@/components/messaging/chatTheme'
import { cn } from '@/lib/utils'

export type ChannelParticipantMember = {
  userId: string
  userName: string
  department?: string
  role?: string
  isResponsible?: boolean
  canRemove?: boolean
}

type Props = {
  members: ChannelParticipantMember[]
  canManage?: boolean
  onRemove?: (userId: string) => void
  removingUserId?: string | null
  canEditResponsible?: boolean
  onSetResponsible?: (userId: string) => void
  savingResponsible?: boolean
  canToggleVisibility?: boolean
  selfHidden?: boolean
  onToggleVisibility?: () => void
  className?: string
}

export default function ChannelParticipantsPanel({
  members,
  canManage = false,
  onRemove,
  removingUserId = null,
  canEditResponsible = false,
  onSetResponsible,
  savingResponsible = false,
  canToggleVisibility = false,
  selfHidden = false,
  onToggleVisibility,
  className,
}: Props) {
  return (
    <div className={cn('border-b border-slate-200 bg-white px-4 py-4 sm:px-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">Participants</div>
        {canToggleVisibility && onToggleVisibility ? (
          <button
            type="button"
            className="text-xs rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
            onClick={onToggleVisibility}
          >
            {selfHidden ? 'Fer-me visible' : 'Amagar-me'}
          </button>
        ) : null}
      </div>

      {members.length > 0 ? (
        <div className="mt-4 space-y-2">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    chatTheme.avatar
                  )}
                >
                  {initials(member.userName)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-900">{member.userName}</div>
                  <div className="truncate text-xs text-slate-500">
                    {[member.department, member.role].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {member.isResponsible ? (
                  <span className={cn('text-xs font-semibold', chatTheme.responsibleBadge)}>
                    Responsable
                  </span>
                ) : canEditResponsible && onSetResponsible ? (
                  <button
                    type="button"
                    className="text-xs rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                    onClick={() => onSetResponsible(member.userId)}
                    disabled={savingResponsible}
                  >
                    Fer responsable
                  </button>
                ) : null}
                {canManage && member.canRemove && onRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => onRemove(member.userId)}
                    disabled={removingUserId === member.userId}
                    title="Treure participant"
                  >
                    {removingUserId === member.userId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-xs text-slate-500">Sense membres.</div>
      )}
    </div>
  )
}
