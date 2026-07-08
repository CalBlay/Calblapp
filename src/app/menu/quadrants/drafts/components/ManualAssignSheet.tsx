'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAvailablePersonnel } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import { pruneEditorGroups } from '@/lib/quadrantsDraftEditor'
import {
  applyGlobalTimesToRows,
  createManualAssignGroup,
  createManualAssignRow,
  filterPersonnelPool,
  filterVehiclePool,
  getAssignedPeopleExcludingRow,
  getAssignedVehiclesExcludingRow,
  isPersonAssignedElsewhere,
  getManualAssignDeptConfig,
  initManualAssignState,
  normalizeAssignPersonKey,
  normalizeAssignVehiclePlate,
  patchRowRole,
  patchRowSchedule,
  validateEditorRowsNoDuplicatePeople,
  type RoleSelectValue,
} from '@/lib/manualAssignModel'
import type { EditorGroup } from '@/lib/quadrantsDraftEditor'
import { GraduationCap, Truck, User, Users } from 'lucide-react'
import type { DraftInput, Role, Row } from './types'
import DraftManualToolbar from './DraftManualToolbar'
import ManualAssignRow from './ManualAssignRow'
import DraftActions from './DraftActions'
import {
  confirmDraftTable,
  deleteDraftTable,
  saveDraftTable,
  unconfirmDraftTable,
} from './draftsTableActions'

type Vehicle = {
  id: string
  plate: string
  type: string
  available: boolean
}

type Props = {
  draft: DraftInput
  onRefreshDrafts?: () => Promise<unknown>
}

function manualRowPersonKeys(row: Row): string[] {
  if (row.isExternal) return []
  const keys: string[] = []
  const id = normalizeAssignPersonKey(row.id)
  const name = normalizeAssignPersonKey(row.name)
  if (id) keys.push(`id:${id}`)
  if (name) keys.push(`name:${name}`)
  return keys
}

function normalizeManualRows(rows: Row[]): Row[] {
  const seenPeople = new Map<string, number>()
  const seenVehicles = new Set<string>()
  const nextRows = rows.map((row) => ({ ...row }))
  let changed = false
  const roleRank: Record<Role, number> = {
    responsable: 3,
    conductor: 2,
    treballador: 1,
  }

  nextRows.forEach((row, index) => {
    const personKeys = manualRowPersonKeys(row)
    if (personKeys.length === 0) {
      // skip person dedupe
    } else {
      let existingIndex: number | undefined
      for (const key of personKeys) {
        const hit = seenPeople.get(key)
        if (hit !== undefined) {
          existingIndex = hit
          break
        }
      }

      if (existingIndex !== undefined && existingIndex !== index) {
        const existingRow = nextRows[existingIndex]
        const existingRank = roleRank[existingRow.role] ?? 0
        const currentRank = roleRank[row.role] ?? 0
        const winnerIndex = currentRank > existingRank ? index : existingIndex
        const loserIndex = winnerIndex === index ? existingIndex : index
        const winnerRow = winnerIndex === index ? row : existingRow
        const loserRow = loserIndex === index ? row : existingRow
        const mergedIsDriver =
          winnerRow.role === 'conductor' ||
          loserRow.role === 'conductor' ||
          winnerRow.isDriver === true ||
          loserRow.isDriver === true

        nextRows[winnerIndex] = {
          ...nextRows[winnerIndex],
          role: winnerRow.role,
          isDriver: mergedIsDriver,
          vehicleType: nextRows[winnerIndex].vehicleType || loserRow.vehicleType || '',
          plate: nextRows[winnerIndex].plate || loserRow.plate || '',
          arrivalTime: nextRows[winnerIndex].arrivalTime || loserRow.arrivalTime || '',
        }

        nextRows[loserIndex] = {
          ...nextRows[loserIndex],
          id: '',
          name: '',
          plate: '',
          vehicleType: '',
          arrivalTime: '',
        }
        if (winnerIndex === index) {
          personKeys.forEach((key) => seenPeople.set(key, index))
        }
        changed = true
        return
      }

      personKeys.forEach((key) => seenPeople.set(key, index))
    }

    const plateKey = normalizeAssignVehiclePlate(row.plate)
    if (!plateKey) return
    if (seenVehicles.has(plateKey)) {
      nextRows[index] = {
        ...nextRows[index],
        plate: '',
      }
      changed = true
      return
    }
    seenVehicles.add(plateKey)
  })

  return changed ? nextRows : rows
}

