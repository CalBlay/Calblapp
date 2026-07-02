'use client'

import { RoleGuard } from '@/lib/withRoleGuard'
import ProjectWorkspace from './ProjectWorkspace'
import { PROJECT_MODULE_ROLES } from './project-access'
import type { ProjectData } from './project-shared'
import type { ResponsibleOption, WorkspaceTab } from './project-workspace-helpers'

type Props = {
  projectId: string
  initialProject: ProjectData
  initialUsersCatalog: ResponsibleOption[]
  initialTab?: WorkspaceTab
  initialTaskTarget?: { blockId: string; taskId: string }
}

export default function ProjectDetailShell({
  projectId,
  initialProject,
  initialUsersCatalog,
  initialTab,
  initialTaskTarget,
}: Props) {
  return (
    <RoleGuard allowedRoles={[...PROJECT_MODULE_ROLES]}>
      <div className="flex w-full max-w-none flex-col">
        <ProjectWorkspace
          projectId={projectId}
          initialProject={initialProject}
          initialUsersCatalog={initialUsersCatalog}
          initialTab={initialTab}
          initialTaskTarget={initialTaskTarget}
        />
      </div>
    </RoleGuard>
  )
}
