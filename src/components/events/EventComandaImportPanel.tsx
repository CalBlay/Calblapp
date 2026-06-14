'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EventComandaFamilyList from '@/components/events/EventComandaFamilyList'
import { parseErpExcelFile, type ParseErpExcelResult } from '@/lib/eventComanda/parseErpExcel'
import type { EventComandaLine } from '@/lib/eventComanda/types'
import {
  eventComandaActionBarClass,
  eventComandaActionGridClass,
  eventComandaPanelClass,
  eventComandaPreviewMetaClass,
  eventComandaPrimaryButtonClass,
  eventComandaStatsClass,
} from '@/lib/eventComanda/ui'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

export type EventComandaImportPanelHandle = {
  openFilePicker: () => void
}

type Props = {
  eventId: string
  onImported: () => void
  allowReplace?: boolean
  compact?: boolean
  hiddenTrigger?: boolean
  onPreviewChange?: (active: boolean) => void
}

const EventComandaImportPanel = forwardRef<EventComandaImportPanelHandle, Props>(
  function EventComandaImportPanel(
    {
      eventId,
      onImported,
      allowReplace = false,
      compact = false,
      hiddenTrigger = false,
      onPreviewChange,
    },
    ref
  ) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [preview, setPreview] = useState<ParseErpExcelResult | null>(null)
    const [fileName, setFileName] = useState('')

    useImperativeHandle(ref, () => ({
      openFilePicker: () => inputRef.current?.click(),
    }))

    useEffect(() => {
      onPreviewChange?.(preview != null)
    }, [preview, onPreviewChange])

    const previewLinesByFamily = useMemo(() => {
      if (!preview) return {}
      const grouped: Record<string, EventComandaLine[]> = {}
      for (const line of preview.lines) {
        grouped[line.family] ||= []
        grouped[line.family].push(line)
      }
      return grouped
    }, [preview])

    const resetInput = () => {
      if (inputRef.current) inputRef.current.value = ''
    }

    const handleFile = async (file: File) => {
      setBusy(true)
      setError('')
      setPreview(null)
      try {
        const parsed = await parseErpExcelFile(file)
        if (parsed.lines.length === 0) {
          const qtyWarnings = parsed.warnings.filter((w) => w.startsWith('Sense quantitat'))
          const summary =
            qtyWarnings.length > 1
              ? `${qtyWarnings.length} línies sense quantitat (ex.: ${qtyWarnings[0]})`
              : parsed.warnings[0] || 'No s\'han trobat línies vàlides al fitxer.'
          setError(summary)
          return
        }
        setFileName(file.name)
        setPreview(parsed)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No s\'ha pogut llegir el fitxer Excel.')
      } finally {
        setBusy(false)
      }
    }

    const handleConfirm = async () => {
      if (!preview) return
      setBusy(true)
      setError('')
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/comanda`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName,
            dateRangeLabel: preview.dateRangeLabel,
            families: preview.families,
            lines: preview.lines,
            warnings: preview.warnings,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(json?.error || 'No s\'ha pogut guardar la plantilla.'))
        }
        setPreview(null)
        setFileName('')
        resetInput()
        onImported()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error guardant la plantilla.')
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className={cn('w-full', preview || error || !hiddenTrigger ? 'space-y-3 sm:space-y-4' : '')}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        {!hiddenTrigger ? (
          <div className={cn('flex w-full flex-col gap-2', compact ? '' : 'lg:items-start')}>
            <Button
              type="button"
              className={cn(eventComandaPrimaryButtonClass, 'gap-2', compact && 'lg:w-full')}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {busy && !preview
                  ? 'Llegint fitxer…'
                  : allowReplace
                    ? 'Actualitzar plantilla ERP'
                    : 'Importar plantilla ERP'}
              </span>
            </Button>
          </div>
        ) : null}

        {error ? (
          <p className={cn(typography('bodySm'), 'text-red-600', compact ? '' : 'lg:text-left')}>
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className={eventComandaPanelClass}>
            <div className={eventComandaPreviewMetaClass}>
              <div className="min-w-0 space-y-1">
                <p className={typography('sectionTitle')}>Previsualització</p>
                <p className={cn(typography('bodySm'), 'break-all')}>
                  Fitxer: <span className="font-semibold text-slate-800">{fileName}</span>
                </p>
                {preview.dateRangeLabel ? (
                  <p className={typography('bodySm')}>Període ERP: {preview.dateRangeLabel}</p>
                ) : null}
              </div>
              <div className={cn(eventComandaStatsClass(), 'shrink-0 lg:text-right')}>
                <span>{preview.lines.length} línies</span>
                <span aria-hidden className="text-slate-300">
                  ·
                </span>
                <span>{preview.families.length} grups</span>
                <span aria-hidden className="text-slate-300">
                  ·
                </span>
                <span>{preview.totalQty} u.</span>
              </div>
            </div>

            {preview.warnings.length > 0 ? (
              <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                {preview.warnings.slice(0, 5).map((warning, index) => (
                  <p key={index} className="text-xs leading-relaxed text-amber-800">
                    {warning}
                  </p>
                ))}
                {preview.warnings.length > 5 ? (
                  <p className="text-xs text-amber-800">+{preview.warnings.length - 5} avisos més</p>
                ) : null}
              </div>
            ) : null}

            <EventComandaFamilyList
              linesByFamily={previewLinesByFamily}
              familyOrder={preview.families}
              previewLimitPerFamily={8}
            />

            <div className={eventComandaActionBarClass}>
              <div className={eventComandaActionGridClass}>
                <Button
                  type="button"
                  variant="outline"
                  className={eventComandaPrimaryButtonClass}
                  disabled={busy}
                  onClick={() => {
                    setPreview(null)
                    setFileName('')
                    resetInput()
                  }}
                >
                  Cancel·lar
                </Button>
                <Button
                  type="button"
                  className={eventComandaPrimaryButtonClass}
                  disabled={busy}
                  onClick={() => void handleConfirm()}
                >
                  {busy ? 'Guardant…' : 'Confirmar plantilla'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
)

export default EventComandaImportPanel
