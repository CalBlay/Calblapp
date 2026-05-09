'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
import { AlertTriangle } from 'lucide-react'
import { formatDateOnly } from '@/lib/date-format'
import { robaPersonalApi as api } from './robaPersonalApi'
import { RobaSignaturePad } from './RobaSignaturePad'
import {
  robaDeliveryRequestedMatchesDelivered,
  robaLinesQuantitiesDiffer,
} from './robaDeliveryHelpers'
import type { DeliveryRow, RequestRow } from './robaPersonalTypes'

/** Treballador: només llista validada + signatura (les línies venen del servidor). */
export function WorkerReceiptConfirmationCard({
  request,
  prodLabel,
  onConfirmed,
}: {
  request: RequestRow
  prodLabel: (id: string) => string
  onConfirmed: () => void
}) {
  const [sig, setSig] = useState<string | null>(null)
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState(false)

  const confirmar = async () => {
    if (!sig) {
      toast({
        title: 'Cal signar',
        description: 'Signeu per confirmar que us han lliurat aquest material.',
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
      toast({ title: 'Recepció confirmada' })
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

  return (
    <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-900/50 bg-indigo-50/35 dark:bg-indigo-950/20 p-4 sm:p-5 space-y-4 w-full">
      <div className="space-y-1">
        <p className="font-semibold text-base">
          {request.reference ?? `Sol·licitud ${request.id}`}
        </p>
        <p className="text-xs text-muted-foreground">{request.requestingDepartment}</p>
        {request.pickupDate ? (
          <p className="text-xs text-muted-foreground">
            Recollida prevista: {formatDateOnly(request.pickupDate)}
          </p>
        ) : null}
        {request.pickupAvailabilityMessage ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {request.pickupAvailabilityMessage}
          </p>
        ) : null}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Material
        </p>
        <ul className="text-sm space-y-1.5 list-disc pl-4 text-foreground">
          {(request.lines || []).map((l, idx) => (
            <li key={`${l.productId}-${idx}`}>
              {prodLabel(l.productId)} × {l.quantity}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Aquest pas és el <strong>lliurament final</strong> (es descompta estoc). Signeu només si el material coincideix;
        si no, parleu amb roba abans de signar.
      </p>
      <RobaSignaturePad key={padKey} onChange={setSig} />
      <Button type="button" disabled={busy || !sig} onClick={() => void confirmar()}>
        {busy ? 'Registrant…' : 'Confirmar recepció'}
      </Button>
    </div>
  )
}

/** Entrega ja registrada pel responsable; el treballador confirma amb signatura o sol·licita rectificació de quantitats. */
export function WorkerLeadDeliveryAckCard({
  delivery,
  prodLabel,
  onConfirmed,
}: {
  delivery: DeliveryRow
  prodLabel: (id: string) => string
  onConfirmed: () => void
}) {
  const lines = delivery.lines || []
  const linesKey = lines.map((l) => `${l.productId}:${l.quantity}`).join('|')

  const [sig, setSig] = useState<string | null>(null)
  const [padKey, setPadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeNote, setDisputeNote] = useState('')
  const [busyDispute, setBusyDispute] = useState(false)
  const [rectOpen, setRectOpen] = useState(false)
  const [rectNote, setRectNote] = useState('')
  const [busyRect, setBusyRect] = useState(false)
  const [draftQty, setDraftQty] = useState<string[]>(() => lines.map((l) => String(l.quantity)))

  useEffect(() => {
    const nextLines = delivery.lines || []
    setDraftQty(nextLines.map((l) => String(l.quantity)))
    setSig(null)
    setPadKey((k) => k + 1)
  }, [delivery.id, linesKey])

  const parsedDraftLines = useMemo(() => {
    return lines
      .map((l, i) => {
        const q = Number(String(draftQty[i] ?? '').replace(',', '.').trim())
        return { productId: l.productId, quantity: q }
      })
      .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
  }, [lines, draftQty])

  const qtyDiffersFromRegistered = useMemo(
    () => robaLinesQuantitiesDiffer(parsedDraftLines, lines),
    [parsedDraftLines, lines]
  )

  const sameRequestedAndDelivered = robaDeliveryRequestedMatchesDelivered(delivery)

  const fmtLines = (list: { productId: string; quantity: number }[]) =>
    (list || []).map((l, idx) => (
      <li key={`${l.productId}-${idx}`} className="text-sm">
        {prodLabel(l.productId)} × {l.quantity}
      </li>
    ))

  const confirmar = async () => {
    if (!sig) {
      toast({
        title: 'Cal signar',
        description: 'Signeu per confirmar la recepció.',
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
      toast({ title: 'Recepció confirmada' })
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
    setBusyDispute(true)
    try {
      await api(`/api/roba-personal/deliveries/${delivery.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'reportWorkerReceiptDispute',
          note: disputeNote.trim() || undefined,
        }),
      })
      toast({
        title: 'Incidència enviada',
        description: 'S’ha notificat al responsable de roba.',
      })
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

  const enviarRectificacio = async () => {
    if (!qtyDiffersFromRegistered) {
      toast({
        title: 'Sense canvis',
        description: 'Les quantitats coincideixen amb el registre.',
        variant: 'destructive',
      })
      return
    }
    if (parsedDraftLines.length === 0) {
      toast({
        title: 'Quantitats no vàlides',
        description: 'Cal almenys una línia amb quantitat superior a 0.',
        variant: 'destructive',
      })
      return
    }
    setBusyRect(true)
    try {
      await api(`/api/roba-personal/deliveries/${delivery.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'reportWorkerReceiptDispute',
          proposedLines: parsedDraftLines,
          note: rectNote.trim() || undefined,
        }),
      })
      toast({
        title: 'Sol·licitud de rectificació enviada',
        description: 'El responsable revisarà les quantitats i us ho tornarà a enviar per confirmar.',
      })
      setRectOpen(false)
      setRectNote('')
      onConfirmed()
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setBusyRect(false)
    }
  }

  return (
    <div
      id={`roba-delivery-ack-${delivery.id}`}
      className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full scroll-mt-24 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="font-semibold text-sm sm:text-base">
            {delivery.reference ?? `Entrega ${delivery.id}`}
          </p>
          {delivery.deliveredAt ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(delivery.deliveredAt).toLocaleString('ca-ES')}
            </p>
          ) : null}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-500/15 px-2 py-1 rounded-md shrink-0">
          Pendent confirmació
        </span>
      </div>

      {delivery.requestedLines && delivery.requestedLines.length > 0 && !sameRequestedAndDelivered ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Sol·licitat
            </p>
            <ul className="space-y-1 list-none pl-0 text-muted-foreground">{fmtLines(delivery.requestedLines)}</ul>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Registre de lliurament
            </p>
            <ul className="space-y-1 list-none pl-0">{fmtLines(delivery.lines)}</ul>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-border bg-muted/20 px-3 py-3 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quantitats que heu rebut (ajusteu si no coincideixen amb el lliurament físic)
        </p>
        <ul className="space-y-2 list-none pl-0">
          {lines.map((l, idx) => (
            <li key={`${l.productId}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1 min-w-[10rem]">{prodLabel(l.productId)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Label className="sr-only" htmlFor={`roba-ack-qty-${delivery.id}-${idx}`}>
                  Quantitat {prodLabel(l.productId)}
                </Label>
                <Input
                  id={`roba-ack-qty-${delivery.id}-${idx}`}
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
                <span className="text-xs text-muted-foreground">u.</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {qtyDiffersFromRegistered ? (
        <p className="text-xs text-amber-900/95 dark:text-amber-100/95 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 leading-relaxed">
          Les quantitats editades no coincideixen amb el registre del responsable. En lloc de signar, envieu una{' '}
          <strong>sol·licitud de rectificació</strong>. Quan roba actualitzi l&apos;entrega, podreu tornar a revisar i
          signar.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Si el problema és un producte erroni o una altra incidència sense canvi de quantitat, useu «Material incorrecte».
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {qtyDiffersFromRegistered ? (
          <Button type="button" size="sm" onClick={() => setRectOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-1.5 shrink-0" />
            Sol·licitar rectificació
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setDisputeOpen(true)}>
          <AlertTriangle className="h-4 w-4 mr-1.5 shrink-0" />
          Material incorrecte
        </Button>
      </div>

      {qtyDiffersFromRegistered ? null : (
        <>
          <RobaSignaturePad key={padKey} onChange={setSig} />
          <Button type="button" disabled={busy || !sig} onClick={() => void confirmar()}>
            {busy ? 'Registrant…' : 'Confirmar recepció'}
          </Button>
        </>
      )}

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incidència en l’entrega</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Descriviu el problema (producte erroni, talla, etc.). El responsable que va registrar l’entrega rebrà una
            notificació i podrà corregir el registre.
          </p>
          <Textarea
            value={disputeNote}
            onChange={(e) => setDisputeNote(e.target.value)}
            placeholder="Opcional: detall breu…"
            rows={4}
            className="resize-y min-h-[88px]"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDisputeOpen(false)}>
              Cancel·la
            </Button>
            <Button type="button" disabled={busyDispute} onClick={() => void enviarIncidencia()}>
              {busyDispute ? 'Enviant…' : 'Enviar avís a roba'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rectOpen} onOpenChange={setRectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sol·licitud de rectificació</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Es notificarà al responsable de roba amb les quantitats que heu indicat. Podeu afegir un comentari opcional.
          </p>
          <ul className="text-sm space-y-1 list-none pl-0 rounded-md border border-border bg-muted/20 px-3 py-2">
            {parsedDraftLines.map((l, idx) => (
              <li key={`${l.productId}-rect-${idx}`}>
                {prodLabel(l.productId)} × {l.quantity}
              </li>
            ))}
          </ul>
          <Textarea
            value={rectNote}
            onChange={(e) => setRectNote(e.target.value)}
            placeholder="Comentari opcional…"
            rows={3}
            className="resize-y min-h-[72px] text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRectOpen(false)}>
              Cancel·la
            </Button>
            <Button type="button" disabled={busyRect} onClick={() => void enviarRectificacio()}>
              {busyRect ? 'Enviant…' : 'Enviar sol·licitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Treballador: incidència enviada; espera correcció abans de poder signar de nou. */
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
        {prodLabel(l.productId)} × {l.quantity}
      </li>
    ))

  return (
    <div
      id={`roba-delivery-ack-${delivery.id}`}
      className="rounded-xl border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/45 p-4 sm:p-5 space-y-3 w-full scroll-mt-24 shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-sm sm:text-base">
            {delivery.reference ?? `Entrega ${delivery.id}`}
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            Heu indicat que el material registrat no és correcte. Quan roba corregeixi l’entrega,
            rebreu un avís per tornar a revisar i signar.
          </p>
        </div>
      </div>
      <div className="rounded-md border border-border bg-background/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Registre actual (fins a correcció)
        </p>
        <ul className="space-y-1 list-none pl-0">{fmtLines(delivery.lines)}</ul>
      </div>
      {delivery.workerReceiptDisputeProposedLines &&
      delivery.workerReceiptDisputeProposedLines.length > 0 ? (
        <div className="rounded-md border border-sky-300/50 bg-sky-50/50 dark:bg-sky-950/30 dark:border-sky-800/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Quantitats que heu sol·licitat
          </p>
          <ul className="space-y-1 list-none pl-0">
            {delivery.workerReceiptDisputeProposedLines.map((l, idx) => (
              <li key={`${l.productId}-prop-${idx}`} className="text-sm text-foreground">
                {prodLabel(l.productId)} × {l.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
