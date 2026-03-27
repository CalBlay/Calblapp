import { typography } from '@/lib/typography'

type Props = {
  isPlanningStage: boolean
  savedPlanningLabel: string
  createdDateLabel: string
  createdFullLabel: string
  createdByName?: string | null
  sourceText: string
  assignedToNames?: string[]
}

export default function AssignTicketSummary({
  isPlanningStage,
  savedPlanningLabel,
  createdDateLabel,
  createdFullLabel,
  createdByName,
  sourceText,
  assignedToNames,
}: Props) {
  return (
    <div className={`grid gap-3 ${!isPlanningStage || savedPlanningLabel ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className={typography('eyebrow')}>{isPlanningStage ? 'Creat per' : 'Alta ticket'}</div>
        <div className={`mt-2 ${typography('cardTitle')}`}>
          {isPlanningStage
            ? [String(createdByName || '').trim() || 'Sense identificar', createdDateLabel]
                .filter(Boolean)
                .join(' - ')
            : createdFullLabel}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className={typography('eyebrow')}>{isPlanningStage ? 'Entrada' : 'Operaris'}</div>
        <div className={`mt-2 ${typography('cardTitle')}`}>
          {isPlanningStage
            ? sourceText
            : assignedToNames && assignedToNames.length > 0
              ? assignedToNames.join(', ')
              : 'Sense assignar'}
        </div>
      </div>
      {!isPlanningStage || savedPlanningLabel ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className={typography('eyebrow')}>Planificacio</div>
          <div className={`mt-2 ${typography('cardTitle')}`}>{savedPlanningLabel || 'Sense planificar'}</div>
        </div>
      ) : null}
    </div>
  )
}
