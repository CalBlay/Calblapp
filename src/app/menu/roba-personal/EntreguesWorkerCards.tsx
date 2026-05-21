'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSWRConfig } from 'swr'
import { toast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
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
import { AlertTriangle } from 'lucide-react'
import { formatDateOnly } from '@/lib/date-format'
import { robaPersonalApi as api } from './robaPersonalApi'
import { RobaSignaturePad } from './RobaSignaturePad'
import {
  robaDeliveryRequestedMatchesDelivered,
  robaLinesQuantitiesDiffer,
} from './robaDeliveryHelpers'
import type { DeliveryRow, RequestRow } from './robaPersonalTypes'

export function WorkerReceiptConfirmationCard({
  request,
  prodLabel,
  onConfirmed,
}: {
  request: RequestRow
  prodLabel: (id: string) => string
  onConfirmed: () => void
}) {
  const { mutate } = useSWRConfig()
  const [sig, setSig] = useState<string | null>(null)
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueNote, setIssueNote] = useState('')
  const [issueBusy, setIssueBusy] = useState(false)

  const requestLines = useMemo(() => request.lines || [], [request.lines])
  const [draftQty, setDraftQty] = useState<string[]>(() =>
    requestLines.map((l) => String(l.quantity))
  )

  useEffect(() => {
    setDraftQty(requestLines.map((l) => String(l.quantity)))
    setIssueNote('')
    setSig(null)
    setPadKey((k) => k + 1)
  }, [request.id, requestLines])

  const parsedDraftLines = useMemo(
    () =>
      requestLines
        .map((l, i) => {
          const q = Number(String(draftQty[i] ?? '').replace(',', '.').trim())
          return { productId: l.productId, quantity: q }
        })
        .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0),
    [draftQty, requestLines]
  )

  const qtyChanged = useMemo(() => {
    if (parsedDraftLines.length !== requestLines.length) return true
    return parsedDraftLines.some((line, idx) => line.quantity !== requestLines[idx]?.quantity)
  }, [parsedDraftLines, requestLines])

  const confirmar = async () => {
    if (!sig) {
      toast({
        title: 'Cal signar',
        description: 'Signeu per confirmar la recepcio.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      await api('/api/roba-personal/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          requestId: request.id,
          acknowledgmentSignatureDataUrl: sig,
        }),
      })
      toast({ title: 'Recepcio confirmada' })
      await refreshAfterAction()
      setSig(null)
      setPadKey((k) => k + 1)
      onConfirmed()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const enviarIncidencia = async () => {
    if (!qtyChanged && !issueNote.trim()) {
      toast({
        title: 'Afegiu el motiu',
        description: 'Indiqueu una incidencia o ajusteu alguna quantitat.',
        variant: 'destructive',
      })
      return
    }
    setIssueBusy(true)
    try {
      await api('/api/roba-personal/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reportWorkerReceiptDispute',
          requestId: request.id,
          note: issueNote.trim() || undefined,
          proposedLines: qtyChanged ? parsedDraftLines : undefined,
        }),
      })
      toast({
        title: 'Avis enviat a roba',
        description: 'El responsable revisara l entrega i us la tornara a passar per confirmar.',
      })
      await refreshAfterAction()
      setIssueOpen(false)
      setIssueNote('')
      onConfirmed()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setIssueBusy(false)
    }
  }

  const refreshAfterAction = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markResolvedRoba', requestId: request.id }),
    })
    await Promise.allSettled([
      mutate('/api/notifications?mode=list'),
      mutate('/api/roba-personal/requests'),
      mutate('/api/roba-personal/deliveries'),
    ])
  }

  return (
    <div className="w-full rounded-xl border border-indigo-200/70 bg-white p-4 shadow-sm dark:border-indigo-900/50 dark:bg-slate-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Entrega pendent</Badge>
            <span className="text-sm font-medium text-foreground">{request.requestingDepartment}</span>
            {request.pickupDate ? (
              <span className="text-xs text-muted-foreground">{formatDateOnly(request.pickupDate)}</span>
            ) : null}
          </div>
          {request.pickupAvailabilityMessage ? (
            <p className="text-xs text-muted-foreground">{request.pickupAvailabilityMessage}</p>
          ) : null}
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {request.reference ?? `S-${request.id}`}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-3">
        <ul className="space-y-2 text-sm">
          {requestLines.map((l, idx) => (
            <li key={`${l.productId}-${idx}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1">{prodLabel(l.productId)}</span>
              <span className="shrink-0 font-medium tabular-nums">x {l.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <RobaSignaturePad key={padKey} onChange={setSig} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setIssueOpen(true)}>
          <AlertTriangle className="mr-1.5 h-4 w-4 shrink-0" />
          Quantitat o article incorrecte
        </Button>
        <Button type="button" disabled={busy || !sig} onClick={() => void confirmar()}>
          {busy ? 'Registrant...' : 'Confirmar recepcio'}
        </Button>
      </div>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revisar entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Ajusteu quantitats si no coincideixen
              </p>
              <div className="space-y-2">
                {requestLines.map((l, idx) => (
                  <div key={`${l.productId}-issue-${idx}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm">{prodLabel(l.productId)}</span>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      className="h-8 w-[4.5rem] tabular-nums"
                      value={draftQty[idx] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setDraftQty((prev) => {
                          const base = requestLines.map((line, i) => prev[i] ?? String(line.quantity))
                          base[idx] = v
                          return base
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`roba-worker-issue-${request.id}`}>Comentari</Label>
              <Textarea
                id={`roba-worker-issue-${request.id}`}
                value={issueNote}
                onChange={(e) => setIssueNote(e.target.value)}
                placeholder="Ex.: talla incorrecta, falta una peça..."
                rows={3}
                className="min-h-[80px] resize-y"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIssueOpen(false)}>
              Tanca
            </Button>
            <Button type="button" disabled={issueBusy} onClick={() => void enviarIncidencia()}>
              {issueBusy ? 'Enviant...' : 'Enviar a roba'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function WorkerLeadDeliveryAckCard({
  delivery,
  prodLabel,
  onConfirmed,
}: {
  delivery: DeliveryRow
  prodLabel: (id: string) => string
  onConfirmed: () => void
}) {
  const { mutate } = useSWRConfig()
  const lines = useMemo(() => delivery.lines || [], [delivery.lines])
  const linesKey = lines.map((l) => `${l.productId}:${l.quantity}`).join('|')

  const [sig, setSig] = useState<string | null>(null)
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeNote, setDisputeNote] = useState('')
  const [busyDispute, setBusyDispute] = useState(false)
  const [draftQty, setDraftQty] = useState<string[]>(() => lines.map((l) => String(l.quantity)))

  useEffect(() => {
    setDraftQty(lines.map((l) => String(l.quantity)))
    setSig(null)
    setPadKey((k) => k + 1)
  }, [delivery.id, lines, linesKey])

  const parsedDraftLines = useMemo(
    () =>
      lines
        .map((l, i) => {
          const q = Number(String(draftQty[i] ?? '').replace(',', '.').trim())
          return { productId: l.productId, quantity: q }
        })
        .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0),
    [lines, draftQty]
  )

  const qtyDiffersFromRegistered = useMemo(
    () => robaLinesQuantitiesDiffer(parsedDraftLines, lines),
    [parsedDraftLines, lines]
  )

  const sameRequestedAndDelivered = robaDeliveryRequestedMatchesDelivered(delivery)

  const refreshAfterAction = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'markResolvedRoba',
        requestId: String(delivery.requestId || '').trim() || undefined,
        deliveryId: delivery.id,
      }),
    })
    await Promise.allSettled([
      mutate('/api/notifications?mode=list'),
      mutate('/api/roba-personal/requests'),
      mutate('/api/roba-personal/deliveries'),
    ])
  }

  const fmtLines = (list: { productId: string; quantity: number }[]) =>
    (list || []).map((l, idx) => (
      <li key={`${l.productId}-${idx}`} className="text-sm">
        {prodLabel(l.productId)} x {l.quantity}
      </li>
    ))

  const confirmar = async () => {
    if (!sig) {
      toast({
        title: 'Cal signar',
        description: 'Signeu per confirmar la recepcio.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      await api(`/api/roba-personal/deliveries/${delivery.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'confirmWorkerReceipt',
          workerReceiptAckSignatureDataUrl: sig,
        }),
      })
      toast({ title: 'Recepcio confirmada' })
      await refreshAfterAction()
      setSig(null)
      setPadKey((k) => k + 1)
      onConfirmed()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const enviarIncidencia = async () => {
    if (!qtyDiffersFromRegistered && !disputeNote.trim()) {
      toast({
        title: 'Afegiu el motiu',
        description: 'Expliqueu el problema o ajusteu alguna quantitat.',
        variant: 'destructive',
      })
      return
    }
    setBusyDispute(true)
    try {
      await api(`/api/roba-personal/deliveries/${delivery.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'reportWorkerReceiptDispute',
          proposedLines: qtyDiffersFromRegistered ? parsedDraftLines : undefined,
          note: disputeNote.trim() || undefined,
        }),
      })
      toast({
        title: 'Incidencia enviada',
        description: 'S ha notificat al responsable de roba.',
      })
      await refreshAfterAction()
      setDisputeOpen(false)
      setDisputeNote('')
      onConfirmed()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusyDispute(false)
    }
  }

  return (
    <div
      id={`roba-delivery-ack-${delivery.id}`}
      className="w-full scroll-mt-24 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="font-semibold text-sm sm:text-base">
            {delivery.reference ?? `Entrega ${delivery.id}`}
          </p>
          {delivery.deliveredAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(delivery.deliveredAt).toLocaleString('ca-ES')}
            </p>
          ) : null}
        </div>
        <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Pendent confirmacio
        </span>
      </div>

      {delivery.requestedLines && delivery.requestedLines.length > 0 && !sameRequestedAndDelivered ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sollicitat
            </p>
            <ul className="list-none space-y-1 pl-0 text-muted-foreground">{fmtLines(delivery.requestedLines)}</ul>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Registre de lliurament
            </p>
            <ul className="list-none space-y-1 pl-0">{fmtLines(delivery.lines)}</ul>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quantitats rebudes
        </p>
        <ul className="list-none space-y-2 pl-0">
          {lines.map((l, idx) => (
            <li key={`${l.productId}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[10rem] flex-1">{prodLabel(l.productId)}</span>
              <span className="shrink-0 font-medium tabular-nums">x {l.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDisputeOpen(true)}>
          <AlertTriangle className="mr-1.5 h-4 w-4 shrink-0" />
          Material incorrecte
        </Button>
      </div>

      {qtyDiffersFromRegistered ? null : (
        <>
          <div className="mt-4">
            <RobaSignaturePad key={padKey} onChange={setSig} />
          </div>
          <Button className="mt-3" type="button" disabled={busy || !sig} onClick={() => void confirmar()}>
            {busy ? 'Registrant...' : 'Confirmar recepcio'}
          </Button>
        </>
      )}

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Material incorrecte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Ajusteu quantitats si no coincideixen
              </p>
              <div className="space-y-2">
                {lines.map((l, idx) => (
                  <div key={`${l.productId}-modal-${idx}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm">{prodLabel(l.productId)}</span>
                    <Label className="sr-only" htmlFor={`roba-modal-qty-${delivery.id}-${idx}`}>
                      Quantitat {prodLabel(l.productId)}
                    </Label>
                    <Input
                      id={`roba-modal-qty-${delivery.id}-${idx}`}
                      type="number"
                      min={0}
                      step={1}
                      className="h-8 w-[4.5rem] tabular-nums"
                      value={draftQty[idx] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setDraftQty((prev) => {
                          const base = lines.map((line, i) => prev[i] ?? String(line.quantity))
                          base[idx] = v
                          return base
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <Textarea
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
              placeholder="Expliqueu el problema..."
              rows={4}
              className="min-h-[88px] resize-y"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDisputeOpen(false)}>
              Cancella
            </Button>
            <Button type="button" disabled={busyDispute} onClick={() => void enviarIncidencia()}>
              {busyDispute ? 'Enviant...' : 'Enviar avis a roba'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export function WorkerDeliveryAwaitingCorrectionCard({
  delivery,
  prodLabel,
}: {
  delivery: DeliveryRow
  prodLabel: (id: string) => string
}) {
  const fmtLines = (list: { productId: string; quantity: number }[]) =>
    (list || []).map((l, idx) => (
      <li key={`${l.productId}-${idx}`} className="text-sm text-muted-foreground">
        {prodLabel(l.productId)} x {l.quantity}
      </li>
    ))

  return (
    <div
      id={`roba-delivery-ack-${delivery.id}`}
      className="w-full scroll-mt-24 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm dark:border-amber-900/45 dark:bg-amber-950/20 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-sm sm:text-base">
            {delivery.reference ?? `Entrega ${delivery.id}`}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            Heu indicat una incidencia. Quan roba corregeixi l entrega, rebreu un avis per tornar-la a revisar i signar.
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border bg-background/60 px-3 py-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Registre actual
        </p>
        <ul className="list-none space-y-1 pl-0">{fmtLines(delivery.lines)}</ul>
      </div>
      {delivery.workerReceiptDisputeProposedLines &&
      delivery.workerReceiptDisputeProposedLines.length > 0 ? (
        <div className="mt-3 rounded-md border border-sky-300/50 bg-sky-50/50 px-3 py-2 dark:border-sky-800/40 dark:bg-sky-950/30">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Quantitats indicades per vosaltres
          </p>
          <ul className="list-none space-y-1 pl-0">
            {delivery.workerReceiptDisputeProposedLines.map((l, idx) => (
              <li key={`${l.productId}-prop-${idx}`} className="text-sm text-foreground">
                {prodLabel(l.productId)} x {l.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
