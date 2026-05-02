'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { ProductRow } from './robaPersonalTypes'

export function CompresPanel() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [lines, setLines] = useState<{ productId: string; qty: string }[]>([
    { productId: '', qty: '1' },
  ])
  const [extraEmail, setExtraEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [purchaseContext, setPurchaseContext] = useState<{
    proposalCount: number
    alertsAtOrBelowMin: number
    consumptionWindowDays: number
    supplierCount: number
  } | null>(null)

  const loadProducts = useCallback(async () => {
    try {
      const data = await api<ProductRow[]>('/api/roba-personal/products')
      setProducts(data.filter((x) => x.isActive !== false))
    } catch {
      setProducts([])
    }
  }, [])

  const loadPurchaseDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/roba-personal/purchase')
      const data = (await res.json()) as {
        draft?: {
          proposalLines?: unknown[]
          bySupplier?: Record<string, unknown[]>
          alertsAtOrBelowMin?: number
          consumptionWindowDays?: number
        }
        error?: string
      }
      if (!res.ok) throw new Error(data.error || res.statusText)
      const draft = data.draft
      if (!draft) {
        setPurchaseContext(null)
        return
      }
      const suppliers = draft.bySupplier ? Object.keys(draft.bySupplier) : []
      setPurchaseContext({
        proposalCount: Array.isArray(draft.proposalLines) ? draft.proposalLines.length : 0,
        alertsAtOrBelowMin: draft.alertsAtOrBelowMin ?? 0,
        consumptionWindowDays: draft.consumptionWindowDays ?? 180,
        supplierCount: suppliers.length,
      })
    } catch {
      setPurchaseContext(null)
    }
  }, [])

  useEffect(() => {
    void loadProducts()
    void loadPurchaseDraft()
  }, [loadProducts, loadPurchaseDraft])

  const omplirPropostaSemestral = () => {
    void (async () => {
      try {
        const res = await fetch('/api/roba-personal/purchase')
        const data = (await res.json()) as {
          draft?: {
            proposalLines?: Array<{ productId: string; suggestedQty: number }>
          }
          error?: string
        }
        if (!res.ok) throw new Error(data.error || res.statusText)
        const pl = data.draft?.proposalLines as
          | Array<{ productId: string; suggestedQty: number; supplier?: string; code?: string }>
          | undefined
        if (!Array.isArray(pl) || pl.length === 0) {
          toast({
            title: 'Sense proposta automàtica',
            description:
              'No hi ha articles amb mínim definit i quantitat suggerida > 0 (dèficit + consum en 6 mesos).',
            variant: 'destructive',
          })
          return
        }
        const sorted = [...pl].sort((a, b) => {
          const sa = String(a.supplier || '')
          const sb = String(b.supplier || '')
          const c = sa.localeCompare(sb, 'ca', { sensitivity: 'base' })
          if (c !== 0) return c
          return String(a.code || '').localeCompare(String(b.code || ''), 'ca', {
            sensitivity: 'base',
          })
        })
        setLines(
          sorted.map((p) => ({
            productId: p.productId,
            qty: String(Math.max(1, Math.round(Number(p.suggestedQty) || 0))),
          }))
        )
        toast({
          title: 'Proposta carregada',
          description: 'Línies agrupades per proveïdor al correu. Reviseu quantitats abans d’enviar.',
        })
        void loadPurchaseDraft()
      } catch (e: unknown) {
        toast({
          title: 'Error',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        })
      }
    })()
  }

  const addLine = () => setLines((l) => [...l, { productId: '', qty: '1' }])

  const removeLine = (i: number) => {
    setLines((L) =>
      L.length <= 1 ? [{ productId: '', qty: '1' }] : L.filter((_, j) => j !== i)
    )
  }

  const enviar = async () => {
    const payloadLines = lines
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, quantity: Number(l.qty) }))
      .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0)

    if (payloadLines.length === 0) {
      toast({
        title: 'Falten dades',
        description: 'Trieu almenys un producte i una quantitat.',
        variant: 'destructive',
      })
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/roba-personal/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: payloadLines,
          extraEmail: extraEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
        emailSent?: boolean
        emailError?: string
      }
      if (!res.ok) {
        throw new Error(data.error || data.message || res.statusText)
      }
      toast({
        title: 'Correu enviat',
        description: data.message || 'S’ha enviat des del vostre Outlook (Microsoft 365).',
      })
      setLines([{ productId: '', qty: '1' }])
      setExtraEmail('')
      setNotes('')
      void loadPurchaseDraft()
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
    <div className="space-y-6 w-full">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 w-full">
        <h2 className="font-semibold text-base">Sol·licitud a Compres</h2>

        <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 space-y-3">
          {purchaseContext && purchaseContext.alertsAtOrBelowMin > 0 ? (
            <p className="text-xs font-medium text-amber-900 dark:text-amber-100 bg-amber-500/20 rounded-md px-2 py-1.5 w-fit">
              Hi ha {purchaseContext.alertsAtOrBelowMin} article(s) amb estoc ≤ mínim (darrers{' '}
              {purchaseContext.consumptionWindowDays} dies d’històric d’entregues).
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={omplirPropostaSemestral}>
              Omplir des de proposta semestral
            </Button>
            {purchaseContext ? (
              <span className="text-xs text-muted-foreground">
                {purchaseContext.proposalCount} línies suggerides · {purchaseContext.supplierCount}{' '}
                proveïdor(s)
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:gap-6 lg:items-start">
          <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 px-3 py-3 sm:px-4 space-y-3 lg:col-span-7 min-w-0">
            {lines.map((ln, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3',
                  i > 0 && 'pt-3 mt-1 border-t border-indigo-200/40 dark:border-indigo-900/40'
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Producte · proveïdor</Label>
                  <div className="mt-0.5">
                    <ProductSearchCombobox
                      products={products}
                      value={ln.productId}
                      onChange={(v) =>
                        setLines((L) => L.map((x, j) => (j === i ? { ...x, productId: v } : x)))
                      }
                      placeholder="Cercar i triar…"
                      variant="list"
                    />
                  </div>
                </div>
                <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                  <div className="w-24 space-y-1">
                    <Label className="text-xs text-muted-foreground">Quantitat</Label>
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      value={ln.qty}
                      onChange={(e) => {
                        const v = e.target.value
                        setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: v } : x)))
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-end justify-end sm:justify-start pb-0.5">
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

            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addLine}>
              + Línia
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-muted/20 px-3 py-3 sm:px-4 space-y-3 lg:col-span-5 min-w-0">
            <div className="space-y-1">
              <Label htmlFor="compres-cc" className="text-xs text-muted-foreground">
                Correu addicional (CC)
              </Label>
              <Input
                id="compres-cc"
                type="email"
                className="h-9 font-mono text-sm"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="compres-notes" className="text-xs text-muted-foreground">
                Anotacions
              </Label>
              <Textarea
                id="compres-notes"
                className="min-h-[120px] text-sm resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <Button
            type="button"
            className="w-full sm:w-auto min-h-11 px-6 bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white shadow-sm disabled:opacity-60"
            disabled={busy}
            onClick={() => void enviar()}
          >
            Enviar a Compres (Outlook)
          </Button>
        </div>
      </div>
    </div>
  )
}