export default function ManualAssignSheet({ draft, onRefreshDrafts }: Props) {
  const { data: session } = useSession()
  const department =
    (
      draft.department ||
      (session?.user && 'department' in session.user ? session.user.department : '') ||
      ''
    ).toLowerCase()

  const phaseType = String(
    (draft as DraftInput & { phaseType?: string }).phaseType || 'event'
  )
  const config = getManualAssignDeptConfig(department, phaseType)
  const initial = useMemo(
    () => initManualAssignState({ ...draft, department }),
    [draft, department]
  )

  const [rows, setRows] = useState<Row[]>(initial.rows)
  const [groups, setGroups] = useState(initial.groups)
  const [globalStartDate, setGlobalStartDate] = useState(initial.globalStartDate)
  const [globalStartTime, setGlobalStartTime] = useState(initial.globalStartTime)
  const [globalEndTime, setGlobalEndTime] = useState(initial.globalEndTime)
  const [globalMeetingPoint, setGlobalMeetingPoint] = useState(initial.globalMeetingPoint)
  const [vestimentModel, setVestimentModel] = useState(initial.vestimentModel)
  const [serveisVestimentModels, setServeisVestimentModels] = useState<string[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [confirmed, setConfirmed] = useState(draft.status === 'confirmed')
  const [appliedFlash, setAppliedFlash] = useState(false)
  const appliedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLocked = confirmed

  const baselineRef = useRef(
    JSON.stringify({
      rows: initial.rows,
      groups: initial.groups,
      globalStartDate: initial.globalStartDate,
      globalStartTime: initial.globalStartTime,
      globalEndTime: initial.globalEndTime,
      globalMeetingPoint: initial.globalMeetingPoint,
      vestimentModel: initial.vestimentModel,
    })
  )

  useEffect(() => {
    const next = initManualAssignState({ ...draft, department })
    setRows(normalizeManualRows(next.rows))
    setGroups(next.groups)
    setGlobalStartDate(next.globalStartDate)
    setGlobalStartTime(next.globalStartTime)
    setGlobalEndTime(next.globalEndTime)
    setGlobalMeetingPoint(next.globalMeetingPoint)
    setVestimentModel(next.vestimentModel)
    setConfirmed(draft.status === 'confirmed')
    baselineRef.current = JSON.stringify({
      rows: next.rows,
      groups: next.groups,
      globalStartDate: next.globalStartDate,
      globalStartTime: next.globalStartTime,
      globalEndTime: next.globalEndTime,
      globalMeetingPoint: next.globalMeetingPoint,
      vestimentModel: next.vestimentModel,
    })
  }, [draft, department])

  useEffect(() => {
    setRows((prev) => normalizeManualRows(prev))
  }, [rows])

  useEffect(() => {
    if (!config.isServeis) {
      setServeisVestimentModels([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/quadrants/premises?department=serveis', { cache: 'no-store' })
        const json = await res.json()
        if (cancelled || !res.ok) return
        const models = Array.isArray(json?.premises?.vestimentModels)
          ? (json.premises.vestimentModels as string[])
              .map((item) => String(item || '').trim())
              .filter(Boolean)
          : []
        setServeisVestimentModels(models)
      } catch {
        if (!cancelled) setServeisVestimentModels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.isServeis])

  useEffect(() => {
    if (!config.usesGroups || groups.length > 0) return
    setGroups([
      {
        id: 'group-1',
        serviceDate: globalStartDate || draft.startDate,
        meetingPoint: globalMeetingPoint,
        startTime: globalStartTime,
        endTime: globalEndTime,
      },
    ])
  }, [config.usesGroups, groups.length, draft.startDate, globalMeetingPoint, globalStartDate, globalStartTime, globalEndTime])

  useEffect(
    () => () => {
      if (appliedFlashTimerRef.current) clearTimeout(appliedFlashTimerRef.current)
    },
    []
  )

  const availabilityStart = globalStartTime || draft.startTime || ''
  const availabilityEnd = globalEndTime || draft.endTime || ''
  const availabilityStartDate = globalStartDate || draft.startDate || ''

  const available = useAvailablePersonnel({
    departament: department,
    startDate: availabilityStartDate,
    endDate: draft.endDate || availabilityStartDate,
    startTime: availabilityStart,
    endTime: availabilityEnd,
    includeConflicts: true,
    enabled: Boolean(
      availabilityStartDate && availabilityStart && availabilityEnd
    ),
    excludeEventId: draft.id,
  })

  useEffect(() => {
    if (!config.showVehicleFields) {
      setVehicles([])
      return
    }
    if (!draft.startDate || !availabilityStart || !availabilityEnd) {
      setVehicles([])
      return
    }

    const controller = new AbortController()
    fetch('/api/transports/available', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: draft.startDate,
        startTime: availabilityStart,
        endDate: draft.endDate || draft.startDate,
        endTime: availabilityEnd,
        department,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('vehicles')
        const json = await res.json()
        setVehicles(Array.isArray(json?.vehicles) ? json.vehicles : [])
      })
      .catch(() => setVehicles([]))

    return () => controller.abort()
  }, [
    availabilityEnd,
    availabilityStart,
    config.showVehicleFields,
    department,
    draft.endDate,
    draft.startDate,
  ])

  const dirty =
    JSON.stringify({
      rows,
      groups,
      globalStartDate,
      globalStartTime,
      globalEndTime,
      globalMeetingPoint,
      vestimentModel,
    }) !== baselineRef.current

  const groupLabelCapitalized = config.groupLabel === 'cotxe' ? 'Cotxe' : 'Grup'

  const ensureGroups = (current: EditorGroup[]) => {
    if (!config.usesGroups) return current
    if (current.length > 0) return current
    return [
      {
        id: 'group-1',
        serviceDate: globalStartDate || draft.startDate,
        meetingPoint: globalMeetingPoint,
        startTime: globalStartTime,
        endTime: globalEndTime,
      },
    ]
  }

  const activeGroups = ensureGroups(groups)
  const defaultGroupId = config.usesGroups ? activeGroups[0]?.id || 'group-1' : undefined

  const patchRowAt = (index: number, patch: Partial<Row>) => {
    let blockedDuplicatePerson = false
    let blockedDuplicateVehicle = false

    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        const schedulePatch = patchRowSchedule(row, patch)
        const nextRow = { ...row, ...patch, ...schedulePatch }

        const assignedPeople = getAssignedPeopleExcludingRow(prev, index, roster)
        const selectedPerson =
          !nextRow.isExternal && (nextRow.id || nextRow.name)
            ? { id: nextRow.id, name: nextRow.name }
            : null

        if (selectedPerson && isPersonAssignedElsewhere(selectedPerson, assignedPeople)) {
          blockedDuplicatePerson = true
          nextRow.id = ''
          nextRow.name = ''
        }

        const assignedVehicles = getAssignedVehiclesExcludingRow(prev, index)
        const normalizedPlate = normalizeAssignVehiclePlate(nextRow.plate)
        if (normalizedPlate && assignedVehicles.has(normalizedPlate)) {
          blockedDuplicateVehicle = true
          nextRow.plate = ''
        }

        return nextRow
      })
    )

    if (blockedDuplicatePerson) {
      toast.warning('Aquest conductor o treballador ja està assignat en una altra línia')
    }
    if (blockedDuplicateVehicle) {
      toast.warning('Aquest vehicle ja està assignat en una altra línia')
    }
  }

  const changeRoleAt = (index: number, value: RoleSelectValue) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? patchRowRole(row, value) : row))
    )
  }

  const removeRowAt = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const addRowToGroup = (role: Role, groupId?: string) => {
    const resolvedGroupId = groupId || defaultGroupId
    const group = activeGroups.find((item) => item.id === resolvedGroupId)
    const newRow = createManualAssignRow({
      draft,
      role,
      groupId: config.usesGroups ? resolvedGroupId : undefined,
      startDate: group?.serviceDate || globalStartDate,
      startTime: group?.startTime || globalStartTime,
      endTime: group?.endTime || globalEndTime,
      meetingPoint: group?.meetingPoint || globalMeetingPoint,
    })
    setRows((prev) => [...prev, newRow])
  }

  const addRow = (role: Role) => {
    addRowToGroup(role, defaultGroupId)
  }

  const addGroup = () => {
    const source = activeGroups[activeGroups.length - 1] || null
    const nextGroup = createManualAssignGroup({
      draft,
      meetingPoint: globalMeetingPoint,
      startTime: globalStartTime,
      endTime: globalEndTime,
      source,
    })
    setGroups((prev) => [...ensureGroups(prev), nextGroup])
  }

  const removeGroup = (groupId: string) => {
    if (activeGroups.length <= 1) return
    setGroups((prev) => prev.filter((group) => group.id !== groupId))
    setRows((prev) => prev.filter((row) => row.groupId !== groupId))
  }

  const rowsForGroup = (groupId: string) =>
    rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => (row.groupId || defaultGroupId) === groupId)

  const applyGlobalToAll = () => {
    const applied = applyGlobalTimesToRows(
      rows,
      groups,
      config,
      globalStartDate,
      globalStartTime,
      globalEndTime,
      globalMeetingPoint,
      { applyMeetingPoint: true, applyStartDate: true }
    )
    setRows(applied.rows)
    setGroups(applied.groups)

    const count = applied.rows.length
    const summaryParts: string[] = []
    if (globalStartDate) summaryParts.unshift(globalStartDate.split('-').reverse().join('/'))
    if (globalStartTime && globalEndTime) {
      summaryParts.push(`${globalStartTime}–${globalEndTime}`)
    } else if (globalStartTime) {
      summaryParts.push(`inici ${globalStartTime}`)
    } else if (globalEndTime) {
      summaryParts.push(`fi ${globalEndTime}`)
    }
    if (globalMeetingPoint.trim()) summaryParts.push(globalMeetingPoint.trim())

    if (count === 0) {
      toast.info('Afegeix almenys una línia abans d’aplicar')
      return
    }

    toast.success(
      summaryParts.length > 0
        ? `Horari i lloc aplicats a ${count} ${count === 1 ? 'línia' : 'línies'} · ${summaryParts.join(' · ')}`
        : `Horari i lloc aplicats a ${count} ${count === 1 ? 'línia' : 'línies'}`
    )

    setAppliedFlash(true)
    if (appliedFlashTimerRef.current) clearTimeout(appliedFlashTimerRef.current)
    appliedFlashTimerRef.current = setTimeout(() => setAppliedFlash(false), 1600)
  }

  const buildGroupsForSave = () => {
    if (!config.usesGroups) return groups
    const base = ensureGroups(groups.length > 0 ? groups : activeGroups)
    return pruneEditorGroups({
      department,
      rows,
      groups: base.map((group) => {
        const groupId = String(group.id || '').trim()
        const groupRows = rows.filter((row) => (row.groupId || defaultGroupId) === groupId)
        const rowMeeting = groupRows.find((row) => String(row.meetingPoint || '').trim())?.meetingPoint
        return {
          ...group,
          meetingPoint: rowMeeting || group.meetingPoint || globalMeetingPoint,
          startTime: globalStartTime || group.startTime,
          endTime: globalEndTime || group.endTime,
        }
      }),
    })
  }

  const handleSave = async () => {
    const groupsToSave = buildGroupsForSave()
    const rowsToSave = applyGlobalTimesToRows(
      rows,
      groupsToSave,
      config,
      globalStartDate,
      globalStartTime,
      globalEndTime,
      globalMeetingPoint,
      { applyMeetingPoint: false, applyStartDate: false }
    ).rows

    const duplicateError = validateEditorRowsNoDuplicatePeople(rowsToSave)
    if (duplicateError) {
      toast.error(duplicateError)
      return
    }

    await saveDraftTable({
      draft: { ...draft, department },
      rows: rowsToSave,
      groups: groupsToSave,
      vestimentModel: config.showVestiment ? vestimentModel : null,
      onSaved: ({ savedRows, savedGroups }) => {
        setRows(savedRows)
        if (savedGroups) setGroups(savedGroups)
        baselineRef.current = JSON.stringify({
          rows: savedRows,
          groups: savedGroups || groupsToSave,
          globalStartDate,
          globalStartTime,
          globalEndTime,
          globalMeetingPoint,
          vestimentModel,
        })
      },
    })
    await onRefreshDrafts?.()
  }

  const handleConfirm = async () => {
    if (dirty) await handleSave()
    await confirmDraftTable({
      draft: { ...draft, department },
      onConfirmed: () => setConfirmed(true),
    })
    await onRefreshDrafts?.()
  }

  const handleUnconfirm = async () => {
    await unconfirmDraftTable({
      draft: { ...draft, department },
      onUnconfirmed: () => setConfirmed(false),
    })
    await onRefreshDrafts?.()
  }

  const handleDelete = async () => {
    const ok = await deleteDraftTable({ draft: { ...draft, department }, rows })
    if (ok) await onRefreshDrafts?.()
  }

  const roster = useMemo(
    () => [
      ...available.responsables,
      ...available.conductors,
      ...available.treballadors,
    ],
    [available.conductors, available.responsables, available.treballadors]
  )

  const renderManualRow = (row: Row, index: number) => {
    const assigned = getAssignedPeopleExcludingRow(rows, index, roster)
    const assignedVehicles = getAssignedVehiclesExcludingRow(rows, index)
    const filterPool = (pool: typeof available.responsables) =>
      filterPersonnelPool(pool, assigned)

    return (
      <ManualAssignRow
        key={`${row.role}-${row.id || 'new'}-${index}`}
        row={row}
        department={department}
        responsables={filterPool(available.responsables)}
        conductors={filterPool(available.conductors)}
        treballadors={filterPool(available.treballadors)}
        vehicles={filterVehiclePool(vehicles, assignedVehicles)}
        excludeEventId={draft.id}
        excludeIds={rows.filter((_, i) => i !== index).map((item) => item?.id).filter(Boolean)}
        excludeNames={rows.filter((_, i) => i !== index).map((item) => item?.name).filter(Boolean)}
        isLocked={isLocked}
        onPatch={(patch) => patchRowAt(index, patch)}
        onRoleChange={(value) => changeRoleAt(index, value)}
        onRemove={() => removeRowAt(index)}
      />
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <DraftManualToolbar
        startDate={globalStartDate}
        startTime={globalStartTime}
        endTime={globalEndTime}
        meetingPoint={globalMeetingPoint}
        vestimentModel={vestimentModel}
        vestimentOptions={serveisVestimentModels}
        showVestiment={config.showVestiment}
        loadingAvailability={available.loading}
        isLocked={isLocked}
        onStartDateChange={setGlobalStartDate}
        onStartTimeChange={setGlobalStartTime}
        onEndTimeChange={setGlobalEndTime}
        onMeetingPointChange={setGlobalMeetingPoint}
        onVestimentChange={setVestimentModel}
        onApplyToAll={applyGlobalToAll}
        onAddRow={addRow}
        showAddRowButtons={!config.usesGroups}
        showAddGroupButton={config.usesGroups}
        groupLabel={config.groupLabel}
        onAddGroup={addGroup}
      />

      {rows.length > 0 && (globalStartDate || globalStartTime || globalEndTime || globalMeetingPoint) ? (
        <p
          className={cn(
            'border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500 sm:px-4',
            appliedFlash && 'bg-blue-50/50 text-blue-700'
          )}
        >
          {config.usesGroups
            ? `${activeGroups.length} ${activeGroups.length === 1 ? groupLabelCapitalized.toLowerCase() : `${groupLabelCapitalized.toLowerCase()}s`} · `
            : ''}
          {rows.length} {rows.length === 1 ? 'línia' : 'línies'}
          {globalStartDate ? ` · ${globalStartDate.split('-').reverse().join('/')}` : ''}
          {globalStartTime || globalEndTime
            ? ` · ${globalStartTime || '—'}–${globalEndTime || '—'}`
            : ''}
          {globalMeetingPoint.trim() ? ` · ${globalMeetingPoint.trim()}` : ''}
        </p>
      ) : null}

      <div
        className={cn(
          'divide-y divide-slate-100 px-3 py-1 transition-colors duration-300 sm:px-4',
          appliedFlash && 'bg-blue-50/70 ring-1 ring-inset ring-blue-200/80'
        )}
      >
        {rows.length === 0 ? (
          <p className={cn('py-4 text-center text-sm text-slate-500')}>Afegeix una línia</p>
        ) : config.usesGroups ? (
          activeGroups.map((group, groupIndex) => {
            const groupId = String(group.id || `group-${groupIndex + 1}`)
            const groupRows = rowsForGroup(groupId)
            return (
              <section key={groupId} className="py-1">
                <div className="mb-1 flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    {config.groupLabel === 'cotxe' ? (
                      <Truck className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    ) : (
                      <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    )}
                    <span>
                      {groupLabelCapitalized} {groupIndex + 1}
                    </span>
                    {groupRows.length > 0 ? (
                      <span className="font-normal text-slate-500">
                        · {groupRows.length} {groupRows.length === 1 ? 'persona' : 'persones'}
                      </span>
                    ) : null}
                  </div>
                  {!isLocked && activeGroups.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeGroup(groupId)}
                      className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>

                {groupRows.length === 0 ? (
                  <p className="py-2 pl-2 text-xs text-slate-400">Sense personal en aquest {groupLabelCapitalized.toLowerCase()}</p>
                ) : (
                  groupRows.map(({ row, index }) => renderManualRow(row, index))
                )}

                {!isLocked ? (
                  <div className="mt-1 flex flex-wrap gap-1.5 pb-2 pl-1">
                    <button
                      type="button"
                      onClick={() => addRowToGroup('responsable', groupId)}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-200"
                    >
                      <GraduationCap className="h-3 w-3" aria-hidden />
                      Responsable
                    </button>
                    <button
                      type="button"
                      onClick={() => addRowToGroup('conductor', groupId)}
                      className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800 hover:bg-orange-200"
                    >
                      <Truck className="h-3 w-3" aria-hidden />
                      Conductor
                    </button>
                    <button
                      type="button"
                      onClick={() => addRowToGroup('treballador', groupId)}
                      className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 hover:bg-green-200"
                    >
                      <User className="h-3 w-3" aria-hidden />
                      Treballador
                    </button>
                  </div>
                ) : null}
              </section>
            )
          })
        ) : (
          rows.map((row, index) => renderManualRow(row, index))
        )}
      </div>

      <div className="flex justify-end border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 sm:px-4">
        <DraftActions
          confirmed={confirmed}
          confirming={false}
          dirty={dirty}
          onConfirm={handleConfirm}
          onUnconfirm={handleUnconfirm}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
