export const getPhaseHubTheme = (phase?: string, status?: string) => {
  if (status === 'draft') {
    return {
      bar: 'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500',
      surface: 'bg-gradient-to-br from-amber-100/70 via-white to-orange-100/50',
      hover: 'hover:border-amber-300 hover:shadow-[0_18px_40px_-18px_rgba(245,158,11,0.45)]',
      phaseBadge: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
      accent: 'text-amber-700',
    }
  }

  if (phase === 'execution' || phase === 'control') {
    return {
      bar: 'bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500',
      surface: 'bg-gradient-to-br from-violet-100/60 via-white to-fuchsia-100/40',
      hover: 'hover:border-violet-300 hover:shadow-[0_18px_40px_-18px_rgba(124,58,237,0.4)]',
      phaseBadge: 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white',
      accent: 'text-violet-700',
    }
  }

  if (phase === 'planning' || phase === 'kickoff') {
    return {
      bar: 'bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500',
      surface: 'bg-gradient-to-br from-sky-100/60 via-white to-indigo-100/40',
      hover: 'hover:border-sky-300 hover:shadow-[0_18px_40px_-18px_rgba(59,130,246,0.4)]',
      phaseBadge: 'bg-gradient-to-r from-sky-600 to-indigo-500 text-white',
      accent: 'text-sky-700',
    }
  }

  if (phase === 'closed' || phase === 'evaluation') {
    return {
      bar: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      surface: 'bg-gradient-to-br from-emerald-100/60 via-white to-teal-100/40',
      hover: 'hover:border-emerald-300 hover:shadow-[0_18px_40px_-18px_rgba(16,185,129,0.35)]',
      phaseBadge: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white',
      accent: 'text-emerald-700',
    }
  }

  return {
    bar: 'bg-gradient-to-r from-slate-500 to-slate-600',
    surface: 'bg-gradient-to-br from-slate-50 via-white to-violet-50/40',
    hover: 'hover:border-violet-300 hover:shadow-[0_18px_40px_-18px_rgba(100,116,139,0.3)]',
    phaseBadge: 'bg-gradient-to-r from-slate-600 to-violet-600 text-white',
    accent: 'text-slate-700',
  }
}

export const getParticipationHubBadgeClass = (kind: string) => {
  if (kind === 'owner') return 'bg-violet-600 text-white shadow-sm shadow-violet-200'
  if (kind === 'sponsor') return 'bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-200'
  if (kind === 'block_responsible') return 'bg-blue-600 text-white shadow-sm shadow-blue-200'
  if (kind === 'task_responsible') return 'bg-cyan-600 text-white shadow-sm shadow-cyan-200'
  if (kind === 'department') return 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200'
  return 'bg-slate-200 text-slate-700'
}
