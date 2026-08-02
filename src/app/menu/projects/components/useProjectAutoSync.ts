'use client'

import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { deriveProjectPhase, getBlockDepartments, type ProjectData } from './project-shared'
import {
  deriveKickoffAttendees,
  ensureProjectRooms,
  sameStringSet,
  serializeAutoSyncFingerprint,
  serializeRoomsState,
} from './project-workspace-state'
import type { ResponsibleOption } from './project-workspace-helpers'

type Params = {
  project: ProjectData
  setProject: Dispatch<SetStateAction<ProjectData>>
  usersCatalog: ResponsibleOption[]
  userByName: Map<string, ResponsibleOption>
}

export function useProjectAutoSync({
  project,
  setProject,
  usersCatalog,
  userByName,
}: Params) {
  const fingerprint = useMemo(() => serializeAutoSyncFingerprint(project), [project])

  useEffect(() => {
    setProject((current) => {
      const nextDepartments = [
        ...new Set(current.blocks.flatMap((block) => getBlockDepartments(block)).filter(Boolean)),
      ]

      let nextProject =
        sameStringSet(current.departments, nextDepartments)
          ? current
          : {
              ...current,
              departments: nextDepartments,
            }

      if (!Array.isArray(nextProject.sprints)) {
        nextProject = {
          ...nextProject,
          sprints: [],
        }
      }

      const roomsCandidate = ensureProjectRooms(nextProject, userByName)
      if (serializeRoomsState(roomsCandidate.rooms) !== serializeRoomsState(nextProject.rooms)) {
        nextProject = roomsCandidate
      }

      const kickoffAttendees = deriveKickoffAttendees(nextProject, usersCatalog, userByName)
      const sameKickoffAttendees =
        kickoffAttendees.length === nextProject.kickoff.attendees.length &&
        kickoffAttendees.every((item, index) => {
          const currentItem = nextProject.kickoff.attendees[index]
          return (
            currentItem?.key === item.key &&
            currentItem?.userId === item.userId &&
            currentItem?.email === item.email &&
            currentItem?.name === item.name &&
            currentItem?.attended === item.attended &&
            currentItem?.department === item.department
          )
        })

      if (!sameKickoffAttendees) {
        nextProject = {
          ...nextProject,
          kickoff: {
            ...nextProject.kickoff,
            attendees: kickoffAttendees,
          },
        }
      }

      const sprintIds = new Set((nextProject.sprints || []).map((sprint) => String(sprint.id || '').trim()))
      const blocksWithValidSprint = nextProject.blocks.map((block) => ({
        ...block,
        tasks: block.tasks.map((task) => {
          const sprintId = String(task.sprintId || '').trim()
          if (!sprintId || sprintIds.has(sprintId)) return task
          return { ...task, sprintId: '' }
        }),
      }))
      const sameTaskSprintRefs =
        blocksWithValidSprint.length === nextProject.blocks.length &&
        blocksWithValidSprint.every((block, blockIndex) =>
          block.tasks.every(
            (task, taskIndex) =>
              task.sprintId === nextProject.blocks[blockIndex]?.tasks[taskIndex]?.sprintId
          )
        )

      if (!sameTaskSprintRefs) {
        nextProject = {
          ...nextProject,
          blocks: blocksWithValidSprint,
        }
      }

      const nextPhase = deriveProjectPhase(nextProject)
      if (nextProject.phase !== nextPhase || (nextProject.status && nextProject.status !== 'draft')) {
        nextProject = {
          ...nextProject,
          phase: nextPhase,
          status: nextProject.status === 'draft' ? 'draft' : '',
        }
      }

      return nextProject === current ? current : nextProject
    })
  }, [fingerprint, usersCatalog, userByName, setProject])
}
