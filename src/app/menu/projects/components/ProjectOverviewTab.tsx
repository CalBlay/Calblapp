'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Layers,
  Paperclip,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { colorByDepartment } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getBlockDepartments, type ProjectData } from './project-shared'
import {
  projectBlockCardAccentClass,
  projectBlockCardClass,
  projectCardMetaClass,
  projectComposerShellClass,
  projectDepartmentIdleClass,
  projectEmptyIconClass,
  projectEmptyShellClass,
  projectEmptyStateClass,
  projectIconBoxClass,
  projectMetaStripClass,
  projectModuleShellClass,
  projectOverviewBlockTitleClass,
  projectOverviewChipClass,
  projectOverviewInputClass,
  projectOverviewLabelClass,
  projectOverviewMetaClass,
  projectOverviewSectionLabelClass,
  projectOverviewSectionSubtitleClass,
  projectOverviewSectionTitleClass,
  projectOverviewSelectClass,
  projectOverviewTextareaClass,
  projectPanelClass,
  projectPanelInsetClass,
  projectPrimaryButtonClass,
} from './project-ui'
import { type ResponsibleOption } from './project-workspace-helpers'
import ProjectKickoffTab from './ProjectKickoffTab'
import ProjectOverviewReadingToolbar from './ProjectOverviewReadingToolbar'
import {
  projectOverviewReadingFontClass,
  projectOverviewReadingScaleClass,
} from './project-overview-reading'
import { useProjectOverviewReadingPrefs } from './useProjectOverviewReadingPrefs'

type Props = {
  project: ProjectData
  availableDepartments: string[]
  ownerOptions: ResponsibleOption[]
  pendingFile: File | null
  blockDraft: {
    name: string
  }
  dirtyOverview: boolean
  savingOverview: boolean
  showBlockComposer: boolean
  onSave: () => void
  onProjectChange: (updater: (current: ProjectData) => ProjectData) => void
  onPendingFileChange: (file: File | null) => void
  onSetBlockDraftName: (value: string) => void
  onToggleBlockComposer: () => void
  onCreateBlock: () => void
  onSetBlockName: (blockId: string, value: string) => void
  onAddDepartmentToBlock: (blockId: string, department: string) => void
  onRemoveDepartmentFromBlock: (blockId: string, department: string) => void
  onRemoveBlock: (blockId: string) => void
  onRemoveDocument: (documentId: string) => void
  manualKickoffEmail?: string
  kickoffReady?: boolean
  sendingKickoff?: boolean
  onKickoffFieldChange?: <K extends keyof ProjectData['kickoff']>(
    field: K,
    value: ProjectData['kickoff'][K]
  ) => void
  onManualKickoffEmailChange?: (value: string) => void
  onAddManualKickoffEmail?: () => void
  onSendKickoff?: () => void
  onReopenKickoff?: () => void
  onRemoveKickoffAttendee?: (key: string) => void
  showSaveButton?: boolean
  showBaseSection?: boolean
  showKickoffSection?: boolean
  showDocumentSection?: boolean
  showBlocksSection?: boolean
  showBlocksHeader?: boolean
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
  collapsible = false,
  expanded = true,
  onToggle,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  action?: ReactNode
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  const titleBlock = (
    <>
      <h2 className={projectOverviewSectionTitleClass}>{title}</h2>
      <p className={projectOverviewSectionSubtitleClass}>{subtitle}</p>
    </>
  )

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={expanded ? 'Plegar secció' : 'Desplegar secció'}
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={cn(projectIconBoxClass, 'h-10 w-10')}>{icon}</div>
          <div className="min-w-0">
            {collapsible ? (
              <button type="button" onClick={onToggle} className="w-full text-left">
                {titleBlock}
              </button>
            ) : (
              titleBlock
            )}
          </div>
        </div>
      </div>
      {action ? (
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">{action}</div>
      ) : null}
    </div>
  )
}

