import { typography } from '@/lib/typography'

type Props = {
  headerTitle: string
  headerMeta: string
  eventMeta: string
  onClose: () => void
}

export default function AssignTicketModalHeader({
  headerTitle,
  headerMeta,
  eventMeta,
  onClose,
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
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-full border border-slate-200 px-5 text-sm text-slate-600"
        >
          Tancar
        </button>
      </div>
    </div>
  )
}
