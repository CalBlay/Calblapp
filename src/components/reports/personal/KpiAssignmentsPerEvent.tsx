import { Summary } from './types'
import KpiCard from './KpiCard'

type Props = { summary: Summary | null }

export default function KpiAssignmentsPerEvent({ summary }: Props) {
  const totalAssign =
    (summary?.roles.responsable || 0) +
    (summary?.roles.conductor || 0) +
    (summary?.roles.treballador || 0)

  const value =
    summary && summary.events > 0 ? (totalAssign / summary.events).toFixed(2) : '—'
  const footer = summary
    ? `Resp ${summary.roles.responsable} · Cond ${summary.roles.conductor} · Treb ${summary.roles.treballador}`
    : undefined

  return <KpiCard title="Assignacions per event" value={value} footer={footer} />
}
