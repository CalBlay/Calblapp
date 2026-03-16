'use client'

import Link from 'next/link'
import { Check, Paperclip, Plus, Save, Trash2 } from 'lucide-react'
import { colorByDepartment } from '@/lib/colors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getBlockDepartments, type ProjectData } from './project-shared'
import { projectCardMetaClass, projectEmptyStateClass } from './project-ui'
import { type ResponsibleOption } from './project-workspace-helpers'
import ProjectKickoffTab from './ProjectKickoffTab'

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
  manualKickoffEmail: string
  kickoffReady: boolean
  sendingKickoff: boolean
  onKickoffFieldChange: <K extends keyof ProjectData['kickoff']>(
    field: K,
    value: ProjectData['kickoff'][K]
  ) => void
  onManualKickoffEmailChange: (value: string) => void
  onAddManualKickoffEmail: () => void
  onSendKickoff: () => void
  onReopenKickoff?: () => void
  onRemoveKickoffAttendee: (key: string) => void
  showSaveButton?: boolean
  showBaseSection?: boolean
  showKickoffSection?: boolean
  showDocumentSection?: boolean
  showBlocksSection?: boolean
  showBlocksHeader?: boolean
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
  manualKickoffEmail,
  kickoffReady,
  sendingKickoff,
  onKickoffFieldChange,
  onManualKickoffEmailChange,
  onAddManualKickoffEmail,
  onSendKickoff,
  onReopenKickoff,
  onRemoveKickoffAttendee,
  showSaveButton = true,
  showBaseSection = true,
  showKickoffSection = true,
  showDocumentSection = true,
  showBlocksSection = true,
  showBlocksHeader = true,
}: Props) {
  const fileInputId = 'project-overview-initial-document'
  const initialDocuments = (project.documents || []).filter((item) => item && item.category === 'initial')

  return (
    <div className="space-y-6">
      {showBaseSection || showKickoffSection ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {showBaseSection ? (
            <section className="overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-sm">
              <div className="border-b border-violet-200 bg-gradient-to-r from-violet-50 via-white to-violet-50 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">1. Introducció de dades</h2>
                    <p className="text-sm text-slate-500">Dades inicials del projecte abans de la reunió d'arrencada.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <section className="space-y-5 rounded-[24px] border border-violet-200 bg-violet-50/40 p-5">
                  <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
                    <div className="space-y-2">
                      <Label>Nom del projecte</Label>
                      <Input
                        value={project.name}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Responsable impulsor</Label>
                      <Input value={project.sponsor} readOnly />
                    </div>

                    <div className="space-y-2">
                      <Label>Responsable del projecte</Label>
                      <select
                        value={project.owner || ''}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, owner: event.target.value }))
                        }
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400"
                      >
                        <option value="">Selecciona responsable</option>
                        {ownerOptions.map((option) => (
                          <option key={`${option.id}-${option.name}`} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data inici prevista</Label>
                      <Input
                        type="date"
                        value={project.startDate}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, startDate: event.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Data objectiu d'arrencada</Label>
                      <Input
                        type="date"
                        value={project.launchDate}
                        onChange={(event) =>
                          onProjectChange((current) => ({ ...current, launchDate: event.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Definició del projecte</Label>
                    <Textarea
                      value={project.context}
                      onChange={(event) =>
                        onProjectChange((current) => ({ ...current, context: event.target.value }))
                      }
                      className="min-h-[140px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Objectius estratègics</Label>
                    <Textarea
                      value={project.strategy}
                      onChange={(event) =>
                        onProjectChange((current) => ({ ...current, strategy: event.target.value }))
                      }
                      className="min-h-[120px]"
                    />
                  </div>

                  {showSaveButton ? (
                    <div className="flex items-center justify-end gap-3">
                      <label
                        htmlFor={fileInputId}
                        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-violet-100 text-violet-700 transition hover:bg-violet-200"
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
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {project.status === 'draft' ? 'Crear projecte' : 'Guardar canvis'}
                      </Button>
                    </div>
                  ) : null}

                  {showDocumentSection && (pendingFile || initialDocuments.length > 0) ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                      <div className="mb-2 text-sm font-medium text-slate-700">Documents adjunts</div>
                      <div className="space-y-2">
                        {pendingFile ? (
                          <div className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">
                            <span className="truncate">{pendingFile.name}</span>
                            <span className="shrink-0 text-xs font-medium">Pendent de guardar</span>
                          </div>
                        ) : null}
                        {initialDocuments.map((document) => (
                          <div
                            key={document?.id || document?.url || document?.name}
                            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
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
                </section>
              </div>
            </section>
          ) : null}

          {showKickoffSection ? (
            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">2. Reunió d'arrencada</h2>
                    <p className="text-sm text-slate-500">Preparació de la reunió d'arrencada des de la creació del projecte.</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
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

      {showBlocksSection ? (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          {showBlocksHeader ? (
            <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-6 py-5">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">3. Creació de blocs</h2>
                  <p className="text-sm text-slate-500">Departaments implicats i estructura inicial del projecte.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 p-6 xl:grid-cols-[0.72fr_1.28fr]">
            <section className="space-y-4 rounded-[20px] border border-slate-200 bg-white/80 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Departaments implicats</h3>
              <div className="flex flex-wrap gap-2">
                {availableDepartments.map((department) => {
                  const selected = project.departments.includes(department)
                  return (
                    <button
                      key={department}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', department)
                      }}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        selected
                          ? colorByDepartment(department)
                          : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {department}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-4 rounded-[20px] border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">Creació de blocs</h3>
                {!showBlockComposer ? (
                  <Button
                    type="button"
                    size="icon"
                    onClick={onToggleBlockComposer}
                    className="h-10 w-10 rounded-full bg-violet-600 hover:bg-violet-700"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {showBlockComposer ? (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label>Nom del bloc</Label>
                    <Input
                      value={blockDraft.name}
                      onChange={(event) => onSetBlockDraftName(event.target.value)}
                      placeholder="Ex: Obertura operativa"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    onClick={onCreateBlock}
                    disabled={!blockDraft.name.trim()}
                    className="h-10 w-10 rounded-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              <div className="space-y-3">
                {project.blocks.length === 0 ? (
                  <div className={`rounded-2xl bg-slate-50 px-4 py-4 ${projectEmptyStateClass}`}>
                    Encara no hi ha blocs creats.
                  </div>
                ) : (
                  project.blocks.map((block) => {
                    const departments = getBlockDepartments(block)

                    return (
                      <div
                        key={block.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          const department = event.dataTransfer.getData('text/plain')
                          if (department) onAddDepartmentToBlock(block.id, department)
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <Input
                              value={block.name}
                              onChange={(event) => onSetBlockName(block.id, event.target.value)}
                              className="h-9 border-0 bg-transparent px-0 text-sm font-semibold text-slate-900 shadow-none focus-visible:ring-0"
                            />
                            {block.summary ? <div className={projectCardMetaClass}>{block.summary}</div> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveBlock(block.id)}
                            className="rounded-full p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {departments.map((department) => (
                            <span
                              key={`${block.id}-${department}`}
                              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${colorByDepartment(department)}`}
                            >
                              {department}
                              <button
                                type="button"
                                onClick={() => onRemoveDepartmentFromBlock(block.id, department)}
                                className="text-slate-400 hover:text-slate-700"
                              >
                                x
                              </button>
                            </span>
                          ))}
                          <div className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-400">
                            Arrossega aquí departaments
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </section>
      ) : null}
    </div>
  )
}
