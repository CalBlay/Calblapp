'use client'

import { Trash2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { formatProjectDate, phaseLabel, type ProjectData } from './project-shared'
import { type WorkspaceTab, workspaceTabs } from './project-workspace-helpers'

type Props = {
  project: ProjectData
  activeTab: WorkspaceTab
  visibleTabs?: WorkspaceTab[]
  onTabChange: (tab: WorkspaceTab) => void
  canDelete?: boolean
  deleting?: boolean
  onDelete?: () => void
}

export default function ProjectWorkspaceShell({
  project,
  activeTab,
  visibleTabs,
  onTabChange,
  canDelete = false,
  deleting = false,
  onDelete,
}: Props) {
  const launchDateRaw = String(project.launchDate || '').trim()
  const launchDate = launchDateRaw
    ? new Date(launchDateRaw.length === 10 ? `${launchDateRaw}T00:00:00` : launchDateRaw)
    : null
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const launchStart =
    launchDate && !Number.isNaN(launchDate.getTime())
      ? new Date(launchDate.getFullYear(), launchDate.getMonth(), launchDate.getDate())
      : null
  const daysToLaunch = launchStart
    ? Math.round((launchStart.getTime() - todayStart.getTime()) / 86400000)
    : null

  const tabs = visibleTabs?.length
    ? workspaceTabs.filter((tab) => visibleTabs.includes(tab.id))
    : workspaceTabs

  return (
    <section className="overflow-hidden rounded-[28px] bg-gradient-to-b from-white to-slate-50/60">
      <div className="bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {project.name || 'Projecte sense nom'}
            </h1>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              {phaseLabel(project.phase)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {canDelete ? (
              <Button
                type="button"
                variant="outline"
                onClick={onDelete}
                disabled={deleting}
                className="border-red-200 bg-white/80 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deleting ? 'Eliminant...' : 'Eliminar projecte'}
              </Button>
            ) : null}
            <span className="rounded-full bg-white/80 px-3 py-1.5 font-medium text-slate-700">
              Arrencada: {formatProjectDate(project.launchDate)}
            </span>
            {daysToLaunch !== null ? (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                {daysToLaunch > 0
                  ? `Falten ${daysToLaunch} dies`
                  : daysToLaunch === 0
                    ? 'Arrencada avui'
                    : `Retard de ${Math.abs(daysToLaunch)} dies`}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <Tabs value={activeTab}>
          <TabsList className="h-auto flex-wrap gap-2 bg-transparent p-0">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${
                    isActive
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>
    </section>
  )
}
