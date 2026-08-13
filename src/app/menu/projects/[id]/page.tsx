import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/server/authOptions'
import { loadProjectDetail, loadProjectUserOptions } from '@/lib/projects/serverData'
import ProjectDetailShell from '../components/ProjectDetailShell'
import { parseWorkspaceTab } from '../components/project-workspace-helpers'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; blockId?: string; taskId?: string }>
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const query = await searchParams
  const initialTab = parseWorkspaceTab(query.tab)
  const initialBlockTarget = query.blockId ? { blockId: String(query.blockId) } : undefined
  const initialTaskTarget =
    query.blockId && query.taskId
      ? { blockId: String(query.blockId), taskId: String(query.taskId) }
      : undefined

  const [project, usersCatalog] = await Promise.all([
    loadProjectDetail(id, session.user),
    loadProjectUserOptions(),
  ])

  if (!project) {
    notFound()
  }

  return (
    <ProjectDetailShell
      projectId={id}
      initialProject={project}
      initialUsersCatalog={usersCatalog}
      initialTab={initialTab}
      initialBlockTarget={initialTaskTarget ? undefined : initialBlockTarget}
      initialTaskTarget={initialTaskTarget}
    />
  )
}