export default function ProjectOverviewTab({
  project,
  availableDepartments,
  ownerOptions,
  pendingFile,
  blockDraft,
  dirtyOverview,
  savingOverview,
  showBlockComposer,
  onSave,
  onProjectChange,
  onPendingFileChange,
  onSetBlockDraftName,
  onToggleBlockComposer,
  onCreateBlock,
  onSetBlockName,
  onAddDepartmentToBlock,
  onRemoveDepartmentFromBlock,
  onRemoveBlock,
  onRemoveDocument,
  manualKickoffEmail = '',
  kickoffReady = false,
  sendingKickoff = false,
  onKickoffFieldChange = () => {},
  onManualKickoffEmailChange = () => {},
  onAddManualKickoffEmail = () => {},
  onSendKickoff = () => {},
  onReopenKickoff,
  onRemoveKickoffAttendee = () => {},
  showSaveButton = true,
  showBaseSection = true,
  showKickoffSection = true,
  showDocumentSection = true,
  showBlocksSection = true,
  showBlocksHeader = true,
}: Props) {
  const fileInputId = 'project-overview-initial-document'
  const initialDocuments = (project.documents || []).filter((item) => item && item.category === 'initial')
  const [dropTargetBlockId, setDropTargetBlockId] = useState<string | null>(null)
  const [detailsExpanded, setDetailsExpanded] = useState(true)
  const [structureExpanded, setStructureExpanded] = useState(true)
  const { scale, font, setScale, setFont } = useProjectOverviewReadingPrefs()

  const blocksBelowKickoff = showBlocksSection && showKickoffSection
  const blocksWithIntro = showBlocksSection && showBaseSection && !showKickoffSection
  const blocksStandalone = showBlocksSection && !blocksBelowKickoff && !blocksWithIntro

  const involvedDepartments = new Set(
    project.blocks.flatMap((block) => getBlockDepartments(block))
  )

  const blocksSection = showBlocksSection ? (
    <section>
      {showBlocksHeader ? (
        <SectionHeader
          icon={<Layers className="h-4 w-4" />}
          title="Estructura del projecte"
          subtitle="Organitza el projecte en blocs i assigna-hi els departaments implicats."
          collapsible
          expanded={structureExpanded}
          onToggle={() => setStructureExpanded((current) => !current)}
          action={
            !showBlockComposer ? (
              <Button
                type="button"
                onClick={onToggleBlockComposer}
                className={projectPrimaryButtonClass}
              >
                <Plus className="h-3.5 w-3.5" />
                Nou bloc
              </Button>
            ) : null
          }
        />
      ) : null}

      {structureExpanded ? (
      <div className={projectModuleShellClass}>
        <div className={cn(projectMetaStripClass, 'px-4 py-3 sm:px-5 lg:px-6')}>
          <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500', projectOverviewMetaClass)}>
            <span>
              <span className="font-semibold text-slate-700">{project.blocks.length}</span> bloc
              {project.blocks.length === 1 ? '' : 's'}
            </span>
            <span className="text-slate-300">·</span>
            <span>
              <span className="font-semibold text-slate-700">{involvedDepartments.size}</span> departament
              {involvedDepartments.size === 1 ? '' : 's'} assignat
              {involvedDepartments.size === 1 ? '' : 's'}
            </span>
            <span className="hidden text-slate-300 sm:inline">·</span>
            <span className="hidden sm:inline">Arrossega un departament cap a un bloc</span>
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className={projectOverviewSectionLabelClass}>Departaments</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableDepartments.map((department) => {
                const selected = project.departments.includes(department)
                const assigned = involvedDepartments.has(department)

                return (
                  <button
                    key={department}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', department)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 transition',
                      projectOverviewChipClass,
                      selected || assigned
                        ? colorByDepartment(department)
                        : projectDepartmentIdleClass
                    )}
                  >
                    <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
                    {department}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5 lg:p-6">
          {showBlockComposer ? (
            <div className={cn(projectComposerShellClass, 'flex flex-col gap-3 sm:flex-row sm:items-end')}>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="overview-block-name" className={projectOverviewLabelClass}>
                  Nom del bloc
                </Label>
                <Input
                  id="overview-block-name"
                  value={blockDraft.name}
                  onChange={(event) => onSetBlockDraftName(event.target.value)}
                  placeholder="Ex: Obertura operativa"
                  autoFocus
                  className={projectOverviewInputClass}
                />
              </div>
              <Button
                type="button"
                size="icon"
                onClick={onCreateBlock}
                disabled={!blockDraft.name.trim()}
                className="h-10 w-10 shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onToggleBlockComposer}>
                Cancel·lar
              </Button>
            </div>
          ) : null}

          {project.blocks.length === 0 ? (
            <div className={projectEmptyShellClass}>
              <div className={projectEmptyIconClass}>
                <Layers className="h-5 w-5" />
              </div>
              <p className="overview-body-copy mt-4 font-medium text-slate-700">Encara no hi ha blocs</p>
              <p className={cn('overview-body-copy mt-1 max-w-sm', projectEmptyStateClass)}>
                Crea el primer bloc per començar a estructurar el projecte per àrees de treball.
              </p>
              {!showBlockComposer ? (
                <Button
                  type="button"
                  size="sm"
                  className={cn('mt-4', projectPrimaryButtonClass)}
                  onClick={onToggleBlockComposer}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Crear primer bloc
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {project.blocks.map((block) => {
                  const departments = getBlockDepartments(block)
                  const isDropTarget = dropTargetBlockId === block.id

                  return (
                    <div
                      key={block.id}
                      className={cn(
                        projectBlockCardClass,
                        isDropTarget && 'border-violet-300 bg-violet-50/70 ring-2 ring-violet-200'
                      )}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setDropTargetBlockId(block.id)
                      }}
                      onDragLeave={() => {
                        setDropTargetBlockId((current) => (current === block.id ? null : current))
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        setDropTargetBlockId(null)
                        const department = event.dataTransfer.getData('text/plain')
                        if (department) onAddDepartmentToBlock(block.id, department)
                      }}
                    >
                      <span className={projectBlockCardAccentClass} aria-hidden />
                      <div className="flex items-start justify-between gap-3 pl-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            value={block.name}
                            onChange={(event) => onSetBlockName(block.id, event.target.value)}
                            className={projectOverviewBlockTitleClass}
                          />
                          {block.summary ? (
                            <div className={cn(projectCardMetaClass, 'overview-body-copy line-clamp-2')}>
                              {block.summary}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveBlock(block.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar bloc"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-2 flex min-h-[32px] flex-1 flex-wrap content-start gap-1.5">
                        {departments.map((department) => (
                          <span
                            key={`${block.id}-${department}`}
                            className={cn(
                              'inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1',
                              projectOverviewChipClass,
                              colorByDepartment(department)
                            )}
                          >
                            <span className="truncate">{department}</span>
                            <button
                              type="button"
                              onClick={() => onRemoveDepartmentFromBlock(block.id, department)}
                              className="opacity-60 transition hover:opacity-100"
                              aria-label={`Treure ${department}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border border-dashed px-2.5 py-1 transition',
                            projectOverviewChipClass,
                            isDropTarget
                              ? 'border-violet-300 bg-violet-100/80 text-violet-700'
                              : 'border-slate-200 text-slate-400'
                          )}
                        >
                          {isDropTarget ? 'Deixa anar aquí' : 'Arrossega dept.'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>
      ) : null}
    </section>
  ) : null

  return (
    <div
      className={cn(
        'w-full min-w-0 space-y-8 md:space-y-10',
        projectOverviewReadingScaleClass(scale),
        projectOverviewReadingFontClass(font)
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {showBaseSection && showBlocksSection && !showKickoffSection ? (
          <nav
            aria-label="Flux de la fitxa del projecte"
            className="overview-body-copy flex items-center gap-2 font-medium text-slate-500"
          >
            <span className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 font-semibold text-white shadow-sm">
              1. Detalls
            </span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="rounded-full px-3 py-1.5 text-slate-500">2. Estructura</span>
          </nav>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        <ProjectOverviewReadingToolbar
          scale={scale}
          font={font}
          onScaleChange={setScale}
          onFontChange={setFont}
        />
      </div>

      {showBaseSection || showKickoffSection ? (
        <div
          className={cn(
            showBaseSection && showKickoffSection ? 'grid items-start gap-6 xl:grid-cols-2' : 'space-y-6'
          )}
        >
          {showBaseSection ? (
            <section>
              <SectionHeader
                icon={<FileText className="h-4 w-4" />}
                title="Detalls del projecte"
                subtitle="Informació bàsica, responsables i objectius del projecte."
                collapsible
                expanded={detailsExpanded}
                onToggle={() => setDetailsExpanded((current) => !current)}
                action={
                  showSaveButton ? (
                    <>
                      <label
                        htmlFor={fileInputId}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                        title={pendingFile ? `Document seleccionat: ${pendingFile.name}` : 'Adjuntar document'}
                      >
                        <Paperclip className="h-4 w-4" />
                      </label>
                      <Input
                        id={fileInputId}
                        type="file"
                        className="hidden"
                        onChange={(event) => onPendingFileChange(event.target.files?.[0] || null)}
                      />
                      <Button
                        type="button"
                        onClick={onSave}
                        disabled={savingOverview || !dirtyOverview}
                        className={projectPrimaryButtonClass}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {project.status === 'draft' ? 'Crear projecte' : 'Guardar'}
                      </Button>
                    </>
                  ) : null
                }
              />

              {detailsExpanded ? (
              <div className={projectPanelClass}>
                <div className="space-y-6 p-4 sm:p-5 lg:p-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
                    <div className="space-y-2 sm:col-span-2 xl:col-span-2 2xl:col-span-2">
                      <Label htmlFor="project-name" className={projectOverviewLabelClass}>
                        Nom del projecte
                      </Label>
                      <Input
                        id="project-name"
                        value={project.name}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, name: event.target.value }))
                        }
                        className={cn(projectOverviewInputClass, 'font-medium')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className={projectOverviewLabelClass}>Responsable impulsor</Label>
                      <Input
                        value={project.sponsor}
                        readOnly
                        className={cn(projectOverviewInputClass, 'bg-slate-50')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="project-owner" className={projectOverviewLabelClass}>
                        Responsable del projecte
                      </Label>
                      <select
                        id="project-owner"
                        value={project.owner || ''}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, owner: event.target.value }))
                        }
                        className={projectOverviewSelectClass}
                      >
                        <option value="">Selecciona responsable</option>
                        {ownerOptions.map((option) => (
                          <option key={`${option.id}-${option.name}`} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 sm:col-span-1 xl:col-span-2 2xl:col-span-1">
                      <Label htmlFor="project-start-date" className={projectOverviewLabelClass}>
                        Data inici prevista
                      </Label>
                      <Input
                        id="project-start-date"
                        type="date"
                        value={project.startDate}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, startDate: event.target.value }))
                        }
                        className={projectOverviewInputClass}
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-1 xl:col-span-2 2xl:col-span-1">
                      <Label htmlFor="project-launch-date" className={projectOverviewLabelClass}>
                        Data objectiu d'arrencada
                      </Label>
                      <Input
                        id="project-launch-date"
                        type="date"
                        value={project.launchDate}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, launchDate: event.target.value }))
                        }
                        className={projectOverviewInputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="project-context" className={projectOverviewLabelClass}>
                        Definició del projecte
                      </Label>
                      <Textarea
                        id="project-context"
                        value={project.context}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, context: event.target.value }))
                        }
                        className={projectOverviewTextareaClass}
                        placeholder="Què és aquest projecte i per què es fa?"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="project-strategy" className={projectOverviewLabelClass}>
                        Objectius estratègics
                      </Label>
                      <Textarea
                        id="project-strategy"
                        value={project.strategy}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, strategy: event.target.value }))
                        }
                        className={projectOverviewTextareaClass}
                        placeholder="Quins resultats ha d'aconseguir?"
                      />
                    </div>
                  </div>

                  {showDocumentSection && (pendingFile || initialDocuments.length > 0) ? (
                    <div className={cn(projectPanelInsetClass, 'px-4 py-3')}>
                      <div className={cn('mb-2', projectOverviewSectionLabelClass)}>
                        Documents adjunts
                      </div>
                      <div className="space-y-2">
                        {pendingFile ? (
                          <div className="flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-3 py-2.5 text-violet-800 overview-body-copy">
                            <span className="truncate">{pendingFile.name}</span>
                            <span className="shrink-0 text-sm font-medium">Pendent de guardar</span>
                          </div>
                        ) : null}
                        {initialDocuments.map((document) => (
                          <div
                            key={document?.id || document?.url || document?.name}
                            className="overview-body-copy flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-slate-700 ring-1 ring-slate-200/80"
                          >
                            <Link
                              href={document?.url || '#'}
                              target="_blank"
                              className="min-w-0 truncate hover:text-violet-700"
                            >
                              {document?.name || 'Document del projecte'}
                            </Link>
                            {document?.id ? (
                              <button
                                type="button"
                                onClick={() => onRemoveDocument(document.id!)}
                                className="shrink-0 text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              ) : null}
            </section>
          ) : null}

          {showKickoffSection ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-slate-900">Reunió d'arrencada</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Preparació de la reunió d'arrencada des de la creació del projecte.
                </p>
              </div>

              <div className="p-5 sm:p-6">
                <ProjectKickoffTab
                  project={project}
                  manualKickoffEmail={manualKickoffEmail}
                  kickoffReady={kickoffReady}
                  sendingKickoff={sendingKickoff}
                  onKickoffFieldChange={onKickoffFieldChange}
                  onManualKickoffEmailChange={onManualKickoffEmailChange}
                  onAddManualKickoffEmail={onAddManualKickoffEmail}
                  onSendKickoff={onSendKickoff}
                  onReopenKickoff={onReopenKickoff}
                  onRemoveKickoffAttendee={onRemoveKickoffAttendee}
                />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {blocksWithIntro || blocksStandalone ? blocksSection : null}
      {blocksBelowKickoff ? blocksSection : null}
    </div>
  )
}
