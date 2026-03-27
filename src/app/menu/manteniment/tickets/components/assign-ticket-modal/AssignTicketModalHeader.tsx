import { typography } from '@/lib/typography'

type Props = {
  headerTitle: string
  headerMeta: string
  eventMeta: string
  assignBusy: boolean
  isAssignedStage: boolean
  isValidated: boolean
  canReopen: boolean
  onAssign: () => void
  onReopen: () => void
}

export default function AssignTicketModalHeader({
  headerTitle,
  headerMeta,
  eventMeta,
  assignBusy,
  isAssignedStage,
  isValidated,
  canReopen,
  onAssign,
  onReopen,
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAssign}
            disabled={assignBusy || isValidated}
            className="min-h-[44px] rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assignBusy ? 'Guardant...' : isAssignedStage ? 'Reassignar' : 'Assignar'}
          </button>
          {isValidated && canReopen ? (
            <button
              type="button"
              onClick={onReopen}
              className="min-h-[44px] rounded-full border border-amber-300 px-5 text-sm font-semibold text-amber-700"
            >
              Reobrir
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
