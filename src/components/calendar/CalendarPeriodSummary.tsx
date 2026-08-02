'use client'

type CodeCounts = {
  confirmed: number
  review: number
  missing: number
}

type Props = {
  total: number
  codeCounts?: CodeCounts
  showCodeStatus?: boolean
}

export default function CalendarPeriodSummary({
  total,
  codeCounts,
  showCodeStatus,
}: Props) {
  const parts: string[] = [
    `${total} esdeveniment${total === 1 ? '' : 's'}`,
  ]

  if (showCodeStatus && codeCounts) {
    if (codeCounts.confirmed > 0) {
      parts.push(`${codeCounts.confirmed} confirmat${codeCounts.confirmed === 1 ? '' : 's'}`)
    }
    if (codeCounts.review > 0) {
      parts.push(`${codeCounts.review} a revisar`)
    }
    if (codeCounts.missing > 0) {
      parts.push(`${codeCounts.missing} sense codi`)
    }
  }

  return (
    <p className="text-xs text-gray-600 sm:text-sm">
      {parts.join(' · ')}
    </p>
  )
}
