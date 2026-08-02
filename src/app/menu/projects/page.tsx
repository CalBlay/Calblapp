'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FolderKanban } from 'lucide-react'
import FloatingAddButton from '@/components/ui/floating-add-button'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ProjectNotificationsBell from './components/ProjectNotificationsBell'
import { PROJECT_MODULE_ROLES } from './components/project-access'
import { RoleGuard } from '@/lib/withRoleGuard'
import { normalizeRole } from '@/lib/roles'
import type { ProjectListFilterMeta } from '@/lib/projects/listQuery'
import ProjectsFilters from './components/ProjectsFilters'
import ProjectsGrid, { type ProjectGridItem } from './components/ProjectsGrid'

type ProjectListItem = ProjectGridItem & {
  sponsor?: string
  createdById?: string
}

type ProjectListResponse = {
  projects?: ProjectListItem[]
  total?: number
  page?: number
  limit?: number
  canViewAllProjects?: boolean
  filterMeta?: ProjectListFilterMeta
  error?: string
}

const ALL_DEPARTMENTS_VALUE = '__all_departments__'
const ALL_OWNERS_VALUE = '__all_owners__'
const PROJECTS_PER_PAGE = 12
const SEARCH_DEBOUNCE_MS = 300

const formatDepartmentLabel = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export default function ProjectsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [totalProjects, setTotalProjects] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState(ALL_DEPARTMENTS_VALUE)
  const [ownerFilter, setOwnerFilter] = useState(ALL_OWNERS_VALUE)
  const [participationScope, setParticipationScope] = useState<'mine' | 'all'>('mine')
  const [projectsPage, setProjectsPage] = useState(0)
  const [deletingProjectId, setDeletingProjectId] = useState('')
  const [canViewAllProjects, setCanViewAllProjects] = useState(false)
  const [filterMeta, setFilterMeta] = useState<ProjectListFilterMeta>({
    departments: [],
    owners: [],
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setProjectsPage(0)
  }, [
    debouncedSearchQuery,
    departmentFilter,
    ownerFilter,
    participationScope,
    startDate,
    endDate,
  ])

  const sessionUserId = String(session?.user?.id || '').trim()
  const sessionUserName = String(session?.user?.name || '').trim()
  const sessionRole = normalizeRole(String(session?.user?.role || '').trim())
  const participationUser = useMemo(
    () => ({
      id: sessionUserId,
      name: sessionUserName,
      role: sessionRole,
      department: session?.user?.department,
    }),
    [session?.user?.department, sessionRole, sessionUserId, sessionUserName]
  )

  const buildListUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('page', String(projectsPage))
    params.set('limit', String(PROJECTS_PER_PAGE))
    params.set('scope', participationScope)
    if (debouncedSearchQuery.trim()) params.set('q', debouncedSearchQuery.trim())
    if (departmentFilter !== ALL_DEPARTMENTS_VALUE) params.set('department', departmentFilter)
    if (ownerFilter !== ALL_OWNERS_VALUE) params.set('owner', ownerFilter)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    return `/api/projects?${params.toString()}`
  }, [
    debouncedSearchQuery,
    departmentFilter,
    endDate,
    ownerFilter,
    participationScope,
    projectsPage,
    startDate,
  ])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(buildListUrl(), { cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as ProjectListResponse
        if (!res.ok) {
          throw new Error(data.error || 'No s han pogut carregar els projectes')
        }
        if (cancelled) return

        setProjects(Array.isArray(data.projects) ? data.projects : [])
        setTotalProjects(typeof data.total === 'number' ? data.total : 0)
        setCanViewAllProjects(Boolean(data.canViewAllProjects))
        if (data.filterMeta) {
          setFilterMeta(data.filterMeta)
        }
        setError('')
      } catch (err: unknown) {
        if (!cancelled) {
          setProjects([])
          setTotalProjects(0)
          setError(err instanceof Error ? err.message : 'Error carregant projectes')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [buildListUrl])

  const departmentOptions = useMemo(() => {
    if (filterMeta.departments.length > 0) return filterMeta.departments
    const uniqueDepartments = new Map<string, string>()
    projects.forEach((project) => {
      ;(project.departments || []).forEach((department) => {
        const normalizedDepartment = normalizeText(department)
        if (!normalizedDepartment || uniqueDepartments.has(normalizedDepartment)) return
        uniqueDepartments.set(normalizedDepartment, String(department || '').trim())
      })
    })
    return Array.from(uniqueDepartments.entries())
      .map(([value, original]) => ({
        value,
        label: formatDepartmentLabel(original || value),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ca'))
  }, [filterMeta.departments, projects])

  const ownerOptions = useMemo(
    () =>
      filterMeta.owners.length > 0
        ? filterMeta.owners
        : [...new Set(projects.map((project) => String(project.owner || '').trim()).filter(Boolean))].sort(
            (a, b) => a.localeCompare(b, 'ca')
          ),
    [filterMeta.owners, projects]
  )

  const projectDurationDays = (createdAt?: string | number, launchDate?: string) => {
    const createdValue =
      typeof createdAt === 'number'
        ? new Date(createdAt)
        : String(createdAt || '').trim()
          ? new Date(String(createdAt))
          : null
    const launchValue = String(launchDate || '').trim()
      ? new Date(`${String(launchDate).trim()}T00:00:00`)
      : null

    if (
      !createdValue ||
      Number.isNaN(createdValue.getTime()) ||
      !launchValue ||
      Number.isNaN(launchValue.getTime())
    ) {
      return null
    }

    const start = new Date(createdValue.getFullYear(), createdValue.getMonth(), createdValue.getDate())
    const end = new Date(launchValue.getFullYear(), launchValue.getMonth(), launchValue.getDate())
    const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
    return diff >= 0 ? diff : null
  }

  const scopeLabel = useMemo(
    () =>
      participationScope === 'all' && canViewAllProjects
        ? 'Tots els projectes'
        : 'Els meus projectes',
    [canViewAllProjects, participationScope]
  )

  const filterSummary = useMemo(() => {
    const departmentLabel =
      departmentFilter === ALL_DEPARTMENTS_VALUE
        ? 'Tots els departaments'
        : departmentOptions.find((option) => option.value === departmentFilter)?.label || departmentFilter
    const ownerLabel =
      ownerFilter === ALL_OWNERS_VALUE ? 'Tots els responsables' : ownerFilter
    return `${departmentLabel} · ${ownerLabel}`
  }, [departmentFilter, departmentOptions, ownerFilter])

  const totalProjectPages = Math.max(1, Math.ceil(totalProjects / PROJECTS_PER_PAGE))

  const canDeleteProject = (project: ProjectListItem): boolean =>
    sessionRole === 'admin' ||
    Boolean(sessionUserId && sessionUserId === String(project.createdById || '').trim()) ||
    Boolean(
      normalizeText(sessionUserName) &&
        normalizeText(sessionUserName) === normalizeText(String(project.sponsor || ''))
    )

  const handleDeleteProject = async (project: ProjectListItem) => {
    const confirmed = window.confirm(
      `Vols eliminar el projecte "${project.name || 'Projecte'}"? S'eliminara tot el relacionat.`
    )
    if (!confirmed) return

    try {
      setDeletingProjectId(project.id)
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'No s ha pogut eliminar el projecte')
      }

      setProjects((current) => current.filter((item) => item.id !== project.id))
      setTotalProjects((current) => Math.max(0, current - 1))
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error eliminant el projecte')
    } finally {
      setDeletingProjectId('')
    }
  }

  return (
    <RoleGuard allowedRoles={[...PROJECT_MODULE_ROLES]}>
      <div className="cmd-app flex w-full max-w-none flex-col">
        <ModuleHeader
          icon={<FolderKanban className="h-6 w-6 text-violet-600" />}
          title="Projectes"
          breadcrumbSubtitle={scopeLabel}
          subtitle={filterSummary}
          actions={
            <>
              <ProjectNotificationsBell />
              <span className="rounded-full bg-violet-600 px-3 py-1 text-sm font-bold text-white">
                {totalProjects} visibles
              </span>
            </>
          }
        />

        <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
          <ProjectsFilters
            departmentOptions={departmentOptions}
            departmentFilter={departmentFilter}
            setDepartmentFilter={setDepartmentFilter}
            ownerOptions={ownerOptions}
            ownerFilter={ownerFilter}
            setOwnerFilter={setOwnerFilter}
            participationScope={participationScope}
            setParticipationScope={setParticipationScope}
            canViewAllProjects={canViewAllProjects}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            query={searchQuery}
            setQuery={setSearchQuery}
          />

          <ProjectsGrid
            loading={loading}
            error={error}
            projects={projects}
            pagedProjects={projects}
            page={projectsPage}
            totalPages={totalProjectPages}
            onPageChange={setProjectsPage}
            onSelect={(id) => router.push(`/menu/projects/${id}`)}
            projectDurationDays={projectDurationDays}
            canDeleteProject={canDeleteProject}
            deletingProjectId={deletingProjectId}
            onDeleteProject={(project) => void handleDeleteProject(project)}
            participationUser={participationUser}
            includeGlobalAccessLabel={canViewAllProjects}
          />
        </div>
      </div>

      <FloatingAddButton onClick={() => router.push('/menu/projects/new')} />
    </RoleGuard>
  )
}
