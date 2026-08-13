import {
  CalendarDays,
  Clock3,
  Layers3,
  Loader2,
  Trash2,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { isProjectClosed } from '@/lib/projects/listQuery'
import {
  resolveUserProjectParticipation,
  type ParticipationUser,
} from '@/lib/projectParticipation'
import { formatProjectDate, phaseLabel, statusLabel } from './project-shared'
import { getParticipationHubBadgeClass, getPhaseHubTheme } from './project-hub-ui'
import { projectModuleShellClass } from './project-ui'

export type ProjectGridItem = {
  id: string
  name?: string
  owner?: string
  ownerUserId?: string
  sponsor?: string
  createdById?: string
  phase?: string
  status?: string
  createdAt?: string | number
  startDate?: string
  launchDate?: string
  departments?: string[]
  blocks?: Array<{
    id?: string
    owner?: string
    department?: string
    deadline?: string
    status?: string
    departments?: string[]
    tasks?: Array<{ owner?: string; department?: string; status?: string }>
  }>
}

type Props = {
  loading: boolean
  error: string
  projects: ProjectGridItem[]
  pagedProjects: ProjectGridItem[]
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  onSelect: (id: string) => void
  projectDurationDays: (createdAt?: string | number, launchDate?: string) => number | null
  canDeleteProject: (project: ProjectGridItem) => boolean
  deletingProjectId: string
  onDeleteProject: (project: ProjectGridItem) => void
  participationUser: ParticipationUser
  includeGlobalAccessLabel?: boolean
}

type ProjectSection = {
  key: 'open' | 'closed'
  title: string
  items: ProjectGridItem[]
}

function ProjectCard({
  project,
  onSelect,
  projectDurationDays,
  canDeleteProject,
  deletingProjectId,
  onDeleteProject,
  participationUser,
  includeGlobalAccessLabel,
}: {
  project: ProjectGridItem
  onSelect: (id: string) => void
  projectDurationDays: (createdAt?: string | number, launchDate?: string) => number | null
  canDeleteProject: (project: ProjectGridItem) => boolean
  deletingProjectId: string
  onDeleteProject: (project: ProjectGridItem) => void
  participationUser: ParticipationUser
  includeGlobalAccessLabel: boolean
}) {
  const durationDays = projectDurationDays(project.createdAt, project.launchDate)
  const phaseText = project.status === 'draft' ? statusLabel(project.status) : phaseLabel(project.phase)
  const participation = resolveUserProjectParticipation(participationUser, project, {
    includeGlobalAccessLabel,
  })
  const theme = getPhaseHubTheme(project.phase, project.status)

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(project.id)}
        className={`flex h-full w-full flex-col overflow-hidden rounded-[22px] border border-violet-100/80 text-left shadow-md transition duration-200 hover:-translate-y-1 ${theme.surface} ${theme.hover}`}
      >
        <div className={`h-1.5 w-full ${theme.bar}`} />

        <div className="flex flex-1 flex-col p-5">
          <div className="pr-8">
            <h3 className="text-lg font-bold leading-tight text-slate-900 group-hover:text-violet-900">
              {project.name || 'Projecte sense nom'}
            </h3>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
              <CalendarDays className={`h-4 w-4 shrink-0 ${theme.accent}`} />
              <span>
                Arrencada:{' '}
                <span className="font-semibold text-slate-800">
                  {project.launchDate ? formatProjectDate(project.launchDate) : 'Sense data'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
              <UserRound className={`h-4 w-4 shrink-0 ${theme.accent}`} />
              <span className="truncate">{project.owner || 'Sense responsable'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
              <Layers3 className={`h-4 w-4 shrink-0 ${theme.accent}`} />
              <span>
                {project.departments?.length || 0} departaments - {project.blocks?.length || 0} blocs
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
              <Clock3 className={`h-4 w-4 shrink-0 ${theme.accent}`} />
              <span>{durationDays !== null ? `${durationDays} dies` : 'Sense durada'}</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${theme.phaseBadge}`}
            >
              {phaseText}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getParticipationHubBadgeClass(participation.primary)}`}
            >
              {participation.label}
            </span>
          </div>
        </div>
      </button>

      {canDeleteProject(project) ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Eliminar projecte"
          aria-label={`Eliminar projecte ${project.name || 'Projecte'}`}
          className="absolute right-3 top-5 h-8 w-8 rounded-full bg-white/90 text-red-500 shadow-sm ring-1 ring-red-100 hover:bg-red-50 hover:text-red-700"
          disabled={deletingProjectId === project.id}
          onClick={(event) => {
            event.stopPropagation()
            onDeleteProject(project)
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}

export default function ProjectsGrid({
  loading,
  error,
  projects,
  pagedProjects,
  page,
  totalPages,
  onPageChange,
  onSelect,
  projectDurationDays,
  canDeleteProject,
  deletingProjectId,
  onDeleteProject,
  participationUser,
  includeGlobalAccessLabel = false,
}: Props) {
  const openProjects = pagedProjects.filter((project) => !isProjectClosed(project))
  const closedProjects = pagedProjects.filter((project) => isProjectClosed(project))
  const sections = [
    { key: 'open', title: 'Projectes en proces', items: openProjects },
    { key: 'closed', title: 'Projectes tancats', items: closedProjects },
  ] satisfies ProjectSection[]
  const visibleSections = sections.filter((section) => section.items.length > 0)

  if (loading) {
    return (
      <section className={cn('flex min-h-[50vh] flex-col items-center justify-center', projectModuleShellClass)}>
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="mt-4 text-base font-semibold text-slate-600">Carregant projectes...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-8 shadow-lg">
        <p className="text-base font-semibold text-red-600">{error}</p>
      </section>
    )
  }

  if (!projects.length) {
    return (
      <section className="rounded-[28px] border border-dashed border-violet-200 bg-gradient-to-br from-violet-50/80 to-white px-6 py-16 text-center shadow-sm">
        <p className="text-xl font-bold text-slate-800">Cap projecte amb aquests filtres</p>
        <p className="mt-2 text-base text-slate-500">Prova d&apos;ajustar la cerca o els filtres.</p>
      </section>
    )
  }

  return (
    <section className={projectModuleShellClass}>
      <div className="bg-gradient-to-b from-violet-100/40 via-fuchsia-50/20 to-white p-5 sm:p-6">
        <div className="space-y-8">
          {visibleSections.map((section) => (
            <div key={section.key} className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="shrink-0">
                  <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
                  <p className="text-sm font-medium text-slate-500">
                    {section.items.length} {section.items.length === 1 ? 'projecte' : 'projectes'}
                  </p>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-violet-200 via-fuchsia-100 to-transparent" />
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {section.items.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onSelect={onSelect}
                    projectDurationDays={projectDurationDays}
                    canDeleteProject={canDeleteProject}
                    deletingProjectId={deletingProjectId}
                    onDeleteProject={onDeleteProject}
                    participationUser={participationUser}
                    includeGlobalAccessLabel={includeGlobalAccessLabel}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 border-t border-violet-100 bg-violet-50/50 px-6 py-4">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white text-lg font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:opacity-40"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            aria-label="Anterior"
          >
            ‹
          </button>
          <span className="min-w-[72px] text-center text-sm font-bold text-violet-800">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-white text-lg font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:opacity-40"
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            aria-label="Seguent"
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  )
}
