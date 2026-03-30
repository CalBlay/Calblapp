// file: src/app/menu/quadrants/drafts/components/DraftsTable.tsx
'use client'

import React, { useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAvailablePersonnel } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import { ChevronDown, ChevronRight, Truck } from 'lucide-react'

// Subcomponents
import DraftRow from './DraftRow'
import DraftActions from './DraftActions'
import DraftsTableDesktop from './DraftsTableDesktop'
import DraftsTableMobile from './DraftsTableMobile'

import type { Role } from './types'
import type { DraftInput, Row } from './types'
import {
  buildInitialRowsBase,
  buildStructuredGroups,
  normalizeDraftText,
} from './draftsTableUtils'
import {
  confirmDraftTable,
  deleteDraftTable,
  saveDraftTable,
  unconfirmDraftTable,
} from './draftsTableActions'
import {
  buildDisplayItems,
  getMergedPresentation,
  renderMergedToggle,
  roleIconMap,
  type DisplayItem,
} from './draftsTableDisplayUtils'

type Vehicle = {
  id: string
  plate: string
  type: string
  available: boolean
}

export default function DraftsTable({
  draft,
}: {
  draft: DraftInput
}) {
  const normalizeDraftLocation = (value: DraftInput['location']) => {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
      const candidate =
        (value as Record<string, unknown>).address ??
        (value as Record<string, unknown>).location ??
        (value as Record<string, unknown>).text ??
        (value as Record<string, unknown>).label ??
        (value as Record<string, unknown>).name
      return typeof candidate === 'string' ? candidate : ''
    }
    return ''
  }
  const { data: session } = useSession()
  const department =
    (draft.department ||
      (session?.user && 'department' in session.user ? session.user.department : '') ||
      ''
    ).toLowerCase()
  const isCuinaDept = department === 'cuina'

  const defaultMeetingPoint = draft.meetingPoint || ''
  const eventLocationText = normalizeDraftLocation(draft.location)
  const structuredGroups = useMemo(() => buildStructuredGroups(draft.groups), [draft.groups])
  const isServeisDept = department === 'serveis'
  const [groupDefs, setGroupDefs] = useState(structuredGroups)
  const hasStructuredGroups = groupDefs.length > 0

  const norm = normalizeDraftText
  const initialRowsBase: Row[] = buildInitialRowsBase({
    draft,
    hasStructuredGroups,
    groupDefs,
    defaultMeetingPoint,
    department,
    isCuinaDept,
    isServeisDept,
  })
  const initialRows: Row[] = initialRowsBase

  const [rows, setRows] = useState<Row[]>(initialRows)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const initialRef = useRef(JSON.stringify({ rows: initialRows, groups: structuredGroups }))
  const dirty = JSON.stringify({ rows, groups: groupDefs }) !== initialRef.current
  const [expandedMerged, setExpandedMerged] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  React.useEffect(() => {
    setGroupDefs(structuredGroups)
    setRows(initialRows)
    initialRef.current = JSON.stringify({ rows: initialRows, groups: structuredGroups })
    setCollapsedGroups(new Set())
  }, [structuredGroups, draft.id])

  // --- Estat de confirmaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³
  const [confirmed, setConfirmed] = useState<boolean>(
    draft.status === 'confirmed'
  )
  const [confirming] = useState(false) // ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€¹Ã¢â‚¬Â  eliminat setConfirming no usat
  const isLocked = confirmed || confirming

  // --- Personal disponible
  const available = useAvailablePersonnel({
    departament: department,
    startDate: draft.startDate,
    endDate: draft.endDate,
    startTime: draft.startTime,
    endTime: draft.endTime,
    excludeEventId: draft.id,
    excludeIds: rows
      .filter((_, idx) => idx !== editIdx)
      .map((r) => r?.id)
      .filter(Boolean),
    excludeNames: rows
      .filter((_, idx) => idx !== editIdx)
      .map((r) => r?.name)
      .filter(Boolean),
  })

  // --- Comptadors (ara eliminats del render, perÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â² ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âºtils si es necessiten mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©s tard)
  useMemo(
    () => ({
      responsables: rows.filter((r) => r?.role === 'responsable').length,
      conductors: rows.filter((r) => r?.role === 'conductor').length,
      treballadors: rows.filter((r) => r?.role === 'treballador').length,
    }),
    [rows]
  )

  useMemo(
    () => ({
      responsables: draft.responsablesNeeded || 1,
      conductors: draft.numDrivers || 0,
      treballadors: draft.totalWorkers || 0,
    }),
    [draft]
  )

  // --- Vehicles disponibles (per logÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­stica/cuines)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  React.useEffect(() => {
    const dept = department?.toLowerCase?.() || ''
    if (!(dept === 'logistica' || dept === 'cuina')) {
      setVehicles([])
      return
    }
    if (!draft.startDate || !draft.endDate || !draft.startTime || !draft.endTime) {
      setVehicles([])
      return
    }

    const controller = new AbortController()
    fetch('/api/transports/available', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: draft.startDate,
        startTime: draft.startTime,
        endDate: draft.endDate,
        endTime: draft.endTime,
        department: dept,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('No es poden carregar vehicles')
        const json = await res.json()
        setVehicles(Array.isArray(json?.vehicles) ? json.vehicles : [])
      })
      .catch(() => setVehicles([]))

    return () => controller.abort()
  }, [department, draft.startDate, draft.endDate, draft.startTime, draft.endTime])

  const availableForEditor = {
    responsables: available.responsables,
    conductors: available.conductors,
    treballadors: available.treballadors,
    vehicles,
  }

  // --- Callbacks (API routes)
  const handleSaveAll = async (rowsOverride?: Row[]) => {
    await saveDraftTable({
      draft,
      rows: rowsOverride ?? rows,
      groups: groupDefs,
      onSaved: (cleanedRows) => {
        setRows(cleanedRows)
        setEditIdx(null)
        initialRef.current = JSON.stringify({ rows: cleanedRows, groups: groupDefs })
      },
    })
  }

  const handleConfirm = async () => {
    await confirmDraftTable({
      draft,
      onConfirmed: () => setConfirmed(true),
    })
  }

  const handleUnconfirm = async () => {
    await unconfirmDraftTable({
      draft,
      onUnconfirmed: () => setConfirmed(false),
    })
  }

  const handleDeleteQuadrant = async () => {
    await deleteDraftTable({ draft, rows })
  }

  const startEdit = (i: number) => {
    const targetRow = rows[i]
    if (targetRow?.groupId) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        next.delete(targetRow.groupId!)
        return next
      })
    }
    setEditIdx(i)
  }
  const endEdit = () => setEditIdx(null)
  const patchRow = (patch: Partial<Row>) => {
    if (editIdx === null) return
    const currentRow = rows[editIdx]
    if (!currentRow) return

    const nextRow = { ...currentRow, ...patch } as Row

    setRows((rs) =>
      rs.map((row, idx) => {
        if (idx === editIdx) return nextRow

        const sameGroup =
          isServeisDept &&
          currentRow.groupId &&
          row.groupId === currentRow.groupId
        const groupControlledByDriver = Boolean(
          isServeisDept && currentRow.groupId && groupHasDriverController(currentRow.groupId)
        )
        const freeGroupMeetingPoint = Boolean(
          isServeisDept && currentRow.groupId && !groupControlledByDriver
        )

        const conductorEdited =
          currentRow.role === 'conductor' ||
          (currentRow.role === 'responsable' && currentRow.isDriver)

        const isCompanion =
          row.role === 'treballador' ||
          (row.role === 'responsable' && !row.isDriver)

        if (sameGroup && conductorEdited && isCompanion) {
          return {
            ...row,
            startDate: nextRow.startDate,
            startTime: nextRow.startTime,
            arrivalTime: nextRow.arrivalTime,
            meetingPoint: nextRow.meetingPoint,
          }
        }

        if (
          sameGroup &&
          freeGroupMeetingPoint &&
          (patch.meetingPoint !== undefined || patch.arrivalTime !== undefined)
        ) {
          return {
            ...row,
            meetingPoint:
              patch.meetingPoint !== undefined ? nextRow.meetingPoint : row.meetingPoint,
            arrivalTime:
              patch.arrivalTime !== undefined ? nextRow.arrivalTime : row.arrivalTime,
          }
        }

        return row
      })
    )

    if (isServeisDept && currentRow.groupId) {
      const relevantGroupPatch: Record<string, unknown> = {}
      if (patch.startDate !== undefined) relevantGroupPatch.serviceDate = patch.startDate
      if (patch.startTime !== undefined) relevantGroupPatch.startTime = patch.startTime
      if (patch.endTime !== undefined) relevantGroupPatch.endTime = patch.endTime
      if (patch.arrivalTime !== undefined) relevantGroupPatch.arrivalTime = patch.arrivalTime
      if (patch.meetingPoint !== undefined) relevantGroupPatch.meetingPoint = patch.meetingPoint

      if (Object.keys(relevantGroupPatch).length > 0) {
        setGroupDefs((prev) =>
          prev.map((group) =>
            group.id === currentRow.groupId ? { ...group, ...relevantGroupPatch } : group
          )
        )
      }
    }
  }

  const revertRow = () => {
    if (editIdx === null) return
    const original = initialRows[editIdx]
    if (!original) {
      setRows((rs) => rs.filter((_, idx) => idx !== editIdx))
      setEditIdx(null)
      return
    }
    setRows((rs) => {
      const copy = [...rs]
      copy[editIdx] = original // torna a lÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢estat inicial
      return copy
    })
    setEditIdx(null)
  }

  const deleteRow = async (index: number) => {
    const next = rows.filter((_, idx) => idx !== index)
    setRows(next)
    setEditIdx(null)
    await handleSaveAll(next)
  }

  const showStructuredGroups = hasStructuredGroups

  const toggleMerged = (key: string) =>
    setExpandedMerged((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const renderDisplayItems = (items: DisplayItem[]) =>
    items.map((item) =>
      item.type === 'single' ? (
        renderRow(item.row, item.index)
      ) : expandedMerged.has(item.key) ? (
        item.rows.map((r) => renderRow(r.row, r.index))
      ) : (
        <React.Fragment key={item.key}>
          {renderMergedRowDesktop(item)}
        </React.Fragment>
      )
    )

  const renderMergedRowDesktop = (item: Extract<DisplayItem, { type: 'merged' }>) => {
    const { roles, primary } = getMergedPresentation(item)
    const isExpanded = expandedMerged.has(item.key)
    const jamoneroBadge = primary.isJamonero ? (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        Jamonero
      </span>
    ) : null

    return (
      <div
        className="border-b border-slate-200 px-2 py-3 hover:bg-slate-50 grid gap-2 grid-cols-1 sm:grid-cols-[40px_minmax(11rem,1fr)_5rem_4.5rem_4.5rem_4.5rem_minmax(8rem,0.9fr)_4.5rem_3.5rem] items-center"
      >
        <div className="hidden sm:flex items-center justify-center gap-1">
          {roles.map((role) => (
            <span key={role}>{roleIconMap[role]}</span>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-2 truncate text-[14px] font-medium text-slate-800">
          <span className="truncate">{primary.name || <span className="italic text-gray-400">Sense nom</span>}</span>
          {jamoneroBadge}
        </div>
        <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">
          {primary.startDate ? primary.startDate.split('-').slice(1).reverse().join('/') : '--/--'}
        </div>
        <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">
          {primary.startTime ? primary.startTime.substring(0, 5) : '--:--'}
        </div>
        <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">
          {primary.endTime ? primary.endTime.substring(0, 5) : '--:--'}
        </div>
        <div className="hidden sm:block w-[5.5rem] tabular-nums text-[14px] text-slate-700">
          {primary.arrivalTime ? primary.arrivalTime.substring(0, 5) : '--:--'}
        </div>
        <div className="hidden sm:block truncate text-[14px] text-slate-700">
          {primary.meetingPoint || <span className="text-gray-400">-</span>}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[14px] font-medium text-slate-700">
          {primary.role === 'conductor' ? (
            <>
              <span>{primary.plate || '-'}</span>
              <Truck className="w-5 h-5 text-gray-500" />
            </>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
        <div className="hidden sm:flex justify-center">
          <button
            onClick={() => toggleMerged(item.key)}
            className="text-gray-500 hover:text-gray-700"
            title={isExpanded ? 'Amaga rols' : 'Mostra rols'}
          >
            {renderMergedToggle(isExpanded)}
          </button>
        </div>
      </div>
    )
  }

  const renderMergedRowMobile = (item: Extract<DisplayItem, { type: 'merged' }>) => {
    const { roles, primary } = getMergedPresentation(item)
    const isExpanded = expandedMerged.has(item.key)
    const jamoneroBadge = primary.isJamonero ? (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        Jamonero
      </span>
    ) : null

    return (
      <div className="p-3 text-sm border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {roles.map((role) => (
              <span key={role}>{roleIconMap[role]}</span>
            ))}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-gray-800">{primary.name || '-'}</div>
              {jamoneroBadge}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              {primary.startDate ? primary.startDate.split('-').slice(1).reverse().join('/') : '--/--'}
              {' - '}
              {primary.startTime ? primary.startTime.substring(0, 5) : '--:--'}
              {' - '}
              {primary.endTime ? primary.endTime.substring(0, 5) : '--:--'}
              {' - '}
              {primary.arrivalTime ? primary.arrivalTime.substring(0, 5) : '--:--'}
            </div>
          </div>
          <button
            onClick={() => toggleMerged(item.key)}
            className="text-gray-500 hover:text-gray-700"
            title={isExpanded ? 'Amaga rols' : 'Mostra rols'}
          >
            {renderMergedToggle(isExpanded)}
          </button>
        </div>
      </div>
    )
  }

  const renderDisplayItemsMobile = (items: DisplayItem[]) =>
    items.map((item) =>
      item.type === 'single' ? (
        <div key={`${item.row.role}-${item.row.id || 'noid'}-${item.index}`} className="p-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-800">{item.row.name || '-'}</span>
            <span className="text-xs text-gray-500">{item.row.role}</span>
          </div>
          <div className="text-xs text-gray-600 mt-1 space-y-0.5">
            <div>Data: {item.row.startDate}</div>
            <div>Hora: {item.row.startTime || '-'}</div>
            <div>Punt: {item.row.meetingPoint || '-'}</div>
            {item.row.vehicleType && <div>Vehicle: {item.row.vehicleType}</div>}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => startEdit(item.index)}
              className="px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs"
            >
              Edita
            </button>
            <button
              onClick={() => deleteRow(item.index)}
              className="px-2 py-1 rounded-md bg-red-100 text-red-700 text-xs"
            >
              Elimina
            </button>
          </div>
        </div>
      ) : expandedMerged.has(item.key) ? (
        item.rows.map((r) => renderRow(r.row, r.index))
      ) : (
        <React.Fragment key={item.key}>
          {renderMergedRowMobile(item)}
        </React.Fragment>
      )
    )

  const renderRow = (r: Row, i: number) => (
    <DraftRow
      key={`${r.role}-${r.id || 'noid'}-${i}`}
      row={r}
      isLocked={isLocked}
      isActive={editIdx === i}
      onEdit={() => startEdit(i)}
      onDelete={() => deleteRow(i)}
    />
  )

  const defaultGroup = hasStructuredGroups ? groupDefs[0] : undefined
  const defaultGroupId = hasStructuredGroups ? groupDefs[0]?.id : undefined
  const defaultGroupStartTime = defaultGroup?.startTime || draft.startTime
  const defaultGroupEndTime = defaultGroup?.endTime || draft.endTime
  const defaultGroupArrivalTime = defaultGroup?.arrivalTime || draft.arrivalTime
  const defaultGroupMeetingPoint = defaultGroup?.meetingPoint || draft.meetingPoint || ''
  const showConductorButtons = !isServeisDept
  const canManageGroups = isServeisDept || isCuinaDept
  const currentEditingRow = editIdx !== null ? rows[editIdx] || null : null
  const hasInlineEditor = Boolean(currentEditingRow && editIdx !== null)
  const isGroupCollapsed = (groupId?: string | null) =>
    Boolean(groupId) && collapsedGroups.has(groupId)
  const toggleGroupCollapsed = (groupId?: string | null) => {
    if (!groupId) return
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }
  const groupHasDriverController = (groupId?: string) => {
    if (!isServeisDept || !groupId) return false
    return rows.some(
      (row) =>
        row.groupId === groupId &&
        (row.role === 'conductor' || (row.role === 'responsable' && row.isDriver))
    )
  }
  const canEditMeetingPoint = (row: Row | null) => {
    if (!row || !isServeisDept || !row.groupId) return true
    const controlsMeetingPoint =
      row.role === 'conductor' || (row.role === 'responsable' && row.isDriver)
    return controlsMeetingPoint || !groupHasDriverController(row.groupId)
  }
  const canEditArrivalTime = (row: Row | null) => {
    if (!row || !isServeisDept || !row.groupId) return true
    const controlsArrivalTime =
      row.role === 'conductor' || (row.role === 'responsable' && row.isDriver)
    return controlsArrivalTime || !groupHasDriverController(row.groupId)
  }

  const addRowToGroup = (role: Role, groupId?: string) => {
    if (groupId) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    }
    const group = hasStructuredGroups
      ? groupDefs.find((item) => item.id === groupId) || defaultGroup
      : undefined
    const groupStart = group?.startTime || defaultGroupStartTime || ''
    const groupEnd = group?.endTime || defaultGroupEndTime || ''
    const groupArrival = group?.arrivalTime || defaultGroupArrivalTime || ''
    const groupMeeting = group?.meetingPoint || defaultGroupMeetingPoint

    setRows([
      ...rows,
      {
        id: '',
        name: '',
        role,
        startDate: draft.startDate,
        endDate: draft.endDate,
        startTime: groupStart,
        endTime: groupEnd,
        meetingPoint: groupMeeting,
        arrivalTime: groupArrival,
        plate: '',
        vehicleType: '',
        groupId,
      },
    ])
  }

  const addEttRow = (groupId?: string) => {
    if (groupId) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    }
    const group = hasStructuredGroups
      ? groupDefs.find((item) => item.id === groupId) || defaultGroup
      : undefined
    const groupStart = group?.startTime || defaultGroupStartTime || ''
    const groupEnd = group?.endTime || defaultGroupEndTime || ''
    const groupArrival = group?.arrivalTime || defaultGroupArrivalTime || ''
    const groupMeeting = group?.meetingPoint || defaultGroupMeetingPoint

    setRows([
      ...rows,
      {
        id: '',
        name: 'ETT',
        isExternal: true,
        role: 'treballador',
        startDate: draft.startDate,
        endDate: draft.endDate,
        startTime: groupStart,
        endTime: groupEnd,
        meetingPoint: groupMeeting,
        arrivalTime: groupArrival,
        plate: '',
        vehicleType: '',
        groupId,
      },
    ])
  }

  const addJamoneroRow = (groupId?: string) => {
    if (groupId) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    }
    const group = hasStructuredGroups
      ? groupDefs.find((item) => item.id === groupId) || defaultGroup
      : undefined
    const groupStart = group?.startTime || defaultGroupStartTime || ''
    const groupEnd = group?.endTime || defaultGroupEndTime || ''
    const groupArrival = group?.arrivalTime || defaultGroupArrivalTime || ''
    const groupMeeting = group?.meetingPoint || defaultGroupMeetingPoint

    setRows([
      ...rows,
      {
        id: '',
        name: '',
        isJamonero: true,
        role: 'treballador',
        startDate: draft.startDate,
        endDate: draft.endDate,
        startTime: groupStart,
        endTime: groupEnd,
        meetingPoint: groupMeeting,
        arrivalTime: groupArrival,
        plate: '',
        vehicleType: '',
        groupId,
      },
    ])
  }

  const addGroup = () => {
    const source = groupDefs[groupDefs.length - 1] || defaultGroup
    const nextId = `group-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    setGroupDefs((prev) => [
      ...prev,
      {
        id: nextId,
        serviceDate: source?.serviceDate || draft.startDate,
        dateLabel: source?.dateLabel || null,
        meetingPoint: source?.meetingPoint || defaultMeetingPoint,
        startTime: source?.startTime || draft.startTime,
        endTime: source?.endTime || draft.endTime,
        arrivalTime: source?.arrivalTime || draft.arrivalTime || null,
        workers: 0,
        drivers: 0,
        needsDriver: false,
        driverId: null,
        driverName: null,
        responsibleId: null,
        responsibleName: null,
      },
    ])
  }

  const addCenterExternalExtra = (groupId?: string) => {
    if (groupId) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    }
    const group = hasStructuredGroups
      ? groupDefs.find((item) => item.id === groupId) || defaultGroup
      : undefined
    const groupStart = group?.startTime || defaultGroupStartTime || ''
    const groupEnd = group?.endTime || defaultGroupEndTime || ''
    const groupArrival = group?.arrivalTime || defaultGroupArrivalTime || ''
    const groupMeeting = eventLocationText || group?.meetingPoint || defaultGroupMeetingPoint

    setRows([
      ...rows,
      {
        id: '',
        name: 'Extra',
        isCenterExternalExtra: true,
        role: 'treballador',
        startDate: draft.startDate,
        endDate: draft.endDate,
        startTime: groupStart,
        endTime: groupEnd,
        meetingPoint: groupMeeting,
        arrivalTime: groupArrival,
        plate: '',
        vehicleType: '',
        groupId,
      },
    ])
  }

  const removeGroup = (groupId: string) => {
    setGroupDefs((prev) => prev.filter((group) => group.id !== groupId))
    setRows((prev) => prev.filter((row) => row.groupId !== groupId))
    setEditIdx((current) => {
      if (current === null) return null
      const currentRow = rows[current]
      if (!currentRow || currentRow.groupId !== groupId) return current
      return null
    })
  }

  return (
  <div
    className={`w-full rounded-xl border border-slate-200 bg-white/95 ${
      hasInlineEditor ? '' : 'lg:max-w-[64%] lg:mx-auto'
    }`}
  >
    <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
      <DraftActions
        confirmed={confirmed}
        confirming={confirming}
        dirty={dirty}
        onConfirm={handleConfirm}
        onUnconfirm={handleUnconfirm}
        onSave={() => handleSaveAll()}
        onDelete={handleDeleteQuadrant}
      />
    </div>

    <DraftsTableDesktop
      hasInlineEditor={hasInlineEditor}
      currentEditingRow={currentEditingRow}
      groupDefs={groupDefs}
      isLocked={isLocked}
      isServeisDept={isServeisDept}
      isCuinaDept={isCuinaDept}
      canManageGroups={canManageGroups}
      showStructuredGroups={showStructuredGroups}
      showConductorButtons={showConductorButtons}
      rows={rows}
      renderRow={renderRow}
      availableForEditor={availableForEditor}
      renderDisplayItems={renderDisplayItems}
      canEditMeetingPoint={canEditMeetingPoint}
      canEditArrivalTime={canEditArrivalTime}
      groupHasDriverController={groupHasDriverController}
      addRowToGroup={addRowToGroup}
      addJamoneroRow={addJamoneroRow}
      addEttRow={addEttRow}
      addCenterExternalExtra={addCenterExternalExtra}
      isGroupCollapsed={isGroupCollapsed}
      toggleGroupCollapsed={toggleGroupCollapsed}
      groupHeaderToggleIcon={(groupId) =>
        isGroupCollapsed(groupId) ? <ChevronRight size={16} /> : <ChevronDown size={16} />
      }
      removeGroup={removeGroup}
      addGroup={addGroup}
      patchRow={patchRow}
      endEdit={endEdit}
      revertRow={revertRow}
    />

    <DraftsTableMobile
      currentEditingRow={currentEditingRow}
      editIdx={editIdx}
      groupDefs={groupDefs}
      isLocked={isLocked}
      isServeisDept={isServeisDept}
      isCuinaDept={isCuinaDept}
      canManageGroups={canManageGroups}
      showStructuredGroups={showStructuredGroups}
      showConductorButtons={showConductorButtons}
      rows={rows}
      defaultGroupId={defaultGroupId}
      availableForEditor={availableForEditor}
      renderDisplayItemsMobile={renderDisplayItemsMobile}
      canEditMeetingPoint={canEditMeetingPoint}
      canEditArrivalTime={canEditArrivalTime}
      groupHasDriverController={groupHasDriverController}
      addRowToGroup={addRowToGroup}
      addJamoneroRow={addJamoneroRow}
      addEttRow={addEttRow}
      addCenterExternalExtra={addCenterExternalExtra}
      isGroupCollapsed={isGroupCollapsed}
      toggleGroupCollapsed={toggleGroupCollapsed}
      groupHeaderToggleIcon={(groupId) =>
        isGroupCollapsed(groupId) ? <ChevronRight size={16} /> : <ChevronDown size={16} />
      }
      removeGroup={removeGroup}
      addGroup={addGroup}
      startEdit={startEdit}
      deleteRow={deleteRow}
      patchRow={patchRow}
      endEdit={endEdit}
      revertRow={revertRow}
    />
  </div>
)

}



