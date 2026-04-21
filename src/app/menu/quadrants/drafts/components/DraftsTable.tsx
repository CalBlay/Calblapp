// file: src/app/menu/quadrants/drafts/components/DraftsTable.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAvailablePersonnel } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import { ChevronDown, ChevronRight, Truck } from 'lucide-react'

// Subcomponents
import DraftRow from './DraftRow'
import DraftActions from './DraftActions'
import DraftsTableDesktop from './DraftsTableDesktop'
import DraftsTableMobile from './DraftsTableMobile'
import RowEditor from './RowEditor'

import type { Role } from './types'
import type { DraftInput, Row } from './types'
import {
  normalizeDraftText,
  pruneEditorGroups,
} from '@/lib/quadrantsDraftEditor'
import { mapDraftToEditorModel } from '@/lib/quadrantsDraftAdapters'
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
import { syncRowsWithDraftAndRoster } from './draftsRowSync'

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
  const eventLocationText = normalizeDraftLocation(draft.location)
  const editorModel = useMemo(() => mapDraftToEditorModel({ ...draft, department }), [draft, department])
  const { groups: structuredGroups, rows: initialRows, isServeisDept, defaultMeetingPoint } = editorModel
  const [groupDefs, setGroupDefs] = useState(structuredGroups)
  const hasStructuredGroups = groupDefs.length > 0

  const norm = normalizeDraftText

  const [rows, setRows] = useState<Row[]>(initialRows)
  const rowsRef = useRef<Row[]>(initialRows)
  const groupDefsRef = useRef(groupDefs)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  /** Baseline del document (sense overlay de roster); permet detectar desalineacions id/nom i activar Desar. */
  const initialRef = useRef(JSON.stringify({ rows: initialRows, groups: structuredGroups }))
  const initialVestimentModelRef = useRef(String(draft.vestimentModel || '').trim())
  const [serveisVestimentModels, setServeisVestimentModels] = useState<string[]>([])
  const [vestimentModelChoice, setVestimentModelChoice] = useState<string>(
    String(draft.vestimentModel || '').trim()
  )
  const rowsAndGroupsDirty = JSON.stringify({ rows, groups: groupDefs }) !== initialRef.current
  const vestimentDirty = vestimentModelChoice !== initialVestimentModelRef.current
  const dirty = rowsAndGroupsDirty || vestimentDirty
  const prevDraftHydrationKeyRef = useRef('')
  const [expandedMerged, setExpandedMerged] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const setRowsState = (next: React.SetStateAction<Row[]>) => {
    setRows((prev) => {
      const resolved = typeof next === 'function' ? (next as (value: Row[]) => Row[])(prev) : next
      rowsRef.current = resolved
      return resolved
    })
  }

  const setGroupDefsState = (
    next: React.SetStateAction<typeof groupDefs>
  ) => {
    setGroupDefs((prev) => {
      const resolved =
        typeof next === 'function'
          ? (next as (value: typeof groupDefs) => typeof groupDefs)(prev)
          : next
      groupDefsRef.current = resolved
      return resolved
    })
  }

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

  const draftPeopleFp = useMemo(
    () =>
      JSON.stringify({
        c: (Array.isArray(draft.conductors) ? draft.conductors : []).map((x: Record<string, unknown>) => [
          x?.id,
          x?.name,
          x?.plate,
          x?.vehicleType,
          x?.arrivalTime,
        ]),
        t: (Array.isArray(draft.treballadors) ? draft.treballadors : []).map((x: Record<string, unknown>) => [
          x?.id,
          x?.name,
        ]),
        rid: (draft as Record<string, unknown>).responsableId,
        rname: (draft as Record<string, unknown>).responsableName,
      }),
    [
      draft.conductors,
      draft.treballadors,
      (draft as Record<string, unknown>).responsableId,
      (draft as Record<string, unknown>).responsableName,
    ]
  )

  const initialRowsFp = useMemo(
    () =>
      JSON.stringify(
        initialRows.map((r) => [
          r.role,
          r.id,
          r.name,
          r.plate,
          r.groupId,
          r.startTime,
          r.endTime,
        ])
      ),
    [initialRows]
  )

  const structuredGroupsFp = useMemo(
    () => JSON.stringify(structuredGroups),
    [structuredGroups]
  )

  const hydrationKey = useMemo(
    () =>
      `${String(draft.id || '')}|${String(draft.updatedAt || '')}|${String(
        draft.status || ''
      )}|${draftPeopleFp}|${initialRowsFp}|${structuredGroupsFp}`,
    [draft.id, draft.updatedAt, draft.status, draftPeopleFp, initialRowsFp, structuredGroupsFp]
  )

  const rosterFp = useMemo(
    () =>
      JSON.stringify({
        r: (available.responsables || []).map((p) => [p.id, p.name]),
        c: (available.conductors || []).map((p) => [p.id, p.name]),
        t: (available.treballadors || []).map((p) => [p.id, p.name]),
      }),
    [available.responsables, available.conductors, available.treballadors]
  )

  useEffect(() => {
    const lists = {
      responsables: available.responsables,
      conductors: available.conductors,
      treballadors: available.treballadors,
    }
    const fullReset = hydrationKey !== prevDraftHydrationKeyRef.current
    if (fullReset) {
      prevDraftHydrationKeyRef.current = hydrationKey
      groupDefsRef.current = structuredGroups
      setGroupDefs(structuredGroups)
      initialRef.current = JSON.stringify({ rows: initialRows, groups: structuredGroups })
      setCollapsedGroups(new Set())
      const next = syncRowsWithDraftAndRoster(initialRows, draft, lists)
      rowsRef.current = next
      setRows(next)
      return
    }

    setRows((prev) => {
      const next = syncRowsWithDraftAndRoster(prev, draft, lists)
      rowsRef.current = next
      return next
    })
    // hydrationKey captura canvis del document; rosterFp quan arriba el personal disponible
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft/initialRows/structuredGroups/available via clausura del render actual
  }, [hydrationKey, rosterFp])

  useEffect(() => {
    const nextVestiment = String(draft.vestimentModel || '').trim()
    initialVestimentModelRef.current = nextVestiment
    setVestimentModelChoice(nextVestiment)
  }, [draft.id, draft.updatedAt, draft.vestimentModel])

  useEffect(() => {
    if (!isServeisDept) {
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
          ? (json.premises.vestimentModels as string[]).map((item) => String(item || '').trim()).filter(Boolean)
          : []
        setServeisVestimentModels(models)
      } catch {
        if (!cancelled) setServeisVestimentModels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isServeisDept])

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
    const rowsToSave = (rowsOverride ?? rowsRef.current).filter(
      (row) => row.name?.trim() !== '' || row.id?.trim() !== ''
    )
    const groupsToSave = pruneEditorGroups({
      department,
      rows: rowsToSave,
      groups: groupDefsRef.current,
    })
    await saveDraftTable({
      draft,
      rows: rowsToSave,
      groups: groupsToSave,
      vestimentModel: vestimentModelChoice || null,
      onSaved: (cleanedRows) => {
        rowsRef.current = cleanedRows
        groupDefsRef.current = groupsToSave
        setRows(cleanedRows)
        setGroupDefs(groupsToSave)
        setEditIdx(null)
        initialRef.current = JSON.stringify({ rows: cleanedRows, groups: groupsToSave })
        initialVestimentModelRef.current = vestimentModelChoice
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
    await deleteDraftTable({ draft, rows: rowsRef.current })
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
    const currentGroupId = currentRow.groupId

    setRowsState((rs) =>
      rs.map((row, idx) => {
        if (idx === editIdx) {
          return { ...row, ...patch } as Row
        }

        const latestCurrentRow = rs[editIdx]
        if (!latestCurrentRow) return row
        const nextRow = { ...latestCurrentRow, ...patch } as Row

        const sameGroup =
          isServeisDept &&
          latestCurrentRow.groupId &&
          row.groupId === latestCurrentRow.groupId
        const groupControlledByDriver = Boolean(
          isServeisDept && latestCurrentRow.groupId && groupHasDriverController(latestCurrentRow.groupId)
        )
        const freeGroupMeetingPoint = Boolean(
          isServeisDept && latestCurrentRow.groupId && !groupControlledByDriver
        )

        const conductorEdited =
          latestCurrentRow.role === 'conductor' ||
          (latestCurrentRow.role === 'responsable' && latestCurrentRow.isDriver)

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

    if (isServeisDept && currentGroupId) {
      const relevantGroupPatch: Record<string, unknown> = {}
      if (patch.startDate !== undefined) relevantGroupPatch.serviceDate = patch.startDate
      if (patch.startTime !== undefined) relevantGroupPatch.startTime = patch.startTime
      if (patch.endTime !== undefined) relevantGroupPatch.endTime = patch.endTime
      if (patch.arrivalTime !== undefined) relevantGroupPatch.arrivalTime = patch.arrivalTime
      if (patch.meetingPoint !== undefined) relevantGroupPatch.meetingPoint = patch.meetingPoint

      if (Object.keys(relevantGroupPatch).length > 0) {
        setGroupDefsState((prev) =>
          prev.map((group) =>
            group.id === currentGroupId ? { ...group, ...relevantGroupPatch } : group
          )
        )
      }
    }
  }

  const revertRow = () => {
    if (editIdx === null) return
    const original = initialRows[editIdx]
    if (!original) {
      setRowsState((rs) => rs.filter((_, idx) => idx !== editIdx))
      setEditIdx(null)
      return
    }
    setRowsState((rs) => {
      const copy = [...rs]
      copy[editIdx] = original // torna a lÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢estat inicial
      return copy
    })
    setEditIdx(null)
  }

  const deleteRow = async (index: number) => {
    const next = rows.filter((_, idx) => idx !== index)
    rowsRef.current = next
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
        className="border-b border-slate-200 px-2 py-3 hover:bg-slate-50 grid gap-2 grid-cols-1 sm:grid-cols-[40px_minmax(11rem,1fr)_5rem_4.5rem_4.5rem_4.5rem_minmax(0,1fr)_3.5rem] items-center"
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
        <div className="hidden sm:flex min-w-0 items-center gap-x-2.5 gap-y-1 text-[14px] text-slate-700">
          <span className="truncate font-medium" title={primary.meetingPoint || undefined}>
            {primary.meetingPoint || <span className="text-gray-400">-</span>}
          </span>
          {primary.role === 'conductor' ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-slate-800">
              <span className="tabular-nums">{primary.plate || '-'}</span>
              <Truck className="h-5 w-5 shrink-0 text-gray-500" />
            </span>
          ) : null}
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

  const renderRow = (r: Row, i: number) => {
    const isActive = editIdx === i
    return (
      <React.Fragment key={`${r.role}-${r.id || 'noid'}-${i}`}>
        <div className={isActive ? 'lg:grid lg:grid-cols-[minmax(0,64%)_minmax(360px,36%)] lg:items-start lg:gap-3' : ''}>
          <div className="min-w-0">
            <DraftRow
              row={r}
              isLocked={isLocked}
              isActive={isActive}
              onEdit={() => startEdit(i)}
              onDelete={() => deleteRow(i)}
            />
          </div>
          {isActive && (
            <div className="hidden lg:block rounded-lg bg-blue-50/40 p-3">
              <RowEditor
                row={r}
                available={availableForEditor}
                isServeisDept={isServeisDept}
                vestimentModelChoice={vestimentModelChoice}
                vestimentModelOptions={serveisVestimentModels}
                onVestimentModelChange={setVestimentModelChoice}
                allowExternalWorkerName={Boolean(r.isExternal)}
                canEditMeetingPoint={canEditMeetingPoint(r)}
                groupHasDriverController={groupHasDriverController(r.groupId)}
                canEditArrivalTime={canEditArrivalTime(r)}
                onPatch={patchRow}
                onClose={endEdit}
                onRevert={revertRow}
                isLocked={isLocked}
              />
            </div>
          )}
        </div>
      </React.Fragment>
    )
  }

  const defaultGroup = hasStructuredGroups ? groupDefs[0] : undefined
  const defaultGroupId = hasStructuredGroups ? groupDefs[0]?.id : undefined
  const defaultGroupStartTime = defaultGroup?.startTime || draft.startTime
  const defaultGroupEndTime = defaultGroup?.endTime || draft.endTime
  const defaultGroupArrivalTime = defaultGroup?.arrivalTime || draft.arrivalTime
  const defaultGroupMeetingPoint = defaultGroup?.meetingPoint || draft.meetingPoint || ''
  const canManageGroups = true
  const currentEditingRow = editIdx !== null ? rows[editIdx] || null : null
  const hasInlineEditor = Boolean(currentEditingRow && editIdx !== null)
  const isGroupCollapsed = (groupId?: string | null) =>
    groupId != null && groupId !== '' && collapsedGroups.has(groupId)
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
    const groupDate = (group as any)?.serviceDate || draft.startDate

    setRowsState([
      ...rows,
      {
        id: '',
        name: '',
        role,
        startDate: groupDate,
        endDate: draft.endDate || groupDate,
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
    const groupDate = (group as any)?.serviceDate || draft.startDate

    setRowsState([
      ...rows,
      {
        id: '',
        name: 'ETT',
        isExternal: true,
        externalType: 'ett',
        role: 'treballador',
        startDate: groupDate,
        endDate: draft.endDate || groupDate,
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
    setGroupDefsState((prev) => [
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
    const groupDate = (group as any)?.serviceDate || draft.startDate

    setRowsState([
      ...rows,
      {
        id: '',
        name: 'Extra',
        isExternal: true,
        externalType: 'centerExternalExtra',
        isCenterExternalExtra: true,
        role: 'treballador',
        startDate: groupDate,
        endDate: draft.endDate || groupDate,
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
    setGroupDefsState((prev) => prev.filter((group) => group.id !== groupId))
    setRowsState((prev) => prev.filter((row) => row.groupId !== groupId))
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
    <div className="flex flex-wrap items-end justify-end gap-3 border-b border-slate-200 bg-slate-50/80 px-3 py-3 sm:px-4">
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
      canManageGroups={canManageGroups}
      showStructuredGroups={showStructuredGroups}
      rows={rows}
      renderRow={renderRow}
      availableForEditor={availableForEditor}
      renderDisplayItems={renderDisplayItems}
      canEditMeetingPoint={canEditMeetingPoint}
      canEditArrivalTime={canEditArrivalTime}
      groupHasDriverController={groupHasDriverController}
      addRowToGroup={addRowToGroup}
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
      vestimentModelChoice={vestimentModelChoice}
      vestimentModelOptions={serveisVestimentModels}
      onVestimentModelChange={setVestimentModelChoice}
    />

    <DraftsTableMobile
      currentEditingRow={currentEditingRow}
      editIdx={editIdx}
      groupDefs={groupDefs}
      isLocked={isLocked}
      isServeisDept={isServeisDept}
      canManageGroups={canManageGroups}
      showStructuredGroups={showStructuredGroups}
      rows={rows}
      defaultGroupId={defaultGroupId ?? undefined}
      availableForEditor={availableForEditor}
      renderDisplayItemsMobile={renderDisplayItemsMobile}
      canEditMeetingPoint={canEditMeetingPoint}
      canEditArrivalTime={canEditArrivalTime}
      groupHasDriverController={groupHasDriverController}
      addRowToGroup={addRowToGroup}
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
      vestimentModelChoice={vestimentModelChoice}
      vestimentModelOptions={serveisVestimentModels}
      onVestimentModelChange={setVestimentModelChoice}
    />
  </div>
)

}



