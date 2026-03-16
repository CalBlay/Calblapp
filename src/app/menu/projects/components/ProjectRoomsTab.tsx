'use client'

import Link from 'next/link'
import { Building2, Save, Trash2, Users } from 'lucide-react'
import { colorByDepartment } from '@/lib/colors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type ProjectRoom } from './project-shared'
import {
  projectCardMetaClass,
  projectCardTitleClass,
  projectEmptyStateClass,
  projectSectionSubtitleClass,
  projectSectionTitleClass,
} from './project-ui'

type RoomDraft = {
  name: string
  departments: string[]
}

type Props = {
  projectId: string
  rooms: ProjectRoom[]
  roomDraft: RoomDraft
  showRoomComposer: boolean
  saving: boolean
  availableDepartments: string[]
  onSetRoomDraft: (updater: (current: RoomDraft) => RoomDraft) => void
  onToggleRoomDraftDepartment: (department: string) => void
  onCreateRoom: () => void
  onResetRoomDraft: () => void
  onRemoveRoom: (roomId: string) => void
}

export default function ProjectRoomsTab({
  projectId,
  rooms,
  roomDraft,
  showRoomComposer,
  saving,
  availableDepartments,
  onSetRoomDraft,
  onToggleRoomDraftDepartment,
  onCreateRoom,
  onResetRoomDraft,
  onRemoveRoom,
}: Props) {
  return (
    <section className="space-y-5 rounded-[24px] bg-white/75 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={projectSectionTitleClass}>Sales</h2>
          <p className={projectSectionSubtitleClass}>
            Cada bloc genera una sala automàtica. També pots crear sales manuals.
          </p>
        </div>

        {showRoomComposer ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={onCreateRoom}
              disabled={saving || !roomDraft.name.trim()}
              className="bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-300"
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar sala
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={onResetRoomDraft}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {showRoomComposer ? (
        <div className="grid gap-4 rounded-2xl bg-slate-50/80 p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label>Nom de la sala</Label>
            <Input
              value={roomDraft.name}
              onChange={(event) =>
                onSetRoomDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Ex: Sala coordinacio proveidors"
            />
          </div>

          <div className="space-y-2">
            <Label>Departaments</Label>
            <div className="flex flex-wrap gap-2">
              {availableDepartments.map((department) => {
                const selected = roomDraft.departments.includes(department)
                return (
                  <button
                    key={department}
                    type="button"
                    onClick={() => onToggleRoomDraftDepartment(department)}
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
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {rooms.length === 0 ? (
          <div className={`rounded-2xl bg-slate-50/80 px-4 py-4 ${projectEmptyStateClass}`}>
            Encara no hi ha sales al projecte.
          </div>
        ) : (
          rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50/70 px-4 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/menu/projects/${projectId}/rooms/${room.id}`}
                    className={`${projectCardTitleClass} hover:text-violet-700`}
                  >
                    {room.name}
                  </Link>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      room.kind === 'block'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-violet-100 text-violet-700'
                    }`}
                  >
                    {room.kind === 'block' ? 'Automatica' : 'Manual'}
                  </span>
                </div>

                <div className={`mt-2 flex flex-wrap items-center gap-2 ${projectCardMetaClass}`}>
                  {room.departments.length > 0 ? (
                    room.departments.map((department) => (
                      <span
                        key={`${room.id}-${department}`}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${colorByDepartment(department)}`}
                      >
                        {department}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      Sense departament
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {room.participants.length} participants
                  </span>
                </div>
              </div>

              {room.kind === 'manual' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => onRemoveRoom(room.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
