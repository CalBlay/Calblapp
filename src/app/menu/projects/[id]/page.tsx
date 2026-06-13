import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { loadProjectDetail, loadProjectUserOptions } from '@/lib/projects/serverData'
import ProjectDetailShell from '../components/ProjectDetailShell'
import { parseWorkspaceTab } from '../components/project-workspace-helpers'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const query = await searchParams
  const initialTab = parseWorkspaceTab(query.tab)

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
    />
  )
}
