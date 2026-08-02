import { typography } from '@/lib/typography'
import { MessageCircle } from 'lucide-react'

type Props = {
  headerTitle: string
  headerMeta: string
  eventMeta: string
  onClose: () => void
  showOpsButton?: boolean
  opsUnreadCount?: number
  onOpenOps?: () => void
}

export default function AssignTicketModalHeader({
  headerTitle,
  headerMeta,
  eventMeta,
  onClose,
  showOpsButton = false,
  opsUnreadCount = 0,
  onOpenOps,
}: Props) {
  return (
    <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
      <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={typography('pageTitle')}>{headerTitle}</div>
          <div className={`mt-1 ${typography('bodySm')}`}>{headerMeta}</div>
          {eventMeta ? <div className={`mt-1 ${typography('bodySm')}`}>{eventMeta}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showOpsButton && onOpenOps ? (
            <button
              type="button"
              aria-label="Obrir Ops del ticket"
              title="Ops"
              onClick={onOpenOps}
              className="relative flex min-h-[44px] items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Ops
              {opsUnreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {opsUnreadCount > 99 ? '99+' : opsUnreadCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full border border-slate-200 px-5 text-sm text-slate-600"
          >
            Tancar
          </button>
        </div>
      </div>
    </div>
  )
}
