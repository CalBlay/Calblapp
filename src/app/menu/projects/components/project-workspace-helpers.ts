import {
  Blocks,
  CalendarDays,
  CalendarRange,
  FileText,
  FolderOpen,
  LayoutDashboard,
  TimerReset,
  UsersRound,
} from 'lucide-react'

export type WorkspaceTab =
  | 'overview'
  | 'blocks'
  | 'tasks'
  | 'planning'
  | 'documents'
  | 'rooms'
  | 'tracking'

export type ResponsibleOption = {
  id: string
  name: string
  role: string
  email: string
  department: string
}

export const workspaceTabs: Array<{
  id: WorkspaceTab
  label: string
  icon: typeof LayoutDashboard
}> = [
  { id: 'overview', label: 'Fitxa del projecte', icon: LayoutDashboard },
  { id: 'blocks', label: 'Blocs', icon: Blocks },
  { id: 'tasks', label: 'Tasques', icon: TimerReset },
  { id: 'rooms', label: 'Sales', icon: UsersRound },
  { id: 'planning', label: 'Planificació', icon: CalendarRange },
  { id: 'tracking', label: 'Seguiment', icon: FolderOpen },
  { id: 'documents', label: 'Documents', icon: FileText },
]

export const createBlockDraft = () => ({
  name: '',
  summary: '',
  department: '',
  departments: [] as string[],
  owner: '',
  deadline: '',
  budget: '',
  dependsOn: 'none',
})

export const createTaskDraft = () => ({
  blockId: 'none',
  title: '',
  description: '',
  department: '',
  owner: '',
  deadline: '',
  cost: '',
  priority: 'normal',
})

export const normalizeDepartment = (value: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  const aliasMap: Record<string, string> = {
    marketing: 'marqueting',
    direccion: 'direccio',
    administracion: 'administracio',
    produccion: 'produccio',
    'cuina central': 'cuina central',
    fdlc: 'fdlc',
  }

  return aliasMap[normalized] || normalized
}

export const priorityBadgeClass = (priority: string) => {
  if (priority === 'critical') return 'bg-rose-100 text-rose-700'
  if (priority === 'high') return 'bg-amber-100 text-amber-800'
  if (priority === 'low') return 'bg-slate-100 text-slate-700'
  return 'bg-violet-100 text-violet-700'
}

export const taskStatusBadgeClass = (status: string) => {
  if (status === 'done') return 'bg-emerald-100 text-emerald-700'
  if (status === 'blocked') return 'bg-rose-100 text-rose-700'
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800'
  return 'bg-blue-100 text-blue-700'
}
