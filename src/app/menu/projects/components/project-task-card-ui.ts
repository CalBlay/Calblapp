export const priorityBorderClass = (priority?: string) => {
  switch (priority) {
    case 'low':
      return 'border-t-slate-300'
    case 'high':
      return 'border-t-amber-400'
    case 'critical':
      return 'border-t-rose-500'
    case 'normal':
    default:
      return 'border-t-violet-400'
  }
}

export const taskDayDiffFromToday = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const target = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export const taskDeadlineAccentClass = (daysLeft: number | null, status?: string) => {
  if (status === 'done' || daysLeft === null) return 'text-slate-700'
  if (daysLeft < 0) return 'text-rose-700'
  if (daysLeft <= 3) return 'text-rose-700'
  if (daysLeft <= 7) return 'text-amber-800'
  return 'text-slate-700'
}
