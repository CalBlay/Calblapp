// file: src/app/menu/quadrants/drafts/components/DraftsTable.tsx
'use client'

import React, { useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useAvailablePersonnel } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import { GraduationCap, Truck, User, Users, ChevronDown, ChevronUp } from 'lucide-react'

// Subcomponents
import DraftRow from './DraftRow'
import RowEditor from './RowEditor'
import DraftActions from './DraftActions'

import type { Role } from './types'
import type { DraftInput, Row } from './types'

type Vehicle = {
  id: string
  plate: string
  type: string
  available: boolean
}

export default function DraftsTable({
  draft: rawDraft,
  phaseKey,
}: {
  draft: DraftInput
  phaseKey?: string
}) {
  const normalizeKey = (value?: string) =>
    (value || '').toString().toLowerCase().trim()

  const phase = useMemo(() => {
    if (!phaseKey) return null
    const phases = Array.isArray((rawDraft as any).logisticaPhases)
      ? (rawDraft as any).logisticaPhases
      : []
    const target = normalizeKey(phaseKey)
    return (
      phases.find((p: any) => {
        const key = normalizeKey(p?.key || p?.label)
        return key === target
      }) || null
    )
  }, [rawDraft, phaseKey])

  const draft = useMemo(() => {
    if (!phase) return rawDraft
    const meetingPoint = phase?.meetingPoint || rawDraft.meetingPoint || ''
    const startDate = phase?.date || rawDraft.startDate
    const endDate = phase?.endDate || phase?.date || rawDraft.endDate
    return {
      ...rawDraft,
      startDate,
      endDate,
      startTime: phase?.startTime || rawDraft.startTime,
      endTime: phase?.endTime || rawDraft.endTime,
      meetingPoint,
      totalWorkers: phase?.totalWorkers ?? rawDraft.totalWorkers,
      numDrivers: phase?.numDrivers ?? rawDraft.numDrivers,
      responsableName: phase?.responsableName || null,
      responsable: phase?.responsableName
        ? ({ name: phase.responsableName, meetingPoint } as Partial<Row>)
        : null,
      conductors: Array.isArray(phase?.conductors) ? phase.conductors : [],
      treballadors: Array.isArray(phase?.treballadors) ? phase.treballadors : [],
      brigades: [],
      groups: [],
    }
  }, [rawDraft, phase])
  const { data: session } = useSession()
  const department =
    (draft.department ||
      (session?.user && 'department' in session.user ? session.user.department : '') ||
      ''
    ).toLowerCase()

  const defaultMeetingPoint = draft.meetingPoint || ''
  const structuredGroups = useMemo(
    () =>
      (Array.isArray(draft.groups) ? draft.groups : []).map((group, idx) => ({
        ...group,
        id: group.id || `group-${idx + 1}`,
      })),
    [draft.groups]
  )
  const isServeisDept = department === 'serveis'
  const isLogisticaDept = department === 'logistica'
  const [groupDefs, setGroupDefs] = useState(structuredGroups)
  const hasStructuredGroups = groupDefs.length > 0

  const resolveNameById = (id: string) => {
    if (!id) return ''
    if (draft.responsable?.id === id) return draft.responsable?.name || ''
    const driver = (draft.conductors || []).find((c) => c.id === id)
    if (driver?.name) return driver.name
    const worker = (draft.treballadors || []).find((t) => t.id === id)
    if (worker?.name) return worker.name
    return ''
  }
  const norm = (value?: string) => (value || '').toLowerCase().trim()

  const buildGroupedRows = (): Row[] => {
    const rows: Row[] = []
    const driversPool = [...(draft.conductors || [])]
    const driverNameSet = new Set(
      (draft.conductors || [])
        .map((c) => norm(c?.name))
        .filter(Boolean)
    )
    if (isServeisDept && Array.isArray(draft.groups)) {
      draft.groups.forEach((g: any) => {
        const dn = norm(g?.driverName)
        if (dn) driverNameSet.add(dn)
      })
    }
    const extrasFromDoc = (draft.treballadors || []).filter(
      (w) => norm(w?.name) === 'extra'
    ).length
    const workersPool = [...(draft.treballadors || [])]
      .filter((w) => norm(w?.name) !== 'extra')
      .filter((w) => !driverNameSet.has(norm(w?.name)))
    let extrasNeeded = extrasFromDoc
    let missingWorkersNeeded = 0
    const usedNames = new Set<string>()
      

    groupDefs.forEach((group, idx) => {
      const groupId = group.id || `group-${idx + 1}`
      const groupDate = (group as any).serviceDate || draft.startDate
      const groupStartTime = group.startTime || draft.startTime || ''
      const groupEndTime = group.endTime || draft.endTime || ''
      const groupArrivalTime = group.arrivalTime || draft.arrivalTime || ''
      const groupMeetingPoint = group.meetingPoint || defaultMeetingPoint
      const respId =
        group.responsibleId ||
        (idx === 0 ? draft.responsableId || '' : '')
      let respName =
        group.responsibleName ||
        resolveNameById(respId) ||
        (idx === 0 && typeof draft.responsableName === 'string'
          ? draft.responsableName
          : '')
      if (respName && usedNames.has(norm(respName))) {
        respName = ''
      }

      const hasResponsible = Boolean(respName || respId)
      const respRowIndex = hasResponsible ? rows.length : -1
      const mainDriverRow =
        isServeisDept && driversPool.length > 0 ? driversPool[0] : null
      if (hasResponsible) {
        rows.push({
          id: respId || '',
          name: respName || '',
          role: 'responsable',
          isDriver: false,
          groupId,
          startDate: groupDate,
          startTime: mainDriverRow?.startTime || groupStartTime,
          endDate: draft.endDate || groupDate,
          endTime: mainDriverRow?.endTime || groupEndTime,
          meetingPoint: groupMeetingPoint,
          arrivalTime: mainDriverRow?.arrivalTime || groupArrivalTime,
          plate: '',
          vehicleType: '',
        })
      }

      const driversNeeded = Number(group.drivers || 0)
      const assignedDrivers: Array<{ name?: string }> = []

      if (isServeisDept) {
        if (driversNeeded > 0) {
          let driverName = ''
          let next = driversPool.shift()
          while (next?.name && usedNames.has(norm(next.name))) {
            next = driversPool.shift()
          }
          driverName = next?.name || ''
          if (!driverName) {
            driverName =
              (group as any).driverName ||
              resolveNameById((group as any).driverId || '') ||
              ''
          }
          if (!driverName) driverName = 'Extra'
          assignedDrivers.push({ name: driverName })
          const samePersonAsResponsible =
            hasResponsible && driverName && respName && norm(driverName) === norm(respName)
          if (samePersonAsResponsible && respRowIndex >= 0) {
            rows[respRowIndex] = {
              ...rows[respRowIndex],
              isDriver: true,
            }
          }
          if (!samePersonAsResponsible) {
            rows.push({
              id: (group as any).driverId || '',
              name: driverName,
              role: 'conductor',
              groupId,
              startDate: next?.startDate || groupDate,
              startTime: next?.startTime || groupStartTime,
              endDate: next?.endDate || draft.endDate || groupDate,
              endTime: next?.endTime || groupEndTime,
              meetingPoint: next?.meetingPoint || groupMeetingPoint,
              arrivalTime: next?.arrivalTime || groupArrivalTime,
              plate: '',
              vehicleType: '',
            })
          }
        }
      } else {
        for (let i = 0; i < driversNeeded; i += 1) {
          let driver = driversPool.shift()
          while (driver?.name && usedNames.has(norm(driver.name))) {
            driver = driversPool.shift()
          }
          assignedDrivers.push({ name: driver?.name })
          rows.push({
            id: driver?.id || '',
            name: driver?.name || 'Extra',
            role: 'conductor',
            groupId,
            startDate: groupDate,
            startTime: groupStartTime,
            endDate: draft.endDate || groupDate,
            endTime: groupEndTime,
            meetingPoint: groupMeetingPoint,
            arrivalTime: groupArrivalTime,
            plate: driver?.plate || '',
            vehicleType: driver?.vehicleType || '',
          })
        }
      }

      const responsibleIsDriver =
        hasResponsible &&
        assignedDrivers.some((p) => p.name && norm(p.name) === norm(respName))
      const workersNeeded = Math.max(
        Number(group.workers || 0) -
          driversNeeded -
          (hasResponsible ? (responsibleIsDriver ? 0 : 1) : 0),
        0
      )
      const assignedWorkers: Array<{ name?: string }> = []
        
        for (let i = 0; i < workersNeeded; i += 1) {
          let worker = workersPool.shift()
          while (worker?.name && usedNames.has(norm(worker.name))) {
            worker = workersPool.shift()
          }
          const wName = worker?.name || ''
          if (!wName) {
            missingWorkersNeeded += 1
          } else {
            assignedWorkers.push({ name: wName })
            rows.push({
              id: worker?.id || '',
              name: wName,
              role: 'treballador',
              groupId,
              startDate: worker?.startDate || groupDate,
              startTime: worker?.startTime || groupStartTime,
              endDate: worker?.endDate || draft.endDate || groupDate,
              endTime: worker?.endTime || groupEndTime,
              meetingPoint: worker?.meetingPoint || groupMeetingPoint,
              arrivalTime: worker?.arrivalTime || groupArrivalTime,
              plate: '',
              vehicleType: '',
            })
          }
        }
        extrasNeeded = Math.max(extrasNeeded, missingWorkersNeeded)

      if (respRowIndex >= 0 && !rows[respRowIndex]?.name && department !== 'serveis') {
        const candidate =
          assignedWorkers.find((p) => p.name && p.name !== 'Extra') ||
          assignedDrivers.find((p) => p.name && p.name !== 'Extra')
        if (candidate?.name) rows[respRowIndex].name = candidate.name
      }

      const groupNames = [
        rows[respRowIndex]?.name,
        ...assignedDrivers.map((p) => p.name),
        ...assignedWorkers.map((p) => p.name),
      ]
        .filter((name) => typeof name === 'string' && name && name !== 'Extra')
        .map((name) => norm(name as string))
      groupNames.forEach((name) => usedNames.add(name))
    })

    let ettCount = 0
    ;(draft.brigades || []).forEach((brig) => {
      rows.push({
        id: brig.id || '',
        name: brig.name || 'ETT',
        role: 'brigada' as Role,
        startDate: brig.startDate || draft.startDate,
        startTime: brig.startTime || draft.startTime,
        endDate: brig.endDate || draft.endDate,
        endTime: brig.endTime || draft.endTime,
        meetingPoint: brig.meetingPoint || defaultMeetingPoint,
        arrivalTime: brig.arrivalTime || draft.arrivalTime || '',
        workers: brig.workers || 0,
        plate: brig.plate || '',
        vehicleType: brig.vehicleType || '',
      })
      if ((brig.name || 'ETT').toString().trim().toLowerCase() === 'ett') {
        ettCount += Number(brig.workers || 0)
      }
    })

    if (extrasNeeded > 0) {
      if (ettCount > 0) {
        const idx = rows.findIndex(
          (r) => r.role === 'brigada' && (r.name || '').toString().trim().toLowerCase() === 'ett'
        )
        if (idx >= 0) {
          const cur = rows[idx]
          rows[idx] = { ...cur, workers: Number(cur.workers || 0) + extrasNeeded }
        } else {
          rows.push({
            id: '',
            name: 'ETT',
            role: 'brigada' as Role,
            startDate: draft.startDate,
            startTime: draft.startTime,
            endDate: draft.endDate || draft.startDate,
            endTime: draft.endTime,
            meetingPoint: defaultMeetingPoint,
            arrivalTime: draft.arrivalTime || '',
            workers: extrasNeeded,
            plate: '',
            vehicleType: '',
          })
        }
      } else {
        rows.push({
          id: '',
          name: 'ETT',
          role: 'brigada' as Role,
          startDate: draft.startDate,
          startTime: draft.startTime,
          endDate: draft.endDate || draft.startDate,
          endTime: draft.endTime,
          meetingPoint: defaultMeetingPoint,
          arrivalTime: draft.arrivalTime || '',
          workers: extrasNeeded,
          plate: '',
          vehicleType: '',
        })
      }
    }

    return rows
  }

  const ensureLogisticaWorkerCoverage = (inputRows: Row[]) => {
    if (!isLogisticaDept || hasStructuredGroups) return inputRows

    const workerKeys = new Set(
      inputRows
        .filter((row) => row.role === 'treballador' && norm(row.name) !== 'extra')
        .map((row) => row.id || norm(row.name))
        .filter(Boolean)
    )

    const syntheticWorkers = inputRows
      .filter((row) => row.role === 'responsable' || row.role === 'conductor')
      .filter((row) => {
        const key = row.id || norm(row.name)
        return Boolean(key) && !workerKeys.has(key)
      })
      .map((row) => ({
        ...row,
        role: 'treballador' as Role,
        plate: '',
        vehicleType: '',
      }))

    return [...inputRows, ...syntheticWorkers]
  }

  // --- ConstrucciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³ inicial de files a partir del draft (incloent brigades)
  const initialRowsBase: Row[] = hasStructuredGroups
    ? buildGroupedRows()
    : [
    ...(draft.responsableName
      ? [
          {
            id: draft.responsable?.id || '',
            name: draft.responsableName,
            role: 'responsable' as Role,
         startDate: draft.responsable?.startDate || draft.startDate,
startTime: draft.responsable?.startTime || draft.startTime,
endDate:   draft.responsable?.endDate   || draft.endDate,
endTime:   draft.responsable?.endTime   || draft.endTime,
meetingPoint:
              draft.responsable?.meetingPoint || defaultMeetingPoint,

            arrivalTime: draft.responsable?.arrivalTime || draft.arrivalTime || '',
            plate: draft.responsable?.plate || '',
            vehicleType: draft.responsable?.vehicleType || '',
          },
        ]
      : []),
    ...(draft.conductors || []).map((c) => ({
      id: c.id || '',
      name: c.name,
      role: 'conductor' as Role,
   startDate: c.startDate || draft.startDate,
startTime: c.startTime || draft.startTime,
endDate:   c.endDate   || draft.endDate,
endTime:   c.endTime   || draft.endTime,
      meetingPoint: c.meetingPoint || defaultMeetingPoint,

      arrivalTime: c.arrivalTime || draft.arrivalTime || '',
      plate: c.plate || '',
      vehicleType: c.vehicleType || '',
    })),
    ...(draft.treballadors || []).map((t) => ({
      id: t.id || '',
      name: t.name,
      role: 'treballador' as Role,
    startDate: t.startDate || draft.startDate,
startTime: t.startTime || draft.startTime,
endDate:   t.endDate   || draft.endDate,
endTime:   t.endTime   || draft.endTime,
      meetingPoint: t.meetingPoint || defaultMeetingPoint,

      arrivalTime: t.arrivalTime || draft.arrivalTime || '',
      plate: '',
      vehicleType: '',
    })),
    ...(draft.brigades || []).map((b) => ({
      id: b.id || '',
      name: b.name || '',
      role: 'brigada' as Role,
   startDate: b.startDate || draft.startDate,
startTime: b.startTime || draft.startTime,
endDate:   b.endDate   || draft.endDate,
endTime:   b.endTime   || draft.endTime,

      meetingPoint: b.meetingPoint || '',
      arrivalTime: b.arrivalTime || draft.arrivalTime || '',
      workers: b.workers || 0,
      plate: '',
      vehicleType: '',
    })),
  ]
  const initialRows: Row[] = ensureLogisticaWorkerCoverage(initialRowsBase)

  const [rows, setRows] = useState<Row[]>(initialRows)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const initialRef = useRef(JSON.stringify({ rows: initialRows, groups: structuredGroups }))
  const dirty = JSON.stringify({ rows, groups: groupDefs }) !== initialRef.current
  const [expandedMerged, setExpandedMerged] = useState<Set<string>>(new Set())

  React.useEffect(() => {
    setGroupDefs(structuredGroups)
    setRows(initialRows)
    initialRef.current = JSON.stringify({ rows: initialRows, groups: structuredGroups })
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
      brigades: rows.filter((r) => r?.role === 'brigada').length,
    }),
    [rows]
  )

  useMemo(
    () => ({
      responsables: draft.responsablesNeeded || 1,
      conductors: draft.numDrivers || 0,
      treballadors: draft.totalWorkers || 0,
      brigades: (draft.brigades || []).length,
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
  try {
    // 1) Elimina files completament buides (sense nom i sense id)
    const cleaned = (rowsOverride ?? rows).filter(
      (r) => r.name?.trim() !== '' || r.id?.trim() !== ''
    )

    // 2) Crida a lÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢API amb les files netes
    const res = await fetch('/api/quadrantsDraft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: draft.department,
        eventId: draft.id,
        rows: cleaned,
        groups: groupDefs,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Error en desar quadrant (status ${res.status})`)
    }

    alert('Quadrant desat correctament')

    // 3) Marquem estat com a no-dirty
    initialRef.current = JSON.stringify({ rows: cleaned, groups: groupDefs })

    // 4) Notifiquem perquÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¨ la pantalla es refresqui
    window.dispatchEvent(new Event('quadrant:updated'))
  } catch (err) {
    console.error('Error desa quadrant', err)
    alert('Error en desar quadrant')
  }
}


  const handleConfirm = async () => {
    try {
      const res = await fetch('/api/quadrantsDraft/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: draft.department,
          eventId: draft.id,
        }),
      })
      if (!res.ok) throw new Error('Error confirmant quadrant')
      const data = await res.json()
      if (data.ok) {
        setConfirmed(true)
        alert('Quadrant confirmat correctament i notificacions enviades')
        window.dispatchEvent(new Event('quadrant:created'))
      } else {
        alert("No s'ha pogut confirmar")
      }
    } catch (e) {
      console.error('Error confirmant quadrant', e)
      alert('Error confirmant quadrant')
    }
  }

  const handleUnconfirm = async () => {
    try {
      const res = await fetch('/api/quadrantsDraft/unconfirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: draft.department,
          eventId: draft.id,
        }),
      })
      if (!res.ok) throw new Error('Error reobrint quadrant')
      setConfirmed(false)
      alert('Quadrant reobert')
      window.dispatchEvent(new Event('quadrant:created'))
    } catch (err) {
      console.error('Error reobrint quadrant', err)
      alert('Error reobrint quadrant')
    }
  }

  const handleDeleteQuadrant = async () => {
    if (!confirm('Segur que vols eliminar aquest quadrant?')) return
    try {
      const res = await fetch('/api/quadrantsDraft/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: draft.department,
          eventId: draft.id,
          rows,
        }),
      })
      if (!res.ok) throw new Error('Error eliminant quadrant')
      alert('Quadrant eliminat correctament')
    window.dispatchEvent(new Event('quadrant:updated'))

    } catch (err) {
      console.error('Error eliminant quadrant', err)
      alert('Error eliminant quadrant')
      window.dispatchEvent(new Event('quadrant:updated'))
    }
  }

  const startEdit = (i: number) => setEditIdx(i)
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

  type DisplayItem =
    | { type: 'single'; row: Row; index: number }
    | { type: 'merged'; key: string; rows: Array<{ row: Row; index: number }> }

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

  const buildDisplayItems = (groupId?: string): DisplayItem[] => {
    const order: string[] = []
    const grouped = new Map<string, Array<{ row: Row; index: number }>>()

    rows.forEach((row, index) => {
      if (groupId && row.groupId !== groupId) return
      if (!groupId && row.groupId) return

      const name = row.name || ''
      const canMerge = name && name !== 'Extra'
      const key = canMerge
        ? [
            groupId || 'nogroup',
            norm(name),
            row.startDate,
            row.startTime,
            row.endDate,
            row.endTime,
            row.meetingPoint || ''
          ].join('|')
        : `single-${index}`

      if (!grouped.has(key)) {
        grouped.set(key, [])
        order.push(key)
      }
      grouped.get(key)!.push({ row, index })
    })

    return order.map((key) => {
      const groupRows = grouped.get(key) || []
      if (groupRows.length <= 1) {
        const single = groupRows[0]
        return { type: 'single', row: single.row, index: single.index } as DisplayItem
      }
      return { type: 'merged', key, rows: groupRows } as DisplayItem
    })
  }

  const roleIcon = {
    responsable: <GraduationCap className="text-blue-700" size={20} />,
    conductor: <Truck className="text-orange-500" size={18} />,
    treballador: <User className="text-green-600" size={18} />,
    brigada: <Users className="text-purple-600" size={18} />,
  }

  const renderMergedRowDesktop = (item: Extract<DisplayItem, { type: 'merged' }>) => {
    const roleRows = item.rows.map((r) => r.row)
    const roles = Array.from(new Set(roleRows.map((r) => r.role)))
    const primary =
      roleRows.find((r) => r.role === 'conductor') ||
      roleRows.find((r) => r.role === 'responsable') ||
      roleRows[0]
    const isExpanded = expandedMerged.has(item.key)

    return (
      <div
        className="border-b border-slate-200 px-2 py-3 hover:bg-slate-50 grid gap-2 grid-cols-1 sm:grid-cols-[40px_minmax(11rem,1fr)_5rem_4.5rem_4.5rem_4.5rem_minmax(8rem,0.9fr)_4.5rem_3.5rem] items-center"
      >
        <div className="hidden sm:flex items-center justify-center gap-1">
          {roles.map((role) => (
            <span key={role}>{roleIcon[role]}</span>
          ))}
        </div>
        <div className="hidden sm:block truncate text-[14px] font-medium text-slate-800">
          {primary.name || <span className="italic text-gray-400">Sense nom</span>}
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
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
    )
  }

  const renderMergedRowMobile = (item: Extract<DisplayItem, { type: 'merged' }>) => {
    const roleRows = item.rows.map((r) => r.row)
    const roles = Array.from(new Set(roleRows.map((r) => r.role)))
    const primary =
      roleRows.find((r) => r.role === 'conductor') ||
      roleRows.find((r) => r.role === 'responsable') ||
      roleRows[0]
    const isExpanded = expandedMerged.has(item.key)

    return (
      <div className="p-3 text-sm border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {roles.map((role) => (
              <span key={role}>{roleIcon[role]}</span>
            ))}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-800">{primary.name || '-'}</div>
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
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
  const currentEditingRow = editIdx !== null ? rows[editIdx] || null : null
  const hasInlineEditor = Boolean(currentEditingRow && editIdx !== null)

  const addRowToGroup = (role: Role, groupId?: string) => {
    const group = hasStructuredGroups
      ? groupDefs.find((item) => item.id === groupId) || defaultGroup
      : undefined
    const groupStart = group?.startTime || defaultGroupStartTime || ''
    const groupEnd = group?.endTime || defaultGroupEndTime || ''
    const groupArrival = group?.arrivalTime || defaultGroupArrivalTime || ''
    const groupMeeting = group?.meetingPoint || defaultGroupMeetingPoint

    if (role === 'brigada') {
      if (hasStructuredGroups) {
        const ettIdx = rows.findIndex(
          (r) => r.role === 'brigada' && !r.groupId && norm(r.name || '') === 'ett'
        )
        const next = [...rows]
        if (ettIdx >= 0) {
          const current = next[ettIdx]
          next[ettIdx] = {
            ...current,
            name: current.name || 'ETT',
            workers: Number(current.workers || 0) + 1,
          }
        } else {
          next.push({
            id: '',
            name: 'ETT',
            role: 'brigada',
            startDate: draft.startDate,
            endDate: draft.endDate,
            startTime: groupStart,
            endTime: groupEnd,
            meetingPoint: groupMeeting,
            arrivalTime: groupArrival,
            plate: '',
            vehicleType: '',
            workers: 1,
          })
        }

        next.push({
          id: '',
          name: 'Extra',
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
        })

        setRows(next)
        return
      }

      const ettIdx = rows.findIndex(
        (r) =>
          r.role === 'brigada' &&
          (r.groupId || '') === (groupId || '') &&
          norm(r.name || '') === 'ett'
      )
      if (ettIdx >= 0) {
        const next = [...rows]
        const current = next[ettIdx]
        next[ettIdx] = {
          ...current,
          name: current.name || 'ETT',
          workers: Number(current.workers || 0) + 1,
        }
        setRows(next)
        return
      }
    }

    setRows([
      ...rows,
      {
        id: '',
        name: role === 'brigada' ? 'ETT' : '',
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
        ...(role === 'brigada' ? { workers: 1 } : {}),
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

    {/* Vista escriptori/tablet */}
    <div className="hidden sm:block">
      <div className={`flex gap-3 ${hasInlineEditor ? 'lg:items-start' : ''}`}>
        <div className={`${hasInlineEditor ? 'lg:w-[64%]' : 'w-full'} min-w-0 overflow-x-auto`}>
      {/* Files */}
      <div className="flex flex-col divide-y">
        {showStructuredGroups
          ? (
              <>
                {groupDefs.map((group, gidx) => {
                  const groupId = group.id || `group-${gidx + 1}`
              return (
                <React.Fragment key={groupId}>
                  <div className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border-b flex items-center justify-between gap-2">
                    <span>Grup {gidx + 1}</span>
                    {!isLocked && groupDefs.length > 1 && (
                      <button
                        onClick={() => removeGroup(groupId)}
                        className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                      >
                        Eliminar grup
                      </button>
                    )}
                  </div>
                  {renderDisplayItems(buildDisplayItems(groupId))}
                  {!isLocked && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 bg-slate-50 border-b">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => addRowToGroup('responsable', groupId)}
                          className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                        >
                          + Responsable
                        </button>
                        {showConductorButtons && (
                          <button
                            onClick={() => addRowToGroup('conductor', groupId)}
                            className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                          >
                            + Conductor
                          </button>
                        )}
                        <button
                          onClick={() => addRowToGroup('treballador', groupId)}
                          className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                        >
                          + Treballador
                        </button>
                        <button
                          onClick={() => addRowToGroup('brigada', groupId)}
                          className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
                        >
                          + ETT
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
                {!isLocked && isServeisDept && (
                  <div className="flex justify-start px-3 py-3 bg-slate-50 border-b">
                    <button
                      onClick={addGroup}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100"
                    >
                      + Grup
                    </button>
                  </div>
                )}
                {renderDisplayItems(buildDisplayItems())}
              </>
            )
          : rows.map((r, i) => renderRow(r, i))}
      </div>
        </div>

        {hasInlineEditor && currentEditingRow && (
          <div className="hidden lg:block lg:w-[36%] min-w-[360px]">
            <div className="sticky top-3 rounded-lg bg-blue-50/40 p-3">
              <RowEditor
                row={currentEditingRow}
                available={availableForEditor}
                isServeisDept={isServeisDept}
                onPatch={patchRow}
                onClose={endEdit}
                onRevert={revertRow}
                isLocked={isLocked}
              />
            </div>
          </div>
        )}
      </div>

      {hasInlineEditor && currentEditingRow && (
        <div className="lg:hidden bg-blue-50/40 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
          <RowEditor
            row={currentEditingRow}
            available={availableForEditor}
            isServeisDept={isServeisDept}
            onPatch={patchRow}
            onClose={endEdit}
            onRevert={revertRow}
            isLocked={isLocked}
          />
        </div>
      )}
    </div>

    {/* Vista mobil */}
    <div className="block sm:hidden divide-y">
      {showStructuredGroups
        ? (
            <>
              {groupDefs.map((group, gidx) => {
                const groupId = group.id || `group-${gidx + 1}`
            return (
              <div key={groupId} className="divide-y">
                <div className="px-3 py-2 text-xs text-slate-600 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-700">Grup {gidx + 1}</div>
                  {!isLocked && groupDefs.length > 1 && (
                    <button
                      onClick={() => removeGroup(groupId)}
                      className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                    >
                      Eliminar
                    </button>
                  )}
                </div>                {renderDisplayItemsMobile(buildDisplayItems(groupId))}
                {!isLocked && (
                  <div className="flex flex-wrap gap-2 px-3 py-3 bg-slate-50">
                    <button
                      onClick={() => addRowToGroup('responsable', groupId)}
                      className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                    >
                      + Responsable
                    </button>
                    {showConductorButtons && (
                      <button
                        onClick={() => addRowToGroup('conductor', groupId)}
                        className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                      >
                        + Conductor
                      </button>
                    )}
                    <button
                      onClick={() => addRowToGroup('treballador', groupId)}
                      className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                    >
                      + Treballador
                    </button>
                      <button
                        onClick={() => addRowToGroup('brigada', groupId)}
                        className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
                      >
                        + ETT
                      </button>
                  </div>
                )}
              </div>
            )
          })}
              {!isLocked && isServeisDept && (
                <div className="px-3 py-3 bg-slate-50 border-b">
                  <button
                    onClick={addGroup}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100"
                  >
                    + Grup
                  </button>
                </div>
              )}
              {renderDisplayItemsMobile(buildDisplayItems())}
            </>
          )
        : rows.map((r, i) => (
            <div
              key={`${r.role}-${r.id || 'noid'}-${i}`}
              className={`p-3 text-sm ${editIdx === i ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-800">{r.name || '-'}</span>
                <span className="text-xs text-gray-500">{r.role}</span>
              </div>
              <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                <div>Data: {r.startDate}</div>
                <div>Hora: {r.startTime || '-'}</div>
                <div>Punt: {r.meetingPoint || '-'}</div>
                {r.vehicleType && <div>Vehicle: {r.vehicleType}</div>}
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => startEdit(i)}
                  className="px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs"
                >
                  Edita
                </button>
                <button
                  onClick={() => deleteRow(i)}
                  className="px-2 py-1 rounded-md bg-red-100 text-red-700 text-xs"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}
    </div>

    {!showStructuredGroups && (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 bg-gray-50 border-t">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => addRowToGroup('responsable', defaultGroupId)}
            className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
          >
            + Responsable
          </button>
          {showConductorButtons && (
            <button
              onClick={() => addRowToGroup('conductor', defaultGroupId)}
              className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
            >
              + Conductor
            </button>
          )}
          <button
            onClick={() => addRowToGroup('treballador', defaultGroupId)}
            className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
          >
            + Treballador
          </button>
          <button
            onClick={() => addRowToGroup('brigada', defaultGroupId)}
            className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
          >
            + ETT
          </button>
        </div>
      </div>
    )}

    {currentEditingRow && editIdx !== null && (
      <div className="sm:hidden">
        <RowEditor
          row={currentEditingRow}
          available={availableForEditor}
          isServeisDept={isServeisDept}
          onPatch={patchRow}
          onClose={endEdit}
          onRevert={revertRow}
          isLocked={isLocked}
        />
      </div>
    )}
  </div>
)

}



