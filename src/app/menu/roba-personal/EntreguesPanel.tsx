'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
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
import { Search, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { DEPARTMENTS } from '@/data/departments'
import { normalizeRole } from '@/lib/roles'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import { robaRequestDocIdFromInput } from '@/lib/roba-personal/dotacioReferenceCodes'
import {
  exportDeliveryReceiptsPdf,
  exportRowsToXlsx,
  robaExportFilename,
} from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { DeliveryRow, ProductRow, RequestRow, WorkerRow } from './robaPersonalTypes'
import { parseRobaTab, ENTREGUES_TABLE_COLS_LEAD, ENTREGUES_TABLE_COLS_WORKER } from './robaPersonalConstants'
import {
  robaRequestCalendarDay,
  robaSollicitudsWeekRange,
  formatRobaDayGroupLabel,
} from './robaPersonalDates'
import { productById } from './robaProductHelpers'
import {
  deliveryReceptionFilterKey,
  entregaDeliveredTotalUnits,
  entregaEstatLabelForLead,
  entregaRequestedTotalUnits,
} from './robaDeliveryHelpers'
import {
  WorkerDeliveryAwaitingCorrectionCard,
  WorkerLeadDeliveryAckCard,
  WorkerReceiptConfirmationCard,
} from './EntreguesWorkerCards'
import { RobaEntregaProducteColumn } from './RobaEntregaProducteColumn'
import { RobaSignaturePad } from './RobaSignaturePad'

export function EntreguesPanel({
  prefillRequestId = '',
  prefillDeliveryId = '',
}: {
  prefillRequestId?: string
  prefillDeliveryId?: string
}) {
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [pendingReceiptRequests, setPendingReceiptRequests] = useState<RequestRow[]>([])
  const [linkedRequest, setLinkedRequest] = useState<RequestRow | null>(null)
  const [workerId, setWorkerId] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])
  const [deliveryWithoutRequest, setDeliveryWithoutRequest] = useState(false)
  const [manualRequestId, setManualRequestId] = useState('')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signaturePadKey, setSignaturePadKey] = useState(0)
  const [linkReqDraft, setLinkReqDraft] = useState<Record<string, string>>({})
  const [busyEntrega, setBusyEntrega] = useState(false)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [applyLinkedBusy, setApplyLinkedBusy] = useState(false)
  const [correctTarget, setCorrectTarget] = useState<DeliveryRow | null>(null)
  const [correctLinesEditor, setCorrectLinesEditor] = useState<{ productId: string; qty: string }[]>(
    [{ productId: '', qty: '1' }]
  )
  const [correctNote, setCorrectNote] = useState('')
  const [correctBusy, setCorrectBusy] = useState(false)
  const [rrhhPrepareOpen, setRrhhPrepareOpen] = useState(false)
  const [rrhhPrepareLines, setRrhhPrepareLines] = useState<{ productId: string; qty: string }[]>([])
  const [rrhhPreparePickupDate, setRrhhPreparePickupDate] = useState('')
  const [rrhhPrepareMessage, setRrhhPrepareMessage] = useState('')
  const [rrhhPrepareWithoutStock, setRrhhPrepareWithoutStock] = useState(false)
  const [rrhhPrepareBusy, setRrhhPrepareBusy] = useState(false)

  const { data: session } = useSession()
  const sessionRoleNorm = normalizeRole((session?.user as { role?: string })?.role)
  const sessionDeptNorm = String((session?.user as { department?: string })?.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const isRobaAdminOrRrhh =
    sessionRoleNorm === 'admin' || sessionDeptNorm === 'recursos humans'
  const isRobaAdmin = sessionRoleNorm === 'admin'
  const isDeptLeadLimited =
    Boolean((session?.user as { isDepartmentRobaLead?: boolean })?.isDepartmentRobaLead) &&
    !isRobaAdminOrRrhh
  const robaLinkedPersonnelId = String(
    (session?.user as { robaLinkedPersonnelId?: string | null })?.robaLinkedPersonnelId || ''
  ).trim()
  const isRobaWorkerSelf = Boolean(robaLinkedPersonnelId) && !isRobaAdminOrRrhh && !isDeptLeadLimited

  const sessionDeptLabel = String((session?.user as { department?: string })?.department || '').trim()
  const robaWorkerDeptNorm = String(
    (session?.user as { robaWorkerDeptNorm?: string | null })?.robaWorkerDeptNorm || ''
  ).trim()
  const lockedDept = useMemo(
    () => DEPARTMENTS.find((d) => departmentsInSameRobaScope(d, sessionDeptLabel)),
    [sessionDeptLabel]
  )
  const lockedDeptWorkerSelf = useMemo(
    () => DEPARTMENTS.find((d) => departmentsInSameRobaScope(d, robaWorkerDeptNorm)),
    [robaWorkerDeptNorm]
  )

  const [entListRangeStart, setEntListRangeStart] = useState(() => robaSollicitudsWeekRange().start)
  const [entListRangeEnd, setEntListRangeEnd] = useState(() => robaSollicitudsWeekRange().end)
  const [entListFilterDept, setEntListFilterDept] = useState('')
  const [entListFilterReception, setEntListFilterReception] = useState('')
  const [entListSearch, setEntListSearch] = useState('')
  const [entListFiltersResetSignal, setEntListFiltersResetSignal] = useState(0)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('')

  const { setContent, open: entFiltersSlideOpen } = useFilters()

  const entDeptFilterOptions = useMemo(() => {
    if (isRobaWorkerSelf) {
      const d = lockedDeptWorkerSelf as string | undefined
      return d ? [d] : [...DEPARTMENTS]
    }
    if (isDeptLeadLimited) {
      const d = (lockedDept ?? sessionDeptLabel) as string | undefined
      return d ? [d] : [...DEPARTMENTS]
    }
    return [...DEPARTMENTS]
  }, [isRobaWorkerSelf, isDeptLeadLimited, lockedDeptWorkerSelf, lockedDept, sessionDeptLabel])

  const handleEntreguesSmartDateChange = useCallback((f: SmartFiltersChange) => {
    if (f.start && f.end) {
      setEntListRangeStart(f.start)
      setEntListRangeEnd(f.end)
    }
  }, [])

  const entFiltersSlidePanel = useMemo(
    () => (
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Departament (treballador)</label>
          <select
            className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            value={entListFilterDept}
            onChange={(e) => setEntListFilterDept(e.target.value)}
          >
            <option value="">Tots</option>
            {entDeptFilterOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Estat recepcio</label>
          <select
            className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900"
            value={entListFilterReception}
            onChange={(e) => setEntListFilterReception(e.target.value)}
          >
            <option value="">Tots</option>
            <option value="pending">Pendent confirmacio treballador</option>
            <option value="dispute">Incidencia / correccio</option>
            <option value="done">Recepcio tancada</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <ResetFilterButton
            onClick={() => {
              setEntListFilterDept('')
              setEntListFilterReception('')
              setEntListFiltersResetSignal((n) => n + 1)
            }}
          />
          <span className="text-xs text-gray-500">Restableir filtres d&apos;aquest panell</span>
        </div>
      </div>
    ),
    [entListFilterDept, entListFilterReception, entDeptFilterOptions]
  )

  useEffect(() => {
    if (!entFiltersSlideOpen) return
    setContent(entFiltersSlidePanel)
  }, [entFiltersSlideOpen, entFiltersSlidePanel, setContent])

  const router = useRouter()
  const entreguesSearchParams = useSearchParams()

  /** Despres d'omplir el formulari des de l'avis: amaga el banner i treu `requestId` de la URL perque no torni a apareixer; mante la vinculacio via camp manual / `effectiveRequestId`. */
  const absorbLinkedRequestIntoManualAndClearUrl = useCallback(
    (req: RequestRow) => {
      const ref = String(req.reference || '').trim()
      setManualRequestId(ref || req.id)
      setLinkedRequest(null)
      const p = new URLSearchParams(entreguesSearchParams?.toString() || '')
      p.delete('requestId')
      p.delete('deliveryId')
      if (!parseRobaTab(p.get('tab'))) p.set('tab', 'entregues')
      router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
    },
    [entreguesSearchParams, router]
  )

  useEffect(() => {
    if (!isRobaWorkerSelf || !robaLinkedPersonnelId) return
    setWorkerId(robaLinkedPersonnelId)
    setDeliveryWithoutRequest(false)
  }, [isRobaWorkerSelf, robaLinkedPersonnelId])

  const load = useCallback(async () => {
    try {
      if (isRobaWorkerSelf) {
        const [d, w, p, reqs] = await Promise.all([
          api<DeliveryRow[]>('/api/roba-personal/deliveries'),
          api<WorkerRow[]>('/api/roba-personal/workers'),
          api<ProductRow[]>('/api/roba-personal/products'),
          api<RequestRow[]>('/api/roba-personal/requests'),
        ])
        setRows(d)
        setWorkers(w.filter((x) => x.isActive !== false))
        setProducts(p.filter((x) => x.isActive !== false))
        setPendingReceiptRequests(reqs.filter((r) => r.status === 'picked_up'))
      } else {
        const [d, w, p] = await Promise.all([
          api<DeliveryRow[]>('/api/roba-personal/deliveries'),
          api<WorkerRow[]>('/api/roba-personal/workers'),
          api<ProductRow[]>('/api/roba-personal/products'),
        ])
        setRows(d)
        setWorkers(w.filter((x) => x.isActive !== false))
        setProducts(p.filter((x) => x.isActive !== false))
        setPendingReceiptRequests([])
      }
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

  useEffect(() => {
    const id = robaRequestDocIdFromInput(prefillRequestId)
    if (!id) {
      setLinkedRequest(null)
      return
    }
    void (async () => {
      try {
        const list = await api<RequestRow[]>('/api/roba-personal/requests')
        setLinkedRequest(list.find((r) => r.id === id) ?? null)
      } catch {
        setLinkedRequest(null)
      }
    })()
  }, [prefillRequestId])

  useEffect(() => {
    const rid = robaRequestDocIdFromInput(prefillRequestId)
    if (!rid) return
    const t = window.setTimeout(() => {
      document.getElementById(`roba-request-pickup-${rid}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 200)
    return () => window.clearTimeout(t)
  }, [prefillRequestId, pendingReceiptRequests.length])

  const deliveriesPendingWorkerAck = useMemo(() => {
    if (!isRobaWorkerSelf || !robaLinkedPersonnelId) return []
    return rows.filter(
      (r) =>
        r.workerId === robaLinkedPersonnelId &&
        r.workerReceiptAckExpected === true &&
        !r.workerReceiptAckAt &&
        !r.workerReceiptCorrectionOpen
    )
  }, [rows, isRobaWorkerSelf, robaLinkedPersonnelId])

  const deliveriesAwaitingWorkerCorrection = useMemo(() => {
    if (!isRobaWorkerSelf || !robaLinkedPersonnelId) return []
    return rows.filter(
      (r) =>
        r.workerId === robaLinkedPersonnelId &&
        r.workerReceiptAckExpected === true &&
        !r.workerReceiptAckAt &&
        r.workerReceiptCorrectionOpen === true
    )
  }, [rows, isRobaWorkerSelf, robaLinkedPersonnelId])

  const openDeliveryCorrection = (r: DeliveryRow) => {
    setCorrectTarget(r)
    const from = (r.lines || []).map((l) => ({
      productId: l.productId,
      qty: String(l.quantity),
    }))
    setCorrectLinesEditor(from.length ? from : [{ productId: '', qty: '1' }])
    setCorrectNote('')
  }

  const addCorrectLine = () =>
    setCorrectLinesEditor((L) => [...L, { productId: '', qty: '1' }])

  const removeCorrectLine = (i: number) => {
    setCorrectLinesEditor((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const submitDeliveryCorrection = async () => {
    if (!correctTarget) return
    const parsedLines = correctLinesEditor
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, quantity: Number(l.qty) }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (parsedLines.length === 0) {
      toast({ title: 'Cal almenys una linia valida', variant: 'destructive' })
      return
    }
    setCorrectBusy(true)
    try {
      await api(`/api/roba-personal/deliveries/${correctTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'correctDeliveryLines',
          lines: parsedLines,
          note: correctNote.trim() || undefined,
        }),
      })
      toast({ title: 'Entrega corregida', description: "S'ha notificat el treballador." })
      setCorrectTarget(null)
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setCorrectBusy(false)
    }
  }

  useEffect(() => {
    const id = prefillDeliveryId.trim()
    if (!id) return
    const t = window.setTimeout(() => {
      document.getElementById(`roba-delivery-ack-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      document.getElementById(`roba-delivery-row-${id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 150)
    return () => window.clearTimeout(t)
  }, [
    prefillDeliveryId,
    deliveriesPendingWorkerAck.length,
    deliveriesAwaitingWorkerCorrection.length,
    rows.length,
  ])

  const rrhhPrepareTotalUnits = useMemo(
    () =>
      rrhhPrepareLines.reduce((acc, l) => {
        const q = Number(String(l.qty ?? '').replace(',', '.').trim())
        return acc + (Number.isFinite(q) && q > 0 ? q : 0)
      }, 0),
    [rrhhPrepareLines]
  )

  const openRrhhPrepareFromLinked = () => {
    if (!linkedRequest || linkedRequest.status !== 'submitted' || !isRobaAdminOrRrhh) return
    setRrhhPrepareLines(
      (linkedRequest.lines || []).map((l) => ({ productId: l.productId, qty: String(l.quantity) }))
    )
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setRrhhPreparePickupDate(tomorrow.toISOString().slice(0, 10))
    setRrhhPrepareMessage('')
    setRrhhPrepareWithoutStock(false)
    setRrhhPrepareOpen(true)
  }

  const confirmRrhhPrepareAndFillForm = async () => {
    if (!linkedRequest?.id) return
    if (!rrhhPreparePickupDate.trim()) {
      toast({ title: 'Trieu el dia de recollida', variant: 'destructive' })
      return
    }
    const payloadLines = rrhhPrepareLines
      .map((l) => ({
        productId: String(l.productId || '').trim(),
        quantity: Number(String(l.qty ?? '').replace(',', '.').trim()),
      }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (payloadLines.length === 0) {
      toast({
        title: 'Falten linies',
        description: 'Cal almenys un producte amb quantitat valida.',
        variant: 'destructive',
      })
      return
    }
    setRrhhPrepareBusy(true)
    try {
      const prepared = await api<RequestRow>(`/api/roba-personal/requests/${linkedRequest.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'prepared',
          pickupDate: rrhhPreparePickupDate.trim(),
          pickupAvailabilityMessage: rrhhPrepareMessage.trim() || undefined,
          prepareWithoutStockReservation: rrhhPrepareWithoutStock || undefined,
          lines: payloadLines,
        }),
      })
      let req: RequestRow = { ...linkedRequest, ...prepared }
      const picked = await api<RequestRow>(`/api/roba-personal/requests/${linkedRequest.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'picked_up' }),
      })
      req = { ...req, ...picked }
      if (req.requestedByWorkerId) {
        setWorkerId(req.requestedByWorkerId)
      }
      setLines(
        (req.lines || []).map((l) => ({
          productId: l.productId,
          qty: String(l.quantity),
        }))
      )
      toast({
        title: 'Preparada, recollida i formulari omplert',
        description: req.reference ?? `S-${req.id}`,
      })
      setRrhhPrepareOpen(false)
      absorbLinkedRequestIntoManualAndClearUrl(req)
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setRrhhPrepareBusy(false)
    }
  }

  const applyLinkedRequestToForm = async () => {
    if (!linkedRequest?.lines?.length) return
    if (!['prepared', 'picked_up'].includes(linkedRequest.status)) {
      toast({
        title: 'Sollicitud no valida',
        description:
          linkedRequest.status === 'submitted'
            ? 'La sollicitud encara no esta preparada per roba.'
            : "Aquesta sollicitud no admet registrar una entrega des d'aqui.",
        variant: 'destructive',
      })
      return
    }
    setApplyLinkedBusy(true)
    try {
      let req = linkedRequest
      if (req.status === 'prepared') {
        const updated = await api<RequestRow>(`/api/roba-personal/requests/${req.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'picked_up' }),
        })
        req = { ...req, ...updated }
      }
      if (req.requestedByWorkerId) {
        setWorkerId(req.requestedByWorkerId)
      }
      setLines(
        (req.lines || []).map((l) => ({
          productId: l.productId,
          qty: String(l.quantity),
        }))
      )
      toast({
        title: 'Linies carregades',
        description: req.reference ?? `S-${req.id}`,
      })
      absorbLinkedRequestIntoManualAndClearUrl(req)
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setApplyLinkedBusy(false)
    }
  }

  useEffect(() => {
    if (!linkedRequest?.requestedByWorkerId) return
    setWorkerId(linkedRequest.requestedByWorkerId)
  }, [linkedRequest?.id, linkedRequest?.requestedByWorkerId])

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1' }])

  const removeLine = (i: number) => {
    setLines((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const effectiveRequestId = useMemo(() => {
    const fromLink = linkedRequest?.id?.trim()
    if (fromLink) return fromLink
    return robaRequestDocIdFromInput(manualRequestId)
  }, [linkedRequest?.id, manualRequestId])

  const registrar = async () => {
    const parsedLines = lines
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, quantity: Number(l.qty) }))
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)

    if (!workerId) {
      toast({ title: 'Trieu un treballador', variant: 'destructive' })
      return
    }
    if (parsedLines.length === 0) {
      toast({ title: 'Cal almenys una linia valida', variant: 'destructive' })
      return
    }
    if (!deliveryWithoutRequest && !effectiveRequestId) {
      toast({
        title: 'Cal una sollicitud o marcar "sense sollicitud"',
        variant: 'destructive',
      })
      return
    }

    const payload: Record<string, unknown> = {
      workerId,
      lines: parsedLines,
    }
    if (deliveryWithoutRequest) {
      payload.deliveryWithoutRequest = true
    } else {
      payload.requestId = effectiveRequestId
    }
    if (signatureDataUrl) {
      payload.acknowledgmentSignatureDataUrl = signatureDataUrl
    }

    setBusyEntrega(true)
    try {
      await api('/api/roba-personal/deliveries', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      toast({ title: 'Entrega registrada' })
      setLinkedRequest(null)
      setManualRequestId('')
      setLines([{ productId: '', qty: '1' }])
      setSignatureDataUrl(null)
      setSignaturePadKey((k) => k + 1)
      const p = new URLSearchParams(entreguesSearchParams?.toString() || '')
      p.delete('requestId')
      p.delete('deliveryId')
      if (!parseRobaTab(p.get('tab'))) p.set('tab', 'entregues')
      router.replace(`/menu/roba-personal?${p.toString()}`, { scroll: false })
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusyEntrega(false)
    }
  }

  const vincularEntrega = async (deliveryId: string) => {
    const rid = (linkReqDraft[deliveryId] || '').trim()
    if (!rid) {
      toast({ title: "Enganxeu l'ID de la sollicitud", variant: 'destructive' })
      return
    }
    try {
      await api(`/api/roba-personal/deliveries/${deliveryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ requestId: rid }),
      })
      toast({ title: "Sollicitud vinculada a l'entrega" })
      setLinkReqDraft((d) => ({ ...d, [deliveryId]: '' }))
      void load()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  const deleteEntrega = async (delivery: DeliveryRow) => {
    if (!isRobaAdmin) return
    const ref = String(delivery.reference || '').trim() || `E-${delivery.id}`
    const confirmed = window.confirm(
      `Voleu eliminar definitivament aquesta entrega?\n\n${ref}\n\nEs restaurara l'estoc i, si hi ha sollicitud vinculada, tornara a l'estat anterior. Aquesta accio no es pot desfer.`
    )
    if (!confirmed) return

    setDeleteBusyId(delivery.id)
    try {
      await api(`/api/roba-personal/deliveries/${delivery.id}`, { method: 'DELETE' })
      toast({ title: 'Entrega eliminada' })
      if (selectedDeliveryId === delivery.id) {
        resetNewDeliveryForm()
      }
      void load()
    } catch (e: unknown) {
      toast({
        title: 'No s ha pogut eliminar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setDeleteBusyId(null)
    }
  }

  const prodLabel = useCallback((id: string) => {
    const p = productById(products, id)
    if (!p) return id
    const t = (p.size ?? '').trim()
    return t ? `${p.code} - ${p.name} - talla ${t}` : `${p.code} - ${p.name}`
  }, [products])
  const workerLabel = useCallback((id: string) => {
    const w = workers.find((x) => x.id === id)
    return w ? `${w.name} (${w.code})` : id
  }, [workers])

  const workerNameOnly = useCallback((id: string) => {
    const w = workers.find((x) => x.id === id)
    const n = w?.name?.trim()
    return n || '-'
  }, [workers])

  const normalizeEntregaFilter = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()

  const entFilteredRows = useMemo(() => {
    return rows.filter((r) => {
      const day = robaRequestCalendarDay(r.deliveredAt)
      if (day) {
        if (day < entListRangeStart || day > entListRangeEnd) return false
      }
      if (entListFilterDept) {
        const wDept = workers.find((w) => w.id === r.workerId)?.department || ''
        const rDept = String(r.requestRequestingDepartment || '').trim()
        const matchDept =
          departmentsInSameRobaScope(wDept, entListFilterDept) ||
          (rDept ? departmentsInSameRobaScope(rDept, entListFilterDept) : false)
        if (!matchDept) return false
      }
      if (entListFilterReception) {
        if (deliveryReceptionFilterKey(r) !== entListFilterReception) return false
      }
      const q = normalizeEntregaFilter(entListSearch)
      if (q) {
        const hay = [
          r.reference,
          r.id,
          String(r.requestId || ''),
          String(r.requestCreatedByUserName || ''),
          String(r.requestCreatedByUserEmail || ''),
          String(r.requestPreparedByName || ''),
          String(r.requestRequestingDepartment || ''),
          workerNameOnly(r.workerId),
          workerLabel(r.workerId),
          ...(r.lines || []).map((l) => prodLabel(l.productId)),
          ...(r.requestedLines || []).map((l) => prodLabel(l.productId)),
        ]
          .filter(Boolean)
          .join(' ')
        if (!normalizeEntregaFilter(hay).includes(q)) return false
      }
      return true
    })
  }, [
    rows,
    entListRangeStart,
    entListRangeEnd,
    entListFilterDept,
    entListFilterReception,
    entListSearch,
    workers,
    workerLabel,
    workerNameOnly,
    prodLabel,
  ])

  const entGroupedRows = useMemo(() => {
    const map = new Map<string, DeliveryRow[]>()
    for (const r of entFilteredRows) {
      const dk = robaRequestCalendarDay(r.deliveredAt) ?? 'sense-data'
      if (!map.has(dk)) map.set(dk, [])
      map.get(dk)!.push(r)
    }
    const entries = [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
    for (const [, list] of entries) {
      list.sort((x, y) =>
        String(y.deliveredAt || '').localeCompare(String(x.deliveredAt || ''))
      )
    }
    return entries
  }, [entFilteredRows])

  useEffect(() => {
    if (entFilteredRows.length === 0) {
      if (selectedDeliveryId) setSelectedDeliveryId('')
      return
    }
    const preferredId = prefillDeliveryId.trim()
    if (preferredId && entFilteredRows.some((r) => r.id === preferredId)) {
      if (selectedDeliveryId !== preferredId) setSelectedDeliveryId(preferredId)
      return
    }
    if (selectedDeliveryId && entFilteredRows.some((r) => r.id === selectedDeliveryId)) return
    setSelectedDeliveryId(entFilteredRows[0]?.id ?? '')
  }, [entFilteredRows, prefillDeliveryId, selectedDeliveryId])

  const selectedDelivery = useMemo(
    () => rows.find((r) => r.id === selectedDeliveryId) ?? null,
    [rows, selectedDeliveryId]
  )

  const resetNewDeliveryForm = useCallback(() => {
    setSelectedDeliveryId('')
    setLinkedRequest(null)
    setManualRequestId('')
    setDeliveryWithoutRequest(false)
    setLines([{ productId: '', qty: '1' }])
    setSignatureDataUrl(null)
    setSignaturePadKey((k) => k + 1)
    if (isRobaWorkerSelf && robaLinkedPersonnelId) {
      setWorkerId(robaLinkedPersonnelId)
      return
    }
    setWorkerId('')
  }, [isRobaWorkerSelf, robaLinkedPersonnelId])

  const fillFormFromDelivery = useCallback((delivery: DeliveryRow) => {
    if (selectedDeliveryId === delivery.id) {
      resetNewDeliveryForm()
      return
    }
    const reqId = String(delivery.requestId || '').trim()
    setSelectedDeliveryId(delivery.id)
    setLinkedRequest(null)
    setWorkerId(delivery.workerId)
    setLines(
      (delivery.lines || []).length > 0
        ? delivery.lines.map((line) => ({
            productId: line.productId,
            qty: String(line.quantity),
          }))
        : [{ productId: '', qty: '1' }]
    )
    setDeliveryWithoutRequest(Boolean(delivery.deliveryWithoutRequest) && !reqId)
    setManualRequestId(reqId)
    setSignatureDataUrl(
      delivery.workerReceiptAckSignatureDataUrl || delivery.acknowledgmentSignatureDataUrl || null
    )
    setSignaturePadKey((k) => k + 1)
  }, [resetNewDeliveryForm, selectedDeliveryId])

  const buildEntreguesExportRows = useCallback(
    () =>
      (selectedDelivery ? [selectedDelivery] : entFilteredRows).map((r) => ({
        Data: r.deliveredAt ? new Date(r.deliveredAt).toLocaleString('ca-ES') : '',
        Referencia: r.reference ?? `E-${r.id}`,
        SenseSol: r.deliveryWithoutRequest && !String(r.requestId || '').trim() ? 'Si' : 'No',
        SollicitudId: String(r.requestId || '').trim() || '-',
        Sollicitant: String(r.requestCreatedByUserName || '').trim() || '-',
        Email: String(r.requestCreatedByUserEmail || '').trim() || '-',
        Preparador: String(r.requestPreparedByName || '').trim() || '-',
        Departament:
          String(r.requestRequestingDepartment || '').trim() ||
          workers.find((w) => w.id === r.workerId)?.department ||
          '-',
        Treballador: workerNameOnly(r.workerId),
        TotalUnitatsSollicitades: entregaRequestedTotalUnits(r),
        TotalUnitatsLliurades: entregaDeliveredTotalUnits(r),
        ProducteLliurat: (r.lines || [])
          .map((l) => `${prodLabel(l.productId)} x ${l.quantity}`)
          .join('; '),
        Sollicitat:
          (r.requestedLines || []).length > 0
            ? (r.requestedLines || [])
                .map((l) => `${prodLabel(l.productId)} x ${l.quantity}`)
                .join('; ')
            : '-',
        Lliurat: (r.lines || [])
          .map((l) => `${prodLabel(l.productId)} x ${l.quantity}`)
          .join('; '),
      })),
    [selectedDelivery, entFilteredRows, workerNameOnly, prodLabel, workers]
  )

  const handleEntreguesExportXlsx = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-entregues')
      await exportRowsToXlsx([{ name: 'Entregues', rows: buildEntreguesExportRows() }], base)
      toast({ title: 'Exportacio XLSX completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant XLSX',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [buildEntreguesExportRows])

  const handleEntreguesExportPdf = useCallback(async () => {
    try {
      const base = robaExportFilename('roba-entregues')
      const exportRows = selectedDelivery ? [selectedDelivery] : entFilteredRows
      await exportDeliveryReceiptsPdf(
        exportRows.map((r) => ({
          reference: r.reference ?? `E-${r.id}`,
          deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toLocaleString('ca-ES') : '',
          workerName: workerNameOnly(r.workerId),
          department:
            String(r.requestRequestingDepartment || '').trim() ||
            workers.find((w) => w.id === r.workerId)?.department ||
            '-',
          requestReference: String(r.requestId || '').trim() || undefined,
          preparedByName: String(r.requestPreparedByName || '').trim() || undefined,
          createdByName: String(r.requestCreatedByUserName || '').trim() || undefined,
          lines: (r.lines || []).map((l) => ({
            label: prodLabel(l.productId),
            quantity: l.quantity,
          })),
          signatureDataUrl:
            r.workerReceiptAckSignatureDataUrl || r.acknowledgmentSignatureDataUrl || null,
        })),
        base
      )
      toast({ title: 'Exportacio PDF completada.' })
    } catch (e: unknown) {
      toast({
        title: 'Error exportant PDF',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }, [selectedDelivery, entFilteredRows, prodLabel, workerNameOnly, workers])

  const entreguesExportMenuItems = useMemo(
    () =>
      isRobaWorkerSelf
        ? []
        : [
            { label: 'Exportar PDF', onClick: handleEntreguesExportPdf },
            { label: 'Exportar XLSX', onClick: handleEntreguesExportXlsx },
          ],
    [isRobaWorkerSelf, handleEntreguesExportPdf, handleEntreguesExportXlsx]
  )
  useRegisterModuleExportMenu(entreguesExportMenuItems)

  return (
    <div className="space-y-6 w-full">
      {isRobaWorkerSelf ? (
        <>
          <section className="space-y-3 w-full">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-sm sm:text-base">Sollicitud recollida</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                {pendingReceiptRequests.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Signeu quan us hagin lliurat el material de la llista.
            </p>
            {pendingReceiptRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Cap pendent.</p>
            ) : (
              <div className="space-y-3">
                {pendingReceiptRequests.map((r) => (
                  <div key={r.id} id={`roba-request-pickup-${r.id}`}>
                    <WorkerReceiptConfirmationCard
                      request={r}
                      prodLabel={prodLabel}
                      onConfirmed={() => void load()}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {deliveriesAwaitingWorkerCorrection.length > 0 ? (
            <section className="space-y-3 w-full pt-2 border-t border-border">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-sm sm:text-base">Incidencia en revisio</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {deliveriesAwaitingWorkerCorrection.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Roba esta corregint el registre despres de la vostra incidencia.
              </p>
              <div className="space-y-3">
                {deliveriesAwaitingWorkerCorrection.map((d) => (
                  <WorkerDeliveryAwaitingCorrectionCard
                    key={d.id}
                    delivery={d}
                    prodLabel={prodLabel}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 w-full pt-2 border-t border-border">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-sm sm:text-base">Entrega del responsable</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                {deliveriesPendingWorkerAck.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Rebeu avis quan roba registri l'entrega; signeu per tancar.
            </p>
            {deliveriesPendingWorkerAck.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Cap pendent.</p>
            ) : (
              <div className="space-y-3">
                {deliveriesPendingWorkerAck.map((d) => (
                  <WorkerLeadDeliveryAckCard
                    key={d.id}
                    delivery={d}
                    prodLabel={prodLabel}
                    onConfirmed={() => void load()}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
          <h2 className="font-semibold text-base">Nova entrega</h2>
          {linkedRequest ? (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-sm dark:bg-amber-950/25 dark:border-amber-900/50">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                Sollicitud {linkedRequest.reference ?? `S-${linkedRequest.id}`}
              </p>
              <p className="text-xs text-amber-900/85 dark:text-amber-200/90">
                {linkedRequest.requestingDepartment}
              </p>
              <p className="text-xs font-medium text-amber-950 dark:text-amber-100 mt-1">
                Treballador:{' '}
                {linkedRequest.requestedByWorkerName?.trim() ||
                  (linkedRequest.requestedByWorkerId
                    ? workerLabel(linkedRequest.requestedByWorkerId)
                    : '-')}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-amber-950/90 dark:text-amber-100/90 list-disc pl-4">
                {(linkedRequest.lines || []).map((l, idx) => (
                  <li key={`${l.productId}-${idx}`}>
                    {prodLabel(l.productId)} x {l.quantity}
                  </li>
                ))}
              </ul>
              {linkedRequest.status === 'prepared' ? (
                <p className="mt-2 text-xs text-amber-900/85 dark:text-amber-200/90">
                  En premer el boto es marcara la sollicitud com a recollida i s'omplira el formulari.
                </p>
              ) : null}
              {linkedRequest.status === 'submitted' && isRobaAdminOrRrhh ? (
                <p className="mt-2 text-xs text-amber-900/85 dark:text-amber-200/90">
                  La sollicitud encara esta enviada. Com a RRHH podeu preparar-la aqui i s'omplira el formulari
                  d'entrega al confirmar.
                </p>
              ) : null}
              {linkedRequest.status === 'submitted' && isRobaAdminOrRrhh ? (
                <Button type="button" size="sm" className="mt-2" onClick={openRrhhPrepareFromLinked}>
                  Preparar i omplir formulari (RRHH)
                </Button>
              ) : ['prepared', 'picked_up'].includes(linkedRequest.status) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  disabled={applyLinkedBusy}
                  onClick={() => void applyLinkedRequestToForm()}
                >
                  {applyLinkedBusy ? 'Actualitzant...' : 'Omplir formulari amb aquestes linies'}
                </Button>
              ) : null}
            </div>
          ) : null}
          {linkedRequest &&
          !deliveryWithoutRequest &&
          linkedRequest.status === 'submitted' &&
          !isRobaAdminOrRrhh ? (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-sm dark:bg-amber-950/25 dark:border-amber-900/50 text-amber-950 dark:text-amber-100">
              <p className="font-medium">La sollicitud encara no esta preparada.</p>
              <p className="text-xs mt-1 opacity-90">
                Nomes Recursos Humans (o administracio) pot preparar-la des d'aqui o des de la pestanya Sollicituds.
              </p>
            </div>
          ) : null}
          {linkedRequest &&
          !deliveryWithoutRequest &&
          !['prepared', 'picked_up', 'submitted'].includes(linkedRequest.status) ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <p className="font-medium">Aquesta sollicitud no es pot vincular a una entrega nova.</p>
              <p className="text-xs mt-1 opacity-90">
                Cal una sollicitud preparada o recollida. Si ja consta com a lliurada o confirmada, reviseu l'historial
                d'entregues.
              </p>
            </div>
          ) : null}
          {!linkedRequest && !deliveryWithoutRequest ? (
            <div
              className={cn(
                'space-y-1 max-w-xl',
                !isRobaWorkerSelf && 'xl:grid xl:max-w-none xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-3 xl:items-end xl:space-y-0'
              )}
            >
              <div className="space-y-1 min-w-0">
              <Label htmlFor="ent-req-id" className="text-xs text-muted-foreground">
                ID sollicitud (si no veniu des d'un avis)
              </Label>
              <Input
                id="ent-req-id"
                className="h-9 font-mono text-sm"
                placeholder="ID Firestore o referencia S-... (es normalitza automaticament)"
                value={manualRequestId}
                onChange={(e) => setManualRequestId(e.target.value)}
              />
              </div>
              {!isRobaWorkerSelf ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 xl:min-h-9">
                  <Switch
                    id="ent-sense-sol"
                    checked={deliveryWithoutRequest}
                    onCheckedChange={(v) => setDeliveryWithoutRequest(Boolean(v))}
                  />
                  <Label htmlFor="ent-sense-sol" className="text-sm font-normal cursor-pointer">
                    Entrega sense sollicitud previa (es pot vincular despres)
                  </Label>
                </div>
              ) : null}
            </div>
          ) : null}
          {!isRobaWorkerSelf && (linkedRequest || deliveryWithoutRequest) ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="ent-sense-sol"
                  checked={deliveryWithoutRequest}
                  onCheckedChange={(v) => setDeliveryWithoutRequest(Boolean(v))}
                />
                <Label htmlFor="ent-sense-sol" className="text-sm font-normal cursor-pointer">
                  Entrega sense sollicitud previa (es pot vincular despres)
                </Label>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.85fr)] xl:items-start">
            <div className="space-y-3 min-w-0">
            <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 min-w-0">
            {lines.map((ln, i) => (
              <div
                key={i}
                className={cn(
                  'grid gap-2 grid-cols-1 md:grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)_minmax(4.25rem,5.5rem)_auto] md:items-end md:gap-3',
                  i > 0 && 'pt-3 mt-2 border-t border-indigo-200/40 dark:border-indigo-900/40'
                )}
              >
                {i === 0 ? (
                  <div className="space-y-1 min-w-0">
                    <Label htmlFor="ent-worker" className="text-xs text-muted-foreground">
                      Treballador
                    </Label>
                    <select
                      id="ent-worker"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm min-w-0"
                      value={workerId}
                      onChange={(e) => setWorkerId(e.target.value)}
                      disabled={isRobaWorkerSelf}
                    >
                      <option value="">- Trieu -</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name.trim() || '-'}
                        </option>
                      ))}
                    </select>
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
                      placeholder="Cercar i triar..."
                      showStockHint
                      variant="list"
                      className="h-9 text-sm"
                    />
                  </div>
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
                    title={lines.length <= 1 ? 'Minim una linia' : 'Eliminar linia'}
                    aria-label="Eliminar linia"
                    onClick={() => removeLine(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/15 p-3 sm:p-4">
              <RobaSignaturePad
                key={signaturePadKey}
                initialDataUrl={signatureDataUrl}
                onChange={setSignatureDataUrl}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + Linia
            </Button>
            <Button
              type="button"
              disabled={
                !workerId ||
                busyEntrega ||
                (!deliveryWithoutRequest && !effectiveRequestId) ||
                (!deliveryWithoutRequest &&
                  linkedRequest != null &&
                  linkedRequest.status !== 'picked_up')
              }
              onClick={() => void registrar()}
            >
              {busyEntrega ? 'Registrant...' : 'Registrar entrega'}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">
          {isRobaWorkerSelf ? 'Entregues registrades' : 'Entregues'}
        </h2>
        {isRobaWorkerSelf ? (
          <p className="text-xs text-muted-foreground">Historial d'entregues.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
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
            onChange={handleEntreguesSmartDateChange}
            resetSignal={entListFiltersResetSignal}
            initialStart={entListRangeStart}
            initialEnd={entListRangeEnd}
          />
          <div className="relative flex min-w-[12rem] flex-1 basis-[14rem] max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="h-10 rounded-xl border-gray-300 bg-white pl-9 dark:bg-background"
              placeholder="Cercar nom, correu, departament, treballador, producte..."
              value={entListSearch}
              onChange={(e) => setEntListSearch(e.target.value)}
              aria-label="Cercar entregues"
            />
          </div>
          <FilterButton
            onClick={() => {
              setContent(entFiltersSlidePanel)
            }}
          />
        </div>

        {entFilteredRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-10 text-sm">
            Cap entrega en aquest periode o amb aquests filtres.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border shadow-sm bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-950/40 dark:to-emerald-900/30 text-emerald-900 dark:text-emerald-100 text-sm">
                  <TableHead
                    className={cn(
                      taulaThText,
                      'py-2 sticky left-0 z-30 bg-emerald-50 dark:bg-emerald-950/50 max-w-[9rem]'
                    )}
                  >
                    Sollicitant
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2 min-w-[7rem] max-w-[9rem]')}>
                    Preparador
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2')}>Dept</TableHead>
                  <TableHead className={cn(taulaThText, 'py-2 min-w-[8rem]')}>Treballador</TableHead>
                  <TableHead className={cn(taulaThText, 'min-w-[10rem] py-2')}>Producte</TableHead>
                  <TableHead
                    className={cn(taulaThText, 'text-right whitespace-nowrap py-2 w-[1%]')}
                  >
                    Qt. sollicitada
                  </TableHead>
                  <TableHead
                    className={cn(taulaThText, 'text-right whitespace-nowrap py-2 w-[1%]')}
                  >
                    Qt. lliurada
                  </TableHead>
                  <TableHead className={cn(taulaThText, 'py-2 min-w-[7rem]')}>Estat</TableHead>
                  {!isRobaWorkerSelf ? (
                    <TableHead className={cn(taulaThText, 'w-[200px] py-2')}>Accions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entGroupedRows.map(([dayKey, dayRows]) => (
                  <Fragment key={dayKey}>
                    <TableRow className="bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-semibold">
                      <TableCell
                        colSpan={
                          isRobaWorkerSelf
                            ? ENTREGUES_TABLE_COLS_WORKER
                            : ENTREGUES_TABLE_COLS_LEAD
                        }
                        className="py-2 text-sm"
                      >
                        {formatRobaDayGroupLabel(dayKey)}
                      </TableCell>
                    </TableRow>
                    {dayRows.map((r) => {
                      const reqId = String(r.requestId || '').trim()
                      const orphan = Boolean(r.deliveryWithoutRequest) && !reqId
                      const solName = String(r.requestCreatedByUserName || '').trim()
                      const preparer = String(r.requestPreparedByName || '').trim()
                      const reqDept = String(r.requestRequestingDepartment || '').trim()
                      const wDept = workers.find((w) => w.id === r.workerId)?.department || ''
                      const deptCell = orphan
                        ? wDept || '-'
                        : reqDept || wDept || '-'
                      const reqUnits = entregaRequestedTotalUnits(r)
                      const delUnits = entregaDeliveredTotalUnits(r)
                      const rowTitle = [
                        r.reference ? `Entrega ${r.reference}` : `Entrega ${r.id}`,
                        reqId ? `Sollicitud ${reqId}` : null,
                      ]
                        .filter(Boolean)
                        .join(' - ')
                      return (
                        <TableRow
                          key={r.id}
                          id={`roba-delivery-row-${r.id}`}
                          title={rowTitle}
                          onClick={() => fillFormFromDelivery(r)}
                          className={cn(
                            'cursor-pointer text-xs sm:text-sm transition-colors hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25',
                            selectedDeliveryId === r.id && 'bg-emerald-50 dark:bg-emerald-950/20'
                          )}
                        >
                          <TableCell
                            className={cn(
                              'text-sm align-top max-w-[9rem] sticky left-0 z-20 bg-card pt-2.5'
                            )}
                          >
                            {orphan ? (
                              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-950 dark:text-amber-100 inline-block">
                                Sense sollicitud
                              </span>
                            ) : (
                              <span className="line-clamp-2 font-medium text-foreground">
                                {solName || '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm align-top max-w-[9rem] pt-2.5">
                            <span className="line-clamp-2">
                              {orphan || !reqId ? '-' : preparer || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm align-top pt-2.5">{deptCell}</TableCell>
                          <TableCell className="text-sm align-top max-w-[10rem] pt-2.5">
                            <span className="line-clamp-2">{workerNameOnly(r.workerId)}</span>
                          </TableCell>
                          <TableCell className="text-xs align-top max-w-[18rem] pt-2.5">
                            <RobaEntregaProducteColumn lines={r.lines} prodLabel={prodLabel} />
                          </TableCell>
                          <TableCell className="text-sm align-top text-right font-medium tabular-nums whitespace-nowrap pt-2.5">
                            {orphan || !reqId ? '-' : reqUnits}
                          </TableCell>
                          <TableCell className="text-sm align-top text-right font-medium tabular-nums whitespace-nowrap pt-2.5">
                            {delUnits}
                          </TableCell>
                          {isRobaWorkerSelf ? (
                            <TableCell className="text-sm align-top min-w-[7rem] pt-2.5">
                              {r.workerReceiptAckExpected ? (
                                r.workerReceiptAckAt ? (
                                  <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-950 dark:text-emerald-100 font-medium">
                                    Confirmada
                                  </span>
                                ) : r.workerReceiptCorrectionOpen ? (
                                  <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-950 dark:text-amber-100 font-medium">
                                    Revisio roba
                                  </span>
                                ) : (
                                  <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-950 dark:text-amber-100 font-medium">
                                    Pendent
                                  </span>
                                )
                              ) : (
                                <span className="font-medium text-muted-foreground">Registrada</span>
                              )}
                            </TableCell>
                          ) : (
                            <TableCell className="text-sm align-top min-w-[7rem] pt-2.5">
                              <span className="font-medium">{entregaEstatLabelForLead(r)}</span>
                              {r.workerReceiptCorrectionOpen ? (
                                <span className="block text-[10px] text-amber-800 dark:text-amber-200 mt-0.5">
                                  Cal correccio
                                </span>
                              ) : null}
                            </TableCell>
                          )}
                          {!isRobaWorkerSelf ? (
                            <TableCell
                              className="text-xs align-top pt-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex flex-wrap gap-1">
                                {r.workerReceiptCorrectionOpen ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => openDeliveryCorrection(r)}
                                  >
                                    Corregir
                                  </Button>
                                ) : null}
                                {orphan ? (
                                  <>
                                    <Input
                                      className="h-8 font-mono text-[11px] max-w-[9rem]"
                                      placeholder="ID sollicitud"
                                      value={linkReqDraft[r.id] ?? ''}
                                      onChange={(e) =>
                                        setLinkReqDraft((d) => ({ ...d, [r.id]: e.target.value }))
                                      }
                                    />
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={() => void vincularEntrega(r.id)}
                                    >
                                      Vincular
                                    </Button>
                                  </>
                                ) : null}
                                {isRobaAdmin ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={deleteBusyId === r.id}
                                    onClick={() => void deleteEntrega(r)}
                                  >
                                    {deleteBusyId === r.id ? 'Eliminant...' : 'Eliminar'}
                                  </Button>
                                ) : null}
                                {!r.workerReceiptCorrectionOpen && !orphan && !isRobaAdmin ? (
                                  <span className="text-muted-foreground self-center">-</span>
                                ) : null}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      )
                    })}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog
        open={rrhhPrepareOpen}
        onOpenChange={(o) => {
          setRrhhPrepareOpen(o)
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 space-y-1 shrink-0">
            <DialogTitle>Preparar i registrar entrega (des d'Entregues)</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal leading-relaxed">
              Es marcara la sol·licitud com a preparada (amb data de recollida i linies), despres com a recollida, i es
              carregaran les linies al formulari d'avall. Els avisos i el calendari es comporten igual que a Sollicituds.
            </p>
          </DialogHeader>
          <div className="px-6 pb-4 space-y-4 overflow-y-auto min-h-0 flex-1">
            {linkedRequest ? (
              <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-between items-baseline">
                  <span>
                    <span className="text-muted-foreground text-xs">Dept</span>{' '}
                    <span className="font-medium">{linkedRequest.requestingDepartment}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {linkedRequest.reference ?? linkedRequest.id}
                  </span>
                </div>
                <p>
                  <span className="text-muted-foreground text-xs">Treballador</span>{' '}
                  <span className="font-medium">
                    {linkedRequest.requestedByWorkerName?.trim() ||
                      (linkedRequest.requestedByWorkerId
                        ? workers.find((w) => w.id === linkedRequest.requestedByWorkerId)?.name ?? '-'
                        : '-')}
                  </span>
                </p>
                <p className="text-sm pt-0.5 border-t border-border/60 mt-1">
                  <span className="text-muted-foreground text-xs">Total unitats a preparar</span>{' '}
                  <span className="font-semibold tabular-nums text-base">{rrhhPrepareTotalUnits}</span>
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Linies</Label>
              <div className="space-y-2">
                {rrhhPrepareLines.map((ln, i) => (
                  <div
                    key={`ent-prep-${i}-${ln.productId}`}
                    className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-border/80 bg-background/50 p-2"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Producte</span>
                      <ProductSearchCombobox
                        products={products}
                        value={ln.productId}
                        onChange={(v) =>
                          setRrhhPrepareLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
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
                            const v = e.target.value
                            setRrhhPrepareLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10"
                        disabled={rrhhPrepareLines.length <= 1}
                        title={rrhhPrepareLines.length <= 1 ? 'Minim una linia' : 'Eliminar linia'}
                        aria-label="Eliminar linia"
                        onClick={() =>
                          setRrhhPrepareLines((L) =>
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
                onClick={() => setRrhhPrepareLines((L) => [...L, { productId: '', qty: '1' }])}
              >
                + Linia
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ent-prep-pickup-date">Dia de recollida</Label>
              <Input
                id="ent-prep-pickup-date"
                type="date"
                className="h-9"
                value={rrhhPreparePickupDate}
                onChange={(e) => setRrhhPreparePickupDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ent-prep-msg" className="text-xs text-muted-foreground">
                Missatge (opcional)
              </Label>
              <Textarea
                id="ent-prep-msg"
                className="min-h-[64px] text-sm"
                placeholder="Ex.: material disponible a partir de..."
                value={rrhhPrepareMessage}
                onChange={(e) => setRrhhPrepareMessage(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Switch
                id="ent-prep-no-stock"
                checked={rrhhPrepareWithoutStock}
                onCheckedChange={(v) => setRrhhPrepareWithoutStock(Boolean(v))}
              />
              <Label htmlFor="ent-prep-no-stock" className="text-sm font-normal cursor-pointer leading-snug">
                Sense reserva d'estoc (material pendent o sense estoc ara)
              </Label>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRrhhPrepareOpen(false)} disabled={rrhhPrepareBusy}>
              Tanca
            </Button>
            <Button type="button" disabled={rrhhPrepareBusy} onClick={() => void confirmRrhhPrepareAndFillForm()}>
              {rrhhPrepareBusy ? 'Processant...' : 'Confirmar i omplir formulari'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={correctTarget != null} onOpenChange={(o) => !o && setCorrectTarget(null)}>
        <DialogContent className="max-w-lg max-h-[min(90vh,720px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Corregir entrega</DialogTitle>
          </DialogHeader>
          {correctTarget ? (
            <p className="text-xs text-muted-foreground font-mono">
              {correctTarget.reference ?? `E-${correctTarget.id}`}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Ajusteu productes i quantitats. L'estoc es mou segons la diferencia respecte al registre
            anterior i el treballador haura de tornar a confirmar la recepcio.
          </p>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-3">
            {correctLinesEditor.map((ln, i) => (
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
                      setCorrectLinesEditor((L) =>
                        L.map((x, j) => (j === i ? { ...x, productId: v } : x))
                      )
                    }
                    placeholder="Cercar i triar..."
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
                      setCorrectLinesEditor((L) =>
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
                    disabled={correctLinesEditor.length <= 1}
                    aria-label="Eliminar linia"
                    onClick={() => removeCorrectLine(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addCorrectLine}>
              + Linia
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nota interna (auditoria)</Label>
            <Textarea
              value={correctNote}
              onChange={(e) => setCorrectNote(e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="resize-y min-h-[56px] text-sm"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCorrectTarget(null)}>
              Cancel·la
            </Button>
            <Button type="button" disabled={correctBusy} onClick={() => void submitDeliveryCorrection()}>
              {correctBusy ? 'Desant...' : 'Desar correccio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
