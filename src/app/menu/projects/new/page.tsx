'use client'

import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import ProjectEditor from '../components/ProjectEditor'

export default function ProjectCreatePage() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="flex w-full max-w-none flex-col gap-6 p-4">
        <ModuleHeader title="Projectes" subtitle="Nou projecte" mainHref="/menu/projects" />
        <ProjectEditor />
      </div>
    </RoleGuard>
  )
}
