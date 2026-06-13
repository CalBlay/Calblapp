'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronDown, Search, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import {
  CorporateFilterField,
  CorporateFilterSearch,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { useSession } from 'next-auth/react'
import { DEPARTMENTS, type DepartmentId } from '@/data/departments'
import { taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { normalizeRole } from '@/lib/roles'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import { formatDateOnly, formatDateTimeValue } from '@/lib/date-format'
import {
  exportRequestReceiptsPdf,
  exportRowsToXlsx,
  robaExportFilename,
} from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { DeliveryRow, ProductRow, RequestRow, WorkerRow } from './robaPersonalTypes'
import {
  deliveredQtyByProductForRequestId,
  totalDeliveredUnitsForRequest,
} from './robaDeliveryHelpers'
import { ROBA_REQUEST_STATUS_LABEL, SOLIC_TABLE_COLS } from './robaPersonalConstants'
import {
  robaRequestCalendarDay,
  robaSollicitudsWeekRange,
  formatRobaDayGroupLabel,
} from './robaPersonalDates'
import { productById } from './robaProductHelpers'

type SollicitudsPanelMode = 'requests' | 'prepare' | 'pickup'

const REQUEST_ACTIVE_STATUSES = [
  'submitted',
  'sent_to_rrhh',
  'prepared',
  'ready_for_worker_delivery',
  'picked_up',
] as const

const REQUEST_VISIBLE_STATUSES = [
  ...REQUEST_ACTIVE_STATUSES,
  'cancelled',
] as const

export function SollicitudsPanel({
  highlightRequestId = '',
  highlightDeliveryId = '',
  mode = 'requests',
}: {
  highlightRequestId?: string
  /** Recollides: obre el flux de correcció d’entrega quan ve d’una notificació o URL (`deliveryId`). */
  highlightDeliveryId?: string
  mode?: SollicitudsPanelMode
}) {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [pickupCorrectTarget, setPickupCorrectTarget] = useState<DeliveryRow | null>(null)
  const [pickupCorrectLinesEditor, setPickupCorrectLinesEditor] = useState<
    { productId: string; qty: string }[]
  >([{ productId: '', qty: '1' }])
  const [pickupCorrectNote, setPickupCorrectNote] = useState('')
  const [pickupCorrectBusy, setPickupCorrectBusy] = useState(false)
  const [editRequestOpen, setEditRequestOpen] = useState(false)
  const [editRequestTarget, setEditRequestTarget] = useState<RequestRow | null>(null)
  const [editRequestLines, setEditRequestLines] = useState<{ productId: string; qty: string }[]>([])
  const [editRequestBusy, setEditRequestBusy] = useState(false)
  const [sendToRrhhOpen, setSendToRrhhOpen] = useState(false)
  const [sendToRrhhTargets, setSendToRrhhTargets] = useState<RequestRow[]>([])
  const [sendToRrhhEmail, setSendToRrhhEmail] = useState('')
  const [sendToRrhhSavedEmail, setSendToRrhhSavedEmail] = useState('')
  const [sendToRrhhRememberEmail, setSendToRrhhRememberEmail] = useState(false)
  const [sendToRrhhBusy, setSendToRrhhBusy] = useState(false)
  const [selectedBatchRequestIds, setSelectedBatchRequestIds] = useState<string[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [dept, setDept] = useState<DepartmentId>(DEPARTMENTS[0])
  const [workerId, setWorkerId] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])

  const { data: session } = useSession()
  const sessionUserId = String((session?.user as { id?: string })?.id || '').trim()
  const sessionUserName = String((session?.user as { name?: string })?.name || '').trim()
  const sessionRoleNorm = normalizeRole((session?.user as { role?: string })?.role)
  const isRobaAdmin = sessionRoleNorm === 'admin'
  const sessionDeptNorm = String((session?.user as { department?: string })?.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const isRobaAdminOrRrhh =
    sessionRoleNorm === 'admin' || sessionDeptNorm === 'recursos humans'
  const isDeptLeadLimited =
    Boolean((session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead) &&
    !isRobaAdminOrRrhh
  const robaLinkedPersonnelId = String(
    (session?.user as { robaLinkedPersonnelId?: string | null })?.robaLinkedPersonnelId || ''
  ).trim()
  const robaWorkerDeptNorm = String(
    (session?.user as { robaWorkerDeptNorm?: string | null })?.robaWorkerDeptNorm || ''
  ).trim()
  const isRobaWorkerSelf = Boolean(robaLinkedPersonnelId) && !isRobaAdminOrRrhh && !isDeptLeadLimited
  const sessionDeptLabel = String(
    (session?.user as { department?: string })?.department || ''
  ).trim()
  const lockedDept = useMemo(
    () => DEPARTMENTS.find((d) => departmentsInSameRobaScope(d, sessionDeptLabel)),
    [sessionDeptLabel]
  )
  const lockedDeptWorkerSelf = useMemo(
    () => DEPARTMENTS.find((d) => departmentsInSameRobaScope(d, robaWorkerDeptNorm)),
    [robaWorkerDeptNorm]
  )

  const workersForDept = useMemo(() => {
    const active = workers.filter((w) => w.isActive !== false)
    if (isRobaWorkerSelf) {
      return active.filter((w) => w.id === robaLinkedPersonnelId)
    }
    if (isDeptLeadLimited) {
      return active
    }
    return active.filter((w) =>
      departmentsInSameRobaScope(String(w.department || ''), dept)
    )
  }, [workers, dept, isDeptLeadLimited, isRobaWorkerSelf, robaLinkedPersonnelId])

  const availableRequestDepartments = useMemo(() => {
    const unique = new Map<string, string>()
    workers
      .filter((worker) => worker.isActive !== false)
      .forEach((worker) => {
        const department = String(worker.department || '').trim()
        if (!department) return
        const key = department
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .trim()
        if (!unique.has(key)) unique.set(key, department)
      })

    return [...unique.values()].sort((a, b) =>
      a.localeCompare(b, 'ca', { sensitivity: 'base' })
    ) as DepartmentId[]
  }, [workers])

  const workerNameForRequestForm = useMemo(() => {
    const fromWorkerList = workers.find((w) => w.id === workerId)?.name?.trim()
    if (fromWorkerList) return fromWorkerList
    if (isRobaWorkerSelf && sessionUserName) return sessionUserName
    return '—'
  }, [workers, workerId, isRobaWorkerSelf, sessionUserName])

  useEffect(() => {
    setWorkerId((id) => {
      if (!id) return id
      return workersForDept.some((w) => w.id === id) ? id : ''
    })
  }, [dept, workersForDept])

  useEffect(() => {
    if (!isDeptLeadLimited) return
    if (lockedDept) {
      setDept(lockedDept)
    } else if (sessionDeptLabel) {
      setDept(sessionDeptLabel as DepartmentId)
    }
  }, [isDeptLeadLimited, lockedDept, sessionDeptLabel])

  useEffect(() => {
    if (!isRobaWorkerSelf) return
    if (lockedDeptWorkerSelf) {
      setDept(lockedDeptWorkerSelf)
    }
  }, [isRobaWorkerSelf, lockedDeptWorkerSelf])

  useEffect(() => {
    if (!isRobaWorkerSelf || !robaLinkedPersonnelId) return
    setWorkerId(robaLinkedPersonnelId)
  }, [isRobaWorkerSelf, robaLinkedPersonnelId])

  useEffect(() => {
    if (isDeptLeadLimited || isRobaWorkerSelf) return
    if (!availableRequestDepartments.length) return
    setDept((current) =>
      availableRequestDepartments.includes(current)
        ? current
        : availableRequestDepartments[0]
    )
  }, [availableRequestDepartments, isDeptLeadLimited, isRobaWorkerSelf])

  useEffect(() => {
    const id = highlightRequestId.trim()
    if (!id) return
    document.getElementById(`roba-req-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightRequestId, rows])

  const [prepareOpen, setPrepareOpen] = useState(false)
  const [prepareRequestId, setPrepareRequestId] = useState('')
  const [prepareSummary, setPrepareSummary] = useState<RequestRow | null>(null)
  const [prepareLines, setPrepareLines] = useState<{ productId: string; qty: string }[]>([])
  const [pickupDate, setPickupDate] = useState('')
  const [prepareMessage, setPrepareMessage] = useState('')
  const [prepareWithoutStock, setPrepareWithoutStock] = useState(false)
  const [directPreparePickupDate, setDirectPreparePickupDate] = useState('')
  const [directPrepareMessage, setDirectPrepareMessage] = useState('')
  const [directPrepareWithoutStock, setDirectPrepareWithoutStock] = useState(false)
  const [directPrepareBusy, setDirectPrepareBusy] = useState(false)
  const [directPrepareCollapsed, setDirectPrepareCollapsed] = useState(true)
  const [pickupOpen, setPickupOpen] = useState(false)
  const [pickupRequestId, setPickupRequestId] = useState('')
  const [pickupSummary, setPickupSummary] = useState<RequestRow | null>(null)
  const [pickupLines, setPickupLines] = useState<{ productId: string; qty: string }[]>([])
  const isRequestsMode = mode === 'requests'
  const isPrepareMode = mode === 'prepare'
  const isPickupMode = mode === 'pickup'

  useEffect(() => {
    if (!isPrepareMode) return
    if (directPreparePickupDate) return
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setDirectPreparePickupDate(tomorrow.toISOString().slice(0, 10))
  }, [directPreparePickupDate, isPrepareMode])

  const [listRangeStart, setListRangeStart] = useState(() => robaSollicitudsWeekRange().start)
  const [listRangeEnd, setListRangeEnd] = useState(() => robaSollicitudsWeekRange().end)
  const [listFilterDept, setListFilterDept] = useState('')
  const [listFilterStatus, setListFilterStatus] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [listFiltersResetSignal, setListFiltersResetSignal] = useState(0)
  const [deleteRequestBusyId, setDeleteRequestBusyId] = useState<string | null>(null)

  const { setContent, open: filtersSlideOpen } = useFilters()

  const deptFilterOptions = useMemo(() => {
    if (isDeptLeadLimited) {
      const d = (lockedDept ?? sessionDeptLabel) as string | undefined
      return d ? [d] : [...DEPARTMENTS]
    }
    return [...DEPARTMENTS]
  }, [isDeptLeadLimited, lockedDept, sessionDeptLabel])

  const handleSmartDateChange = useCallback((f: SmartFiltersChange) => {
    if (f.start && f.end) {
      setListRangeStart(f.start)
      setListRangeEnd(f.end)
    }
  }, [])

  const robaFiltersSlidePanel = useMemo(
    () => (
      <div className="flex flex-col gap-4 p-4">
        <CorporateFilterField label="Departament">
          <CorporateFilterSelect
            className="w-full"
            minWidthClassName="min-w-0"
            value={listFilterDept}
            onChange={(e) => setListFilterDept(e.target.value)}
          >
            <option value="">Tots</option>
            {deptFilterOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </CorporateFilterSelect>
        </CorporateFilterField>
        <CorporateFilterField label="Estat">
          <CorporateFilterSelect
            className="w-full"
            minWidthClassName="min-w-0"
            value={listFilterStatus}
            onChange={(e) => setListFilterStatus(e.target.value)}
          >
            <option value="">Tots</option>
            {Object.entries(ROBA_REQUEST_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </CorporateFilterSelect>
        </CorporateFilterField>
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <ResetFilterButton
            onClick={() => {
              setListFilterDept('')
              setListFilterStatus('')
              setListFiltersResetSignal((n) => n + 1)
            }}
          />
          <span className="text-xs text-gray-500">Restableir filtres d&apos;aquest panell</span>
        </div>
      </div>
    ),
    [listFilterDept, listFilterStatus, deptFilterOptions]
  )

  useEffect(() => {
    if (!filtersSlideOpen) return
    setContent(robaFiltersSlidePanel)
  }, [filtersSlideOpen, robaFiltersSlidePanel, setContent])

  const openPrepare = (r: RequestRow) => {
    setPrepareRequestId(r.id)
    setPrepareSummary(r)
    setPrepareLines(
      (r.lines || []).map((l) => ({ productId: l.productId, qty: String(l.quantity) }))
    )
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setPickupDate(tomorrow.toISOString().slice(0, 10))
    setPrepareMessage('')
    setPrepareWithoutStock(false)
    setPrepareOpen(true)
  }

  const openPickup = (r: RequestRow) => {
    setPickupRequestId(r.id)
    setPickupSummary(r)
    setPickupLines(
      (r.lines || []).map((l) => ({ productId: l.productId, qty: String(l.quantity) }))
    )
    setPickupOpen(true)
  }

  const prepareTotalUnits = useMemo(
    () =>
      prepareLines.reduce((acc, l) => {
        const q = Number(String(l.qty ?? '').replace(',', '.').trim())
        return acc + (Number.isFinite(q) && q > 0 ? q : 0)
      }, 0),
    [prepareLines]
  )

  const pickupTotalUnits = useMemo(
    () =>
      pickupLines.reduce((acc, l) => {
        const q = Number(String(l.qty ?? '').replace(',', '.').trim())
        return acc + (Number.isFinite(q) && q > 0 ? q : 0)
      }, 0),
    [pickupLines]
  )

  const load = useCallback(async () => {
    try {
      const [r, d, p, w, pref] = await Promise.all([
        api<RequestRow[]>('/api/roba-personal/requests'),
        api<DeliveryRow[]>('/api/roba-personal/deliveries'),
        api<ProductRow[]>('/api/roba-personal/products'),
        api<WorkerRow[]>('/api/roba-personal/workers'),
        isRobaWorkerSelf
          ? Promise.resolve({ savedEmail: '' })
          : api<{ savedEmail?: string }>('/api/roba-personal/rrhh-email-preference').catch(() => ({ savedEmail: '' })),
      ])
      setRows(r)
      setDeliveries(d)
      setProducts(p.filter((x) => x.isActive !== false))
      setWorkers(w.filter((x) => x.isActive !== false))
      setSendToRrhhSavedEmail(String(pref.savedEmail || '').trim())
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [isRobaWorkerSelf])

  useEffect(() => {
    void load()
  }, [load])

  const confirmPrepare = async () => {
    if (!pickupDate.trim() || !prepareRequestId) return
    const payloadLines = prepareLines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies',
        description: 'Cal almenys un producte amb quantitat vàlida.',
        variant: 'destructive',
      })
      return
    }
    try {
      await api(`/api/roba-personal/requests/${prepareRequestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'prepared',
          pickupDate: pickupDate.trim(),
          pickupAvailabilityMessage: prepareMessage.trim() || undefined,
          prepareWithoutStockReservation: prepareWithoutStock || undefined,
          lines: payloadLines,
        }),
      })
      toast({
        title: 'Estat: preparada',
        description:
          'Avisos enviats al sol·licitant i als responsables de roba del departament; calendari Outlook si hi ha correu.',
      })
      setPrepareOpen(false)
      window.location.reload()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
      throw e
    }
  }

  const sendToRrhh = useCallback(async (id: string, extraEmail?: string) => {
    try {
      await api(`/api/roba-personal/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'sent_to_rrhh',
          extraEmail: extraEmail?.trim() || undefined,
        }),
      })
      toast({ title: 'Sol·licitud enviada a RRHH' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [load])

  const sendToRrhhBatch = useCallback(async (ids: string[], extraEmail?: string) => {
    try {
      await api('/api/roba-personal/requests/send-to-rrhh-batch', {
        method: 'PATCH',
        body: JSON.stringify({
          requestIds: ids,
          extraEmail: extraEmail?.trim() || undefined,
        }),
      })
      toast({
        title: 'Remesa enviada a RRHH',
        description: `${ids.length} sol·licitud(s) enviades en una sola remesa.`,
      })
      setSelectedBatchRequestIds([])
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [load])

  const openSendToRrhhDialog = useCallback((requests: RequestRow[]) => {
    setSendToRrhhTargets(requests)
    setSendToRrhhEmail(sendToRrhhSavedEmail)
    setSendToRrhhRememberEmail(false)
    setSendToRrhhOpen(true)
  }, [sendToRrhhSavedEmail])

  const closeSendToRrhhDialog = useCallback(() => {
    setSendToRrhhOpen(false)
    setSendToRrhhTargets([])
    setSendToRrhhEmail('')
    setSendToRrhhRememberEmail(false)
  }, [])

  const confirmSendToRrhh = useCallback(async () => {
    if (sendToRrhhTargets.length === 0) return
    setSendToRrhhBusy(true)
    try {
      if (sendToRrhhRememberEmail) {
        await api('/api/roba-personal/rrhh-email-preference', {
          method: 'PATCH',
          body: JSON.stringify({ email: sendToRrhhEmail.trim() }),
        })
        setSendToRrhhSavedEmail(sendToRrhhEmail.trim())
      }
      if (sendToRrhhTargets.length === 1) {
        await sendToRrhh(sendToRrhhTargets[0].id, sendToRrhhEmail)
      } else {
        await sendToRrhhBatch(
          sendToRrhhTargets.map((request) => request.id),
          sendToRrhhEmail
        )
      }
      closeSendToRrhhDialog()
    } finally {
      setSendToRrhhBusy(false)
    }
  }, [closeSendToRrhhDialog, sendToRrhh, sendToRrhhBatch, sendToRrhhEmail, sendToRrhhRememberEmail, sendToRrhhTargets])

  const markPickedUp = async (id: string, linesOverride?: { productId: string; quantity: number }[]) => {
    try {
      await api(`/api/roba-personal/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'ready_for_worker_delivery',
          lines: linesOverride,
        }),
      })
      toast({ title: 'Preparació validada' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const confirmPickup = async () => {
    if (!pickupRequestId) return
    const payloadLines = pickupLines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies',
        description: 'Cal almenys un producte amb quantitat vàlida.',
        variant: 'destructive',
      })
      return
    }
    try {
      await markPickedUp(pickupRequestId, payloadLines)
      setPickupOpen(false)
    } catch {
      // `markPickedUp` already reports the error toast.
    }
  }

  const canEditRequestQuantitiesClient = (r: RequestRow) => {
    if (r.status !== 'submitted') return false
    if (isRobaAdminOrRrhh) return true
    if (!isDeptLeadLimited) return false
    return departmentsInSameRobaScope(String(r.requestingDepartment || ''), sessionDeptLabel)
  }

  const openEditRequestDialog = useCallback((request: RequestRow) => {
    setEditRequestTarget(request)
    setEditRequestLines(
      (request.lines || []).length > 0
        ? request.lines.map((line) => ({
            productId: line.productId,
            qty: String(line.quantity),
          }))
        : [{ productId: '', qty: '1' }]
    )
    setEditRequestOpen(true)
  }, [])

  const confirmEditRequest = useCallback(async () => {
    if (!editRequestTarget) return
    const payloadLines = editRequestLines
      .map((line) => ({
        productId: String(line.productId || '').trim(),
        quantity: Number(String(line.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((line) => line.productId && Number.isFinite(line.quantity) && line.quantity > 0)

    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies vàlides',
        description: 'Cal almenys un producte amb quantitat vàlida.',
        variant: 'destructive',
      })
      return
    }

    setEditRequestBusy(true)
    try {
      await api(`/api/roba-personal/requests/${editRequestTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          lines: payloadLines,
        }),
      })
      toast({ title: 'Quantitats rectificades' })
      setEditRequestOpen(false)
      setEditRequestTarget(null)
      setEditRequestLines([])
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setEditRequestBusy(false)
    }
  }, [editRequestLines, editRequestTarget, load])

  const cancelRequest = async (id: string) => {
    try {
      await api(`/api/roba-personal/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      })
      toast({ title: 'Sol·licitud cancel·lada' })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const canMarkPickedUpClient = (r: RequestRow) => {
    if (r.status !== 'prepared') return false
    if (sessionRoleNorm === 'admin') return true
    const sessionRobaLead = Boolean(
      (session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead
    )
    if (!sessionRobaLead) return false
    return departmentsInSameRobaScope(String(r.requestingDepartment || ''), sessionDeptLabel)
  }

  const canCancelRequestClient = (r: RequestRow) => {
    if (isRobaAdminOrRrhh) {
      return [...REQUEST_ACTIVE_STATUSES].includes(r.status as (typeof REQUEST_ACTIVE_STATUSES)[number])
    }
    if (isDeptLeadLimited) {
      return (
        [...REQUEST_ACTIVE_STATUSES].includes(r.status as (typeof REQUEST_ACTIVE_STATUSES)[number]) &&
        departmentsInSameRobaScope(String(r.requestingDepartment || ''), sessionDeptLabel)
      )
    }
    if (isRobaWorkerSelf) {
      if (r.status !== 'submitted') return false
      return (
        (sessionUserId && String(r.createdByUserId || '').trim() === sessionUserId) ||
        (robaLinkedPersonnelId &&
          String(r.requestedByWorkerId || '').trim() === robaLinkedPersonnelId)
      )
    }
    return false
  }

  const canSendToRrhhClient = useCallback(
    (r: RequestRow) => {
      if (r.status !== 'submitted') return false
      if (isRobaAdminOrRrhh) return true
      if (!isDeptLeadLimited) return false
      return departmentsInSameRobaScope(String(r.requestingDepartment || ''), sessionDeptLabel)
    },
    [isRobaAdminOrRrhh, isDeptLeadLimited, sessionDeptLabel]
  )

  const resetNewRequestForm = useCallback(() => {
    setSelectedRequestId('')
    if (isDeptLeadLimited) {
      if (lockedDept) setDept(lockedDept)
      else if (sessionDeptLabel) setDept(sessionDeptLabel as DepartmentId)
    } else if (isRobaWorkerSelf) {
      if (lockedDeptWorkerSelf) setDept(lockedDeptWorkerSelf)
    } else {
      setDept(DEPARTMENTS[0])
    }

    if (isRobaWorkerSelf && robaLinkedPersonnelId) setWorkerId(robaLinkedPersonnelId)
    else setWorkerId('')
    setRequestNotes('')
    setLines([{ productId: '', qty: '1' }])
  }, [
    isDeptLeadLimited,
    lockedDept,
    sessionDeptLabel,
    isRobaWorkerSelf,
    lockedDeptWorkerSelf,
    robaLinkedPersonnelId,
  ])

  const deleteRequest = async (r: RequestRow) => {
    if (!isRobaAdmin) return
    const ref = String(r.reference || '').trim() || `S-${r.id}`
    const ok = window.confirm(
      `Voleu eliminar definitivament aquesta sol·licitud?\n\n${ref}\n\nSi estava preparada amb reserva d'estoc, s'alliberarà. Aquesta acció no es pot desfer.`
    )
    if (!ok) return
    setDeleteRequestBusyId(r.id)
    try {
      await api(`/api/roba-personal/requests/${r.id}`, { method: 'DELETE' })
      toast({ title: 'Sol·licitud eliminada' })
      if (selectedRequestId === r.id) resetNewRequestForm()
      void load()
    } catch (e: unknown) {
      toast({
        title: "No s'ha pogut eliminar",
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setDeleteRequestBusyId(null)
    }
  }

  const fillFormFromRequest = useCallback((request: RequestRow) => {
    if (selectedRequestId === request.id) {
      resetNewRequestForm()
      return
    }
    setSelectedRequestId(request.id)
    setDept(request.requestingDepartment as DepartmentId)
    setWorkerId(String(request.requestedByWorkerId || '').trim())
    setRequestNotes(String(request.notes || '').trim())
    setLines(
      (request.lines || []).length > 0
        ? request.lines.map((line) => ({
            productId: line.productId,
            qty: String(line.quantity),
          }))
        : [{ productId: '', qty: '1' }]
    )
  }, [resetNewRequestForm, selectedRequestId])

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1' }])

  const removeLine = (i: number) => {
    setLines((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const crear = async () => {
    const effectiveWorkerId = isRobaWorkerSelf ? robaLinkedPersonnelId : workerId.trim()
    if (!effectiveWorkerId) {
      toast({
        title: 'Trieu el treballador',
        description: 'Cal indicar per a qui és la sol·licitud.',
        variant: 'destructive',
      })
      return
    }
    const payloadLines = lines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies vàlides',
        description:
          'Per cada línia cal triar un producte i una quantitat numèrica més gran que zero.',
        variant: 'destructive',
      })
      return
    }
    try {
      await api('/api/roba-personal/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestingDepartment: dept,
          requestedByWorkerId: effectiveWorkerId,
          lines: payloadLines,
          notes: requestNotes.trim() || undefined,
        }),
      })
      toast({ title: 'Sol·licitud creada' })
      setLines([{ productId: '', qty: '1' }])
      setRequestNotes('')
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const crearPreparacioDirecta = async () => {
    if (!workerId.trim()) {
      toast({
        title: 'Trieu el treballador',
        description: 'Cal indicar per a qui prepareu el material.',
        variant: 'destructive',
      })
      return
    }
    if (!directPreparePickupDate.trim()) {
      toast({
        title: 'Falta la data',
        description: 'Cal indicar el dia de recollida.',
        variant: 'destructive',
      })
      return
    }
    const payloadLines = lines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten línies vàlides',
        description: 'Cal almenys un producte amb quantitat vàlida per preparar.',
        variant: 'destructive',
      })
      return
    }

    setDirectPrepareBusy(true)
    try {
      const created = await api<RequestRow>('/api/roba-personal/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestingDepartment: dept,
          requestedByWorkerId: workerId.trim(),
          lines: payloadLines,
          status: 'sent_to_rrhh',
        }),
      })
      await api(`/api/roba-personal/requests/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'prepared',
          pickupDate: directPreparePickupDate.trim(),
          pickupAvailabilityMessage: directPrepareMessage.trim() || undefined,
          prepareWithoutStockReservation: directPrepareWithoutStock || undefined,
          lines: payloadLines,
        }),
      })
      toast({ title: 'Preparació directa creada' })
      setLines([{ productId: '', qty: '1' }])
      setDirectPrepareMessage('')
      setDirectPrepareWithoutStock(false)
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setDirectPrepareBusy(false)
    }
  }

  const prodLabel = useCallback((id: string) => {
    const p = productById(products, id)
    if (!p) return id
    const t = (p.size ?? '').trim()
    return t ? `${p.code} ${p.name} · talla ${t}` : `${p.code} ${p.name}`
  }, [products])

  const router = useRouter()

  const deliveriesOpenWorkerReceiptCorrection = useMemo(() => {
    if (!isPickupMode || isRobaWorkerSelf) return []
    return deliveries.filter((d) => {
      if (d.workerReceiptCorrectionOpen !== true) return false
      if (isRobaAdminOrRrhh) return true
      if (isDeptLeadLimited) {
        const reqDept = String(d.requestRequestingDepartment || '').trim()
        const wDept = workers.find((w) => w.id === d.workerId)?.department || ''
        const dept = reqDept || wDept
        return departmentsInSameRobaScope(dept, sessionDeptLabel)
      }
      return false
    })
  }, [
    deliveries,
    isPickupMode,
    isRobaWorkerSelf,
    isRobaAdminOrRrhh,
    isDeptLeadLimited,
    workers,
    sessionDeptLabel,
  ])

  const autoOpenedPickupCorrectionRef = useRef('')

  const openPickupDeliveryCorrection = useCallback((r: DeliveryRow) => {
    setPickupCorrectTarget(r)
    const prop = r.workerReceiptDisputeProposedLines
    const from =
      prop && prop.length > 0
        ? prop.map((l) => ({ productId: l.productId, qty: String(l.quantity) }))
        : (r.lines || []).map((l) => ({ productId: l.productId, qty: String(l.quantity) }))
    setPickupCorrectLinesEditor(from.length ? from : [{ productId: '', qty: '1' }])
    setPickupCorrectNote('')
  }, [])

  const addPickupCorrectLine = useCallback(() => {
    setPickupCorrectLinesEditor((L) => [...L, { productId: '', qty: '1' }])
  }, [])

  const removePickupCorrectLine = useCallback((i: number) => {
    setPickupCorrectLinesEditor((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }, [])

  const submitPickupDeliveryCorrection = useCallback(async () => {
    if (!pickupCorrectTarget) return
    const parsedLines = pickupCorrectLinesEditor
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (parsedLines.length === 0) {
      toast({ title: 'Cal almenys una línia vàlida', variant: 'destructive' })
      return
    }
    setPickupCorrectBusy(true)
    try {
      await api(`/api/roba-personal/deliveries/${pickupCorrectTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'correctDeliveryLines',
          lines: parsedLines,
          note: pickupCorrectNote.trim() || undefined,
        }),
      })
      toast({ title: 'Entrega corregida', description: "S'ha notificat el treballador." })
      autoOpenedPickupCorrectionRef.current = ''
      setPickupCorrectTarget(null)
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setPickupCorrectBusy(false)
    }
  }, [pickupCorrectTarget, pickupCorrectLinesEditor, pickupCorrectNote, load])

  useEffect(() => {
    const id = highlightDeliveryId.trim()
    if (!id) {
      autoOpenedPickupCorrectionRef.current = ''
      return
    }
    if (!isPickupMode) return
    if (autoOpenedPickupCorrectionRef.current === id) return
    const d = deliveries.find((x) => x.id === id && x.workerReceiptCorrectionOpen === true)
    if (!d) return
    autoOpenedPickupCorrectionRef.current = id
    openPickupDeliveryCorrection(d)
    const t = window.setTimeout(() => {
      document.getElementById(`roba-pickup-delivery-corr-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 250)
    return () => window.clearTimeout(t)
  }, [highlightDeliveryId, isPickupMode, deliveries, openPickupDeliveryCorrection])

  const normalizeSolicFilter = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()

  const filteredListRows = useMemo(() => {
    return rows.filter((r) => {
      const day = robaRequestCalendarDay(r.createdAt)
      if (day) {
        if (day < listRangeStart || day > listRangeEnd) return false
      }
      if (listFilterDept && r.requestingDepartment !== listFilterDept) return false
      if (listFilterStatus && r.status !== listFilterStatus) return false
      if (isPrepareMode && r.status !== 'sent_to_rrhh') return false
      if (isRequestsMode && !REQUEST_VISIBLE_STATUSES.includes(r.status as (typeof REQUEST_VISIBLE_STATUSES)[number])) {
        return false
      }
      if (
        isPickupMode &&
        !['submitted', 'sent_to_rrhh', 'prepared', 'ready_for_worker_delivery', 'picked_up', 'cancelled'].includes(r.status)
      ) {
        return false
      }
      const q = normalizeSolicFilter(listSearch)
      if (q) {
        const wname =
          r.requestedByWorkerName?.trim() ||
          (r.requestedByWorkerId ? workers.find((w) => w.id === r.requestedByWorkerId)?.name : '') ||
          ''
        const hay = [
          r.reference,
          r.id,
          r.requestingDepartment,
          String(r.createdByUserName || ''),
          wname,
          ...(r.lines || []).map((l) => prodLabel(l.productId)),
        ]
          .filter(Boolean)
          .join(' ')
        if (!normalizeSolicFilter(hay).includes(q)) return false
      }
      return true
    })
  }, [
    rows,
    listRangeStart,
    listRangeEnd,
    listFilterDept,
    listFilterStatus,
    isPickupMode,
    isPrepareMode,
    isRequestsMode,
    listSearch,
    workers,
    prodLabel,
  ])

  const groupedListRows = useMemo(() => {
    const map = new Map<string, RequestRow[]>()
    for (const r of filteredListRows) {
      const dk = robaRequestCalendarDay(r.createdAt) ?? 'sense-data'
      if (!map.has(dk)) map.set(dk, [])
      map.get(dk)!.push(r)
    }
    const entries = [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
    for (const [, list] of entries) {
      list.sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')))
    }
    return entries
  }, [filteredListRows])

  const batchSendableRows = useMemo(
    () => filteredListRows.filter((row) => isPickupMode && canSendToRrhhClient(row)),
    [filteredListRows, isPickupMode, canSendToRrhhClient]
  )

  const selectedBatchRows = useMemo(
    () => batchSendableRows.filter((row) => selectedBatchRequestIds.includes(row.id)),
    [batchSendableRows, selectedBatchRequestIds]
  )

  useEffect(() => {
    setSelectedBatchRequestIds((current) =>
      current.filter((id) => batchSendableRows.some((row) => row.id === id))
    )
  }, [batchSendableRows])

  const allBatchSendableSelected =
    batchSendableRows.length > 0 && selectedBatchRows.length === batchSendableRows.length

  const toggleBatchSelection = useCallback((requestId: string, checked: boolean) => {
    setSelectedBatchRequestIds((current) => {
      if (checked) return current.includes(requestId) ? current : [...current, requestId]
      return current.filter((id) => id !== requestId)
    })
  }, [])

  const toggleAllBatchSelection = useCallback((checked: boolean) => {
    setSelectedBatchRequestIds(checked ? batchSendableRows.map((row) => row.id) : [])
  }, [batchSendableRows])

  const tableColumnCount = isPickupMode ? SOLIC_TABLE_COLS + 1 : SOLIC_TABLE_COLS

  const buildSollicitudsExportRows = useCallback(
    () =>
      filteredListRows.map((r) => {
        const requestedLines = (r.originalRequestedLines || r.lines || []) as Array<{
          productId: string
          quantity: number
        }>
        const requestedTotal = requestedLines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)
        const preparedTotal = (r.lines || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0)
        const hasPreparation = ['prepared', 'ready_for_worker_delivery', 'picked_up', 'fulfilled', 'receipt_confirmed'].includes(r.status)
        const hasLinkedDelivery = deliveries.some(
          (x) => String(x.requestId || '').trim() === r.id
        )
        const delByProd = hasLinkedDelivery
          ? deliveredQtyByProductForRequestId(deliveries, r.id)
          : null
        const deliveredTotal = totalDeliveredUnitsForRequest(deliveries, r.id)
        const displayPreparedTotal = hasLinkedDelivery ? deliveredTotal : hasPreparation ? preparedTotal : 0
        const Linies = (r.lines || [])
          .map((l) => {
            const reqQ =
              requestedLines.find((x) => x.productId === l.productId)?.quantity ?? l.quantity
            const qtyShown = delByProd
              ? delByProd.get(l.productId) ?? 0
              : hasPreparation
                ? Number(l.quantity) || 0
                : Number(reqQ) || 0
            const base = `${prodLabel(l.productId)} x ${qtyShown}`
            if (Number(reqQ) !== Number(qtyShown)) return `${base} (sol. ${reqQ})`
            return base
          })
          .join('; ')
        return {
          Data: formatDateTimeValue(r.createdAt),
          Referencia: r.reference ?? `S-${r.id}`,
          Sol·licitant: String(r.createdByUserName || '').trim(),
          Departament: r.requestingDepartment,
          Treballador:
            r.requestedByWorkerName?.trim() ||
            (r.requestedByWorkerId
              ? workers.find((w) => w.id === r.requestedByWorkerId)?.name ?? ''
              : ''),
          Estat: ROBA_REQUEST_STATUS_LABEL[r.status] || r.status,
          QtSollicitada: requestedTotal,
          QtPreparada: displayPreparedTotal,
          Linies,
        }
      }),
    [filteredListRows, deliveries, workers, prodLabel]
  )

  const handleSollicitudsExportXlsx = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-sollicituds')
      await exportRowsToXlsx([{ name: 'Sollicituds', rows: buildSollicitudsExportRows() }], base)
      toast({ title: 'Exportació XLSX completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant XLSX',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildSollicitudsExportRows])

  const handleSollicitudsExportPdf = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-sollicituds')
      await exportRequestReceiptsPdf(
        filteredListRows.map((r) => {
          const workerName =
            r.requestedByWorkerName?.trim() ||
            (r.requestedByWorkerId
              ? workers.find((w) => w.id === r.requestedByWorkerId)?.name ?? ''
              : '') ||
            '-'
          return {
            reference: r.reference ?? `S-${r.id}`,
            requestedAt: formatDateTimeValue(r.createdAt) || '',
            workerName,
            department: r.requestingDepartment || '-',
            status: ROBA_REQUEST_STATUS_LABEL[r.status] || r.status,
            createdByName: String(r.createdByUserName || '').trim() || '-',
            pickupDate: r.pickupDate ? formatDateOnly(r.pickupDate) : undefined,
            lines: (r.lines || []).map((l) => ({
              label: prodLabel(l.productId),
              quantity: l.quantity,
            })),
          }
        }),
        base
      )
      toast({ title: 'Exportació PDF completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [filteredListRows, workers, prodLabel])

  const sollicitudsExportMenuItems = useMemo(
    () => [
      { label: 'Exportar PDF', onClick: handleSollicitudsExportPdf },
      { label: 'Exportar XLSX', onClick: handleSollicitudsExportXlsx },
    ],
    [handleSollicitudsExportPdf, handleSollicitudsExportXlsx]
  )
  useRegisterModuleExportMenu(sollicitudsExportMenuItems)

  return (
    <div className="space-y-6 w-full">
      {isRequestsMode ? (
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Nova sol·licitud</h2>
        <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0">
          {lines.map((ln, i) => (
            <div
              key={i}
              className={cn(
                'grid gap-2 grid-cols-1 md:grid-cols-[minmax(6.5rem,9.5rem)_minmax(9rem,14rem)_minmax(0,1.2fr)_minmax(12rem,0.9fr)_minmax(4.25rem,5.5rem)_auto] md:items-end md:gap-3',
                i > 0 && 'pt-3 mt-2 border-t border-indigo-200/40 dark:border-indigo-900/40'
              )}
            >
              {i === 0 ? (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="sol-dept" className="text-xs text-muted-foreground">
                    Departament sol·licitant
                  </Label>
                  {isDeptLeadLimited || isRobaWorkerSelf ? (
                    <div
                      id="sol-dept"
                      className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground"
                    >
                      {(isRobaWorkerSelf
                        ? lockedDeptWorkerSelf ?? dept
                        : lockedDept ?? sessionDeptLabel) || dept}
                    </div>
                  ) : (
                    <select
                      id="sol-dept"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={dept}
                      onChange={(e) => setDept(e.target.value as DepartmentId)}
                    >
                      {availableRequestDepartments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="hidden md:block min-w-[1px]" aria-hidden />
              )}
              {i === 0 ? (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="sol-worker" className="text-xs text-muted-foreground">
                    Treballador
                  </Label>
                  {isRobaWorkerSelf ? (
                    <div
                      id="sol-worker"
                      className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground"
                    >
                      {workerNameForRequestForm}
                    </div>
                  ) : (
                    <select
                      id="sol-worker"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm min-w-0"
                      value={workerId}
                      onChange={(e) => setWorkerId(e.target.value)}
                    >
                      <option value="">— Trieu —</option>
                      {workersForDept.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name.trim() || '—'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="hidden md:block min-w-[1px]" aria-hidden />
              )}
              <div className="space-y-1 min-w-0">
                <Label className="text-xs text-muted-foreground">Producte</Label>
                <div className="mt-0.5">
                  <ProductSearchCombobox
                    products={products}
                    value={ln.productId}
                    onChange={(v) =>
                      setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                    }
                    placeholder="Cercar i triar…"
                    showStockHint
                    variant="list"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              {i === 0 ? (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="sol-notes" className="text-xs text-muted-foreground">
                    Observacions
                  </Label>
                  <Input
                    id="sol-notes"
                    className="h-9 text-sm"
                    placeholder="Indicacions breus..."
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                  />
                </div>
              ) : (
                <div className="hidden md:block min-w-[1px]" aria-hidden />
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={ln.qty}
                  onChange={(e) => {
                    const v = e.target.value
                    setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                  }}
                />
              </div>
              <div className="flex items-end justify-end md:justify-start pb-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={lines.length <= 1}
                  title={lines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                  aria-label="Eliminar línia"
                  onClick={() => removeLine(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden space-y-1">
          <Label htmlFor="sol-notes" className="text-xs text-muted-foreground">
            Observacions
          </Label>
          <Textarea
            id="sol-notes"
            className="min-h-[70px] text-sm"
            placeholder="Indicacions breus per a la sol·licitud..."
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            + Línia
          </Button>
          <Button type="button" onClick={() => void crear()}>
            Enviar sol·licitud
          </Button>
        </div>
      </div>
      ) : null}

      {isPrepareMode ? (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setDirectPrepareCollapsed((v) => !v)}
            aria-expanded={!directPrepareCollapsed}
          >
            <div className="space-y-1">
              <h2 className="font-semibold text-base">Preparació sense sol·licitud prèvia</h2>
              <p className="text-xs text-muted-foreground">
                Crea una preparació directa quan no vingui d&apos;una sol·licitud prèvia.
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
                !directPrepareCollapsed && 'rotate-180'
              )}
            />
          </button>
          {!directPrepareCollapsed ? (
            <>
              <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Departament sol·licitant</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={dept}
                      onChange={(e) => setDept(e.target.value as DepartmentId)}
                    >
                      {availableRequestDepartments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <Label className="text-xs text-muted-foreground">Treballador</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm min-w-0"
                      value={workerId}
                      onChange={(e) => setWorkerId(e.target.value)}
                    >
                      <option value="">— Trieu —</option>
                      {workersForDept.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name.trim() || '—'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {lines.map((ln, i) => (
                  <div
                    key={`direct-${i}`}
                    className={cn(
                      'grid gap-2 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(4.25rem,5.5rem)_auto] md:items-end md:gap-3',
                      i > 0 && 'pt-3 mt-2 border-t border-indigo-200/40 dark:border-indigo-900/40'
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <Label className="text-xs text-muted-foreground">Producte</Label>
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(v) =>
                          setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                        }
                        placeholder="Cercar i triar…"
                        showStockHint
                        variant="list"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        className="h-9"
                        type="number"
                        value={ln.qty}
                        onChange={(e) => {
                          const v = e.target.value
                          setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                        }}
                      />
                    </div>
                    <div className="flex items-end justify-end md:justify-start pb-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={lines.length <= 1}
                        onClick={() => removeLine(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="direct-pickup-date">Dia de recollida</Label>
                    <Input
                      id="direct-pickup-date"
                      type="date"
                      className="h-9"
                      value={directPreparePickupDate}
                      onChange={(e) => setDirectPreparePickupDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <Switch
                        id="direct-prep-no-stock"
                        checked={directPrepareWithoutStock}
                        onCheckedChange={(v) => setDirectPrepareWithoutStock(Boolean(v))}
                      />
                      <Label htmlFor="direct-prep-no-stock" className="text-sm font-normal cursor-pointer leading-snug">
                        Sense reserva d'estoc
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="direct-prepare-msg" className="text-xs text-muted-foreground">
                    Missatge (opcional)
                  </Label>
                  <Textarea
                    id="direct-prepare-msg"
                    className="min-h-[64px] text-sm"
                    placeholder="Ex.: material disponible a partir de…"
                    value={directPrepareMessage}
                    onChange={(e) => setDirectPrepareMessage(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  + Línia
                </Button>
                <Button type="button" disabled={directPrepareBusy} onClick={() => void crearPreparacioDirecta()}>
                  {directPrepareBusy ? 'Preparant…' : 'Preparar sense sol·licitud'}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {deliveriesOpenWorkerReceiptCorrection.length > 0 ? (
        <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 dark:bg-amber-950/25 dark:border-amber-800/50 p-4 sm:p-5 space-y-3 w-full">
          <h3 className="font-semibold text-sm sm:text-base text-amber-950 dark:text-amber-50">
            Entregues amb sol·licitud de rectificació
          </h3>
          <p className="text-xs text-amber-900/90 dark:text-amber-100/85 leading-relaxed">
            Un treballador ha demanat revisió de quantitats sobre una entrega ja registrada. Corregiu el registre aquí
            mateix: l&apos;estoc i l&apos;historial de moviments s&apos;actualitzen automàticament i el treballador rep
            un avís per tornar a confirmar a la pestanya Entregues.
          </p>
          <ul className="space-y-2">
            {deliveriesOpenWorkerReceiptCorrection.map((d) => {
              const wn = workers.find((w) => w.id === d.workerId)?.name?.trim() || d.workerId
              return (
                <li
                  key={d.id}
                  id={`roba-pickup-delivery-corr-${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-background/60 px-3 py-2 text-sm scroll-mt-24"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.reference ?? `E-${d.id}`}</p>
                    <p className="text-xs text-muted-foreground">{wn}</p>
                    {d.workerReceiptDisputeProposedLines?.length ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Proposta del treballador:{' '}
                        {d.workerReceiptDisputeProposedLines.map((l) => `${prodLabel(l.productId)} × ${l.quantity}`).join('; ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="shrink-0"
                      onClick={() => openPickupDeliveryCorrection(d)}
                    >
                      Corregir quantitats
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() =>
                        router.replace(
                          `/menu/roba-personal?tab=entregues&deliveryId=${encodeURIComponent(d.id)}`
                        )
                      }
                    >
                      Veure a Entregues
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">
          {isPrepareMode ? 'Sol·licituds per preparar' : isPickupMode ? 'Recepcions' : 'Sol·licituds'}
        </h2>
        <CorporateFiltersShell showHeader={false} variant="toolbar" className="mb-3 border-0 shadow-none">
          <SmartFilters
            modeDefault="week"
            modeOptions={['week', 'day', 'range']}
            role="Treballador"
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            showAdvanced={false}
            compact
            onChange={handleSmartDateChange}
            resetSignal={listFiltersResetSignal}
            initialStart={listRangeStart}
            initialEnd={listRangeEnd}
          />
          <CorporateFilterSearch
            className="min-w-[12rem] max-w-md flex-1 basis-[14rem]"
            placeholder="Cercar ref., nom, producte…"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            aria-label="Cercar sol·licituds"
          />
          <FilterButton
            onClick={() => {
              setContent(robaFiltersSlidePanel)
            }}
          />
        </CorporateFiltersShell>

        {filteredListRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-10 text-sm">
            Cap sol·licitud en aquest període o amb aquests filtres.
          </p>
        ) : (
          <div className="space-y-3">
            {isPickupMode && batchSendableRows.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-emerald-950">
                  <span className="font-semibold">{selectedBatchRows.length}</span> de{' '}
                  <span className="font-semibold">{batchSendableRows.length}</span> solÂ·licitud(s) seleccionades per
                  enviar a RRHH en una sola remesa.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllBatchSelection(!allBatchSendableSelected)}
                  >
                    {allBatchSendableSelected ? 'Deseleccionar totes' : 'Seleccionar totes'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={selectedBatchRows.length === 0}
                    onClick={() => openSendToRrhhDialog(selectedBatchRows)}
                  >
                    Enviar remesa a RRHH
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-border shadow-sm bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/30 text-emerald-900 dark:text-emerald-100 text-sm">
                  {isPickupMode ? (
                    <TableHead className={cn(taulaThText, 'w-[52px] py-2 text-center')}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input align-middle"
                        checked={allBatchSendableSelected}
                        onChange={(e) => toggleAllBatchSelection(e.target.checked)}
                        aria-label="Seleccionar totes les solÂ·licituds enviables a RRHH"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead
                    className={cn(
                      taulaThText,
                      'py-2 sticky left-0 z-30 bg-emerald-50 dark:bg-emerald-950/50 max-w-[9rem]'
                    )}
                  >
                    Sol·licitant
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2')}>Dept</TableHead>
                  <TableHead className={cn(taulaThText, 'py-2 min-w-[8rem]')}>Treballador</TableHead>
                  <TableHead className={cn(taulaThText, 'min-w-[10rem] py-2')}>Producte</TableHead>
                  <TableHead
                    className={cn(taulaThText, 'text-right whitespace-nowrap py-2')}
                  >
                    Qt. sollicitada
                  </TableHead>
                  <TableHead
                    className={cn(taulaThText, 'text-right whitespace-nowrap py-2')}
                  >
                    Qt. preparada
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2')}>Estat</TableHead>
                  <TableHead className={cn(taulaThText, 'whitespace-nowrap w-[1%] py-2')}>Ref.</TableHead>
                  <TableHead className={cn(taulaThText, 'w-[320px] py-2')}>Accions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedListRows.map(([dayKey, dayRows]) => (
                  <Fragment key={dayKey}>
                    <TableRow className="bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold">
                      <TableCell colSpan={tableColumnCount} className="py-2 text-sm">
                        {formatRobaDayGroupLabel(dayKey)}
                      </TableCell>
                    </TableRow>
                    {dayRows.map((r) => {
                      const requestedLines = (r.originalRequestedLines || r.lines || []) as Array<{
                        productId: string
                        quantity: number
                      }>
        const requestedTotal = requestedLines.reduce(
          (a, l) => a + (Number(l.quantity) || 0),
          0
        )
        const preparedTotal = (r.lines || []).reduce(
          (a, l) => a + (Number(l.quantity) || 0),
          0
        )
        const hasPreparation = ['prepared', 'ready_for_worker_delivery', 'picked_up', 'fulfilled', 'receipt_confirmed'].includes(r.status)
        const hasLinkedDelivery = deliveries.some(
          (x) => String(x.requestId || '').trim() === r.id
        )
        const delByProd = hasLinkedDelivery
          ? deliveredQtyByProductForRequestId(deliveries, r.id)
          : null
        const deliveredTotal = totalDeliveredUnitsForRequest(deliveries, r.id)
        const displayPreparedTotal = hasLinkedDelivery
          ? deliveredTotal
          : hasPreparation
            ? preparedTotal
            : 0
                      const requester = String(r.createdByUserName || '').trim() || '—'
                      const hid = highlightRequestId.trim() === r.id
                      return (
                        <TableRow
                          key={r.id}
                          id={`roba-req-${r.id}`}
                          onClick={() => fillFormFromRequest(r)}
                          className={cn(
                            'cursor-pointer text-xs sm:text-sm hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25 transition-colors',
                            hid ? 'bg-indigo-500/10 ring-1 ring-indigo-400/40' : undefined,
                            selectedRequestId === r.id ? 'bg-emerald-50 dark:bg-emerald-950/20' : undefined
                          )}
                        >
                          {isPickupMode ? (
                            <TableCell
                              className="align-top text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canSendToRrhhClient(r) ? (
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 rounded border-input"
                                  checked={selectedBatchRequestIds.includes(r.id)}
                                  onChange={(e) => toggleBatchSelection(r.id, e.target.checked)}
                                  aria-label={`Seleccionar ${r.reference ?? r.id} per enviar a RRHH`}
                                />
                              ) : null}
                            </TableCell>
                          ) : null}
                          <TableCell
                            className={cn(
                              'text-sm align-top max-w-[9rem] sticky left-0 z-20 bg-card',
                              hid ? 'bg-indigo-500/10' : selectedRequestId === r.id ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-card'
                            )}
                          >
                            <span className="line-clamp-2" title={requester}>
                              {requester}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm align-top">{r.requestingDepartment}</TableCell>
                          <TableCell className="text-sm align-top max-w-[10rem]">
                            <span className="line-clamp-2">
                              {r.requestedByWorkerName?.trim() ||
                                (r.requestedByWorkerId
                                  ? workers.find((w) => w.id === r.requestedByWorkerId)?.name ?? '—'
                                  : '—')}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs align-top max-w-[16rem]">
                            <ul className="space-y-1 list-none pl-0 m-0">
                              {(r.lines || []).map((l, idx) => {
                                const reqQ =
                                  requestedLines.find((x) => x.productId === l.productId)?.quantity ??
                                  (Number(l.quantity) || 0)
                                const showQ = delByProd
                                  ? delByProd.get(l.productId) ?? 0
                                  : hasPreparation
                                    ? Number(l.quantity) || 0
                                    : Number(reqQ) || 0
                                return (
                                  <li key={`${l.productId}-${idx}`} className="leading-snug">
                                    <span className="text-foreground">{prodLabel(l.productId)}</span>
                                    <span className="text-muted-foreground tabular-nums">
                                      {' '}
                                      × {showQ}
                                      {showQ !== reqQ ? (
                                        <span className="text-[10px] font-normal opacity-80">
                                          {' '}
                                          (sol. {reqQ})
                                        </span>
                                      ) : null}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          </TableCell>
                          <TableCell className="text-sm align-top text-right font-medium tabular-nums whitespace-nowrap">
                            {requestedTotal}
                          </TableCell>
                          <TableCell className="text-sm align-top text-right font-medium tabular-nums whitespace-nowrap">
                            {displayPreparedTotal}
                          </TableCell>
                          <TableCell className="text-sm align-top min-w-[7rem]">
                            <span className="font-medium">
                              {ROBA_REQUEST_STATUS_LABEL[r.status] || r.status}
                            </span>
                            {r.notes ? (
                              <span className="mt-1 block text-[10px] text-muted-foreground line-clamp-2">
                                {r.notes}
                              </span>
                            ) : null}
                            {r.pickupDate && r.status === 'prepared' ? (
                              <span className="block text-[10px] text-muted-foreground">
                                Recollida: {formatDateOnly(r.pickupDate)}
                                {r.preparedWithStockReservation === false ? (
                                  <span className="ml-1 rounded bg-amber-500/20 px-1 text-amber-950 dark:text-amber-100">
                                    sense reserva
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            {r.pickupAvailabilityMessage && r.status === 'prepared' ? (
                              <span className="block text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                                {r.pickupAvailabilityMessage}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-[10px] text-muted-foreground font-mono whitespace-nowrap pt-2.5">
                            {r.reference ?? `S-${r.id}`}
                          </TableCell>
                          <TableCell className="align-top min-w-[320px]" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap items-start gap-2">
                              {isPrepareMode && r.status === 'sent_to_rrhh' && isRobaAdminOrRrhh ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => openPrepare(r)}
                                >
                                  Preparat (RRHH)
                                </Button>
                              ) : null}
                              {isPickupMode && canEditRequestQuantitiesClient(r) ? (
                                <Button
                                  type="button"
                                  variant="default"
                                  size="sm"
                                  className="h-8 bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600"
                                  onClick={() => openEditRequestDialog(r)}
                                >
                                  Rectificar quantitats
                                </Button>
                              ) : null}
                              {isPickupMode && canSendToRrhhClient(r) ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => openSendToRrhhDialog([r])}
                                >
                                  Enviar a RRHH
                                </Button>
                              ) : null}
                              {isPickupMode && canMarkPickedUpClient(r) ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => openPickup(r)}
                                >
                                  Validar preparació
                                </Button>
                              ) : null}
                              {canCancelRequestClient(r) ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-destructive border-destructive/40"
                                  onClick={() => void cancelRequest(r.id)}
                                >
                                  Cancel·lar
                                </Button>
                              ) : null}
                              {isRobaAdmin ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={deleteRequestBusyId === r.id}
                                  onClick={() => void deleteRequest(r)}
                                >
                                  {deleteRequestBusyId === r.id ? 'Eliminant...' : 'Eliminar'}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          </div>
        )}
      </div>

      <Dialog open={sendToRrhhOpen} onOpenChange={(open) => !open && closeSendToRrhhDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {sendToRrhhTargets.length > 1 ? 'Enviar remesa a RRHH' : 'Enviar a RRHH'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sendToRrhhTargets.length > 1 ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                  Remesa agrupada de {sendToRrhhTargets.length} sol·licitud(s)
                </div>
                <div className="mt-1">
                  Referències: {sendToRrhhTargets.map((request) => request.reference ?? request.id).join(', ')}
                </div>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              RRHH rebrà la notificació interna. El correu només s’enviarà a les adreces que indiqueu aquí.
            </p>
            <div className="space-y-1">
              <Label htmlFor="rrhh-extra-email">Correus</Label>
              <Input
                id="rrhh-extra-email"
                className="h-9 font-mono text-sm"
                value={sendToRrhhEmail}
                onChange={(e) => setSendToRrhhEmail(e.target.value)}
                placeholder="exemple@calblay.com, altra@calblay.com"
              />
              <p className="text-xs text-muted-foreground">
                Separeu-los amb coma, punt i coma o espai.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={sendToRrhhRememberEmail}
                onChange={(e) => setSendToRrhhRememberEmail(e.target.checked)}
              />
              Guardar per la propera vegada
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeSendToRrhhDialog}>
              Cancel·lar
            </Button>
            <Button type="button" disabled={sendToRrhhBusy} onClick={() => void confirmSendToRrhh()}>
              {sendToRrhhBusy ? 'Enviant…' : 'Enviar a RRHH'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editRequestOpen}
        onOpenChange={(open) => {
          setEditRequestOpen(open)
          if (!open) {
            setEditRequestTarget(null)
            setEditRequestLines([])
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1 shrink-0">
            <DialogTitle>Rectificar quantitats de la sol·licitud</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Ajusteu les línies des de recepcions abans d&apos;enviar la petició a RRHH o mentre encara estigui pendent de preparar.
            </p>
          </DialogHeader>
          <div className="px-6 pb-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            {editRequestTarget ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-between items-baseline">
                  <span>
                    <span className="text-muted-foreground text-xs">Dept</span>{' '}
                    <span className="font-medium">{editRequestTarget.requestingDepartment}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {editRequestTarget.reference ?? editRequestTarget.id}
                  </span>
                </div>
                <p>
                  <span className="text-muted-foreground text-xs">Treballador</span>{' '}
                  <span className="font-medium">
                    {editRequestTarget.requestedByWorkerName?.trim() ||
                      (editRequestTarget.requestedByWorkerId
                        ? workers.find((w) => w.id === editRequestTarget.requestedByWorkerId)?.name ?? '—'
                        : '—')}
                  </span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Línies rectificades</Label>
              <div className="space-y-2">
                {editRequestLines.map((ln, i) => (
                  <div
                    key={`edit-request-${i}-${ln.productId}`}
                    className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-border/80 bg-background/50 p-2"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Producte</span>
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(value) =>
                          setEditRequestLines((current) =>
                            current.map((item, index) => (index === i ? { ...item, productId: value } : item))
                          )
                        }
                        placeholder="Cercar..."
                        showStockHint
                        variant="list"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 items-end shrink-0">
                      <div className="space-y-0.5 w-[4.5rem]">
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input
                          className="h-9 tabular-nums"
                          type="number"
                          min={1}
                          value={ln.qty}
                          onChange={(e) => {
                            const value = e.target.value
                            setEditRequestLines((current) =>
                              current.map((item, index) => (index === i ? { ...item, qty: value } : item))
                            )
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10"
                        disabled={editRequestLines.length <= 1}
                        title={editRequestLines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                        aria-label="Eliminar línia"
                        onClick={() =>
                          setEditRequestLines((current) =>
                            current.length <= 1 ? current : current.filter((_, index) => index !== i)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setEditRequestLines((current) => [...current, { productId: '', qty: '1' }])}
              >
                + Línia
              </Button>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditRequestOpen(false)}>
              Tancar
            </Button>
            <Button type="button" disabled={editRequestBusy} onClick={() => void confirmEditRequest()}>
              {editRequestBusy ? 'Guardant...' : 'Guardar rectificació'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={prepareOpen} onOpenChange={setPrepareOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1 shrink-0">
            <DialogTitle>Marca com a preparat (RRHH)</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Ajusteu les quantitats si cal; es reservarà estoc segons el que confirmeu. Avisos i calendari segons la
              data i nota de sota.
            </p>
          </DialogHeader>
          <div className="px-6 pb-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            {prepareSummary ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-between items-baseline">
                  <span>
                    <span className="text-muted-foreground text-xs">Dept</span>{' '}
                    <span className="font-medium">{prepareSummary.requestingDepartment}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {prepareSummary.reference ?? prepareSummary.id}
                  </span>
                </div>
                <p>
                  <span className="text-muted-foreground text-xs">Sol·licitant</span>{' '}
                  <span className="font-medium">
                    {String(prepareSummary.createdByUserName || '').trim() || '—'}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground text-xs">Treballador</span>{' '}
                  <span className="font-medium">
                    {prepareSummary.requestedByWorkerName?.trim() ||
                      (prepareSummary.requestedByWorkerId
                        ? workers.find((w) => w.id === prepareSummary.requestedByWorkerId)?.name ?? '—'
                        : '—')}
                  </span>
                </p>
                <p className="text-sm pt-0.5 border-t border-border/60 mt-1">
                  <span className="text-muted-foreground text-xs">Total unitats a preparar</span>{' '}
                  <span className="font-semibold tabular-nums text-base">{prepareTotalUnits}</span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Línies</Label>
              <div className="space-y-2">
                {prepareLines.map((ln, i) => (
                  <div
                    key={`prep-${i}-${ln.productId}`}
                    className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-border/80 bg-background/50 p-2"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Producte</span>
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(v) =>
                          setPrepareLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                        }
                        placeholder="Cercar…"
                        showStockHint
                        variant="list"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 items-end shrink-0">
                      <div className="space-y-0.5 w-[4.5rem]">
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input
                          className="h-9 tabular-nums"
                          type="number"
                          min={1}
                          value={ln.qty}
                          onChange={(e) => {
                            const v = e.target.value
                            setPrepareLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10"
                        disabled={prepareLines.length <= 1}
                        title={prepareLines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                        aria-label="Eliminar línia"
                        onClick={() =>
                          setPrepareLines((L) =>
                            L.length <= 1 ? L : L.filter((_, j) => j !== i)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setPrepareLines((L) => [...L, { productId: '', qty: '1' }])}
              >
                + Línia
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pickup-date">Dia de recollida</Label>
              <Input
                id="pickup-date"
                type="date"
                className="h-9"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pickup-msg" className="text-xs text-muted-foreground">
                Missatge (opcional)
              </Label>
              <Textarea
                id="pickup-msg"
                className="min-h-[64px] text-sm"
                placeholder="Ex.: material disponible a partir de…"
                value={prepareMessage}
                onChange={(e) => setPrepareMessage(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Switch
                id="prep-no-stock"
                checked={prepareWithoutStock}
                onCheckedChange={(v) => setPrepareWithoutStock(Boolean(v))}
              />
              <Label htmlFor="prep-no-stock" className="text-sm font-normal cursor-pointer leading-snug">
                Sense reserva d’estoc (material pendent o sense estoc ara)
              </Label>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPrepareOpen(false)}>
              Tanca
            </Button>
            <Button type="button" onClick={() => void confirmPrepare()}>
              Confirmar preparació
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickupOpen} onOpenChange={setPickupOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1 shrink-0">
            <DialogTitle>Confirma recollida del departament</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Ajusteu la quantitat real recollida. En confirmar, es descomptarà l&apos;estoc físic i s&apos;alliberarà la reserva d&apos;aquesta sol·licitud.
            </p>
          </DialogHeader>
          <div className="px-6 pb-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            {pickupSummary ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-between items-baseline">
                  <span>
                    <span className="text-muted-foreground text-xs">Dept</span>{' '}
                    <span className="font-medium">{pickupSummary.requestingDepartment}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {pickupSummary.reference ?? pickupSummary.id}
                  </span>
                </div>
                <p>
                  <span className="text-muted-foreground text-xs">Treballador</span>{' '}
                  <span className="font-medium">
                    {pickupSummary.requestedByWorkerName?.trim() ||
                      (pickupSummary.requestedByWorkerId
                        ? workers.find((w) => w.id === pickupSummary.requestedByWorkerId)?.name ?? '—'
                        : '—')}
                  </span>
                </p>
                <p className="text-sm pt-0.5 border-t border-border/60 mt-1">
                  <span className="text-muted-foreground text-xs">Total unitats recollides</span>{' '}
                  <span className="font-semibold tabular-nums text-base">{pickupTotalUnits}</span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Línies recollides</Label>
              <div className="space-y-2">
                {pickupLines.map((ln, i) => (
                  <div
                    key={`pickup-${i}-${ln.productId}`}
                    className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-border/80 bg-background/50 p-2"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Producte</span>
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(v) =>
                          setPickupLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                        }
                        placeholder="Cercar…"
                        showStockHint
                        variant="list"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 items-end shrink-0">
                      <div className="space-y-0.5 w-[4.5rem]">
                        <Label className="text-[10px] text-muted-foreground">Qty</Label>
                        <Input
                          className="h-9 tabular-nums"
                          type="number"
                          min={1}
                          value={ln.qty}
                          onChange={(e) => {
                            const v = e.target.value
                            setPickupLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10"
                        disabled={pickupLines.length <= 1}
                        title={pickupLines.length <= 1 ? 'Mínim una línia' : 'Eliminar línia'}
                        aria-label="Eliminar línia"
                        onClick={() =>
                          setPickupLines((L) =>
                            L.length <= 1 ? L : L.filter((_, j) => j !== i)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setPickupLines((L) => [...L, { productId: '', qty: '1' }])}
              >
                + Línia
              </Button>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPickupOpen(false)}>
              Tanca
            </Button>
            <Button type="button" onClick={() => void confirmPickup()}>
              Confirmar recollida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickupCorrectTarget != null} onOpenChange={(o) => !o && setPickupCorrectTarget(null)}>
        <DialogContent className="max-w-lg max-h-[min(90vh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Corregir entrega (rectificació)</DialogTitle>
          </DialogHeader>
          {pickupCorrectTarget ? (
            <p className="text-xs text-muted-foreground font-mono">
              {pickupCorrectTarget.reference ?? `E-${pickupCorrectTarget.id}`}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Ajusteu productes i quantitats. L&apos;estoc es mou segons la diferència respecte al registre anterior,
            queda registrat a l&apos;historial de moviments i el treballador haurà de tornar a confirmar la recepció.
          </p>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-3">
            {pickupCorrectLinesEditor.map((ln, i) => (
              <div
                key={i}
                className={cn(
                  'grid gap-2 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(4.25rem,5.5rem)_auto] sm:items-end',
                  i > 0 && 'pt-3 border-t border-border'
                )}
              >
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">Producte</Label>
                  <ProductSearchCombobox
                    products={products}
                    value={ln.productId}
                    onChange={(v) =>
                      setPickupCorrectLinesEditor((L) =>
                        L.map((x, j) => (j === i ? { ...x, productId: v } : x))
                      )
                    }
                    placeholder="Cercar i triar…"
                    showStockHint
                    variant="list"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Qt.</Label>
                  <Input
                    className="h-9"
                    type="number"
                    value={ln.qty}
                    onChange={(e) => {
                      const v = e.target.value
                      setPickupCorrectLinesEditor((L) =>
                        L.map((x, j) => (j === i ? { ...x, qty: v } : x))
                      )
                    }}
                  />
                </div>
                <div className="flex items-end justify-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={pickupCorrectLinesEditor.length <= 1}
                    aria-label="Eliminar línia"
                    onClick={() => removePickupCorrectLine(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addPickupCorrectLine}>
              + Línia
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nota interna (auditoria)</Label>
            <Textarea
              value={pickupCorrectNote}
              onChange={(e) => setPickupCorrectNote(e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="resize-y min-h-[56px] text-sm"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPickupCorrectTarget(null)}>
              Cancel·la
            </Button>
            <Button
              type="button"
              disabled={pickupCorrectBusy}
              onClick={() => void submitPickupDeliveryCorrection()}
            >
              {pickupCorrectBusy ? 'Desant…' : 'Desar correcció'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
