'use client'

import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  parseArticlesCatalogFile,
  type ParseArticlesCatalogResult,
} from '@/lib/eventComanda/parseArticlesCatalogExcel'

type Props = {
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onError: (message: string) => void
  onImported: () => void
}

export default function EventComandaCatalogImportPanel({
  busy,
  onBusyChange,
  onError,
  onImported,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<ParseArticlesCatalogResult | null>(null)
  const [fileName, setFileName] = useState('')

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFile = async (file: File) => {
    onBusyChange(true)
    onError('')
    setPreview(null)
    try {
      const parsed = await parseArticlesCatalogFile(file)
      if (parsed.lines.length === 0) {
        onError(parsed.warnings[0] || 'No s\'han trobat articles vàlids al fitxer.')
        return
      }
      setFileName(file.name)
      setPreview(parsed)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No s\'ha pogut llegir el fitxer Excel.')
    } finally {
      onBusyChange(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    onBusyChange(true)
    onError('')
    try {
      const res = await fetch('/api/event-comanda/catalog-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: preview.lines }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(String(json?.error || 'No s\'ha pogut importar el catàleg.'))
      }
      setPreview(null)
      setFileName('')
      resetInput()
      onImported()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No s\'ha pogut importar el catàleg.')
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <div>
            <h2 className="font-semibold text-lg">Importar catàleg ERP</h2>
            <p className="text-sm text-slate-600">
              Fitxer «Articles APP.xlsx»: codi, nom, unitat, magatzem, grup, família i subfamília.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button
            variant="outline"
            className="gap-2"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Seleccionar fitxer
          </Button>
          {preview ? (
            <Button
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={busy}
              onClick={() => void handleConfirm()}
            >
              Importar {preview.stats.articleCount.toLocaleString('ca-ES')} articles
            </Button>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
          <p className="font-medium text-slate-800">{fileName}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
            <span>{preview.stats.articleCount.toLocaleString('ca-ES')} articles</span>
            <span>{preview.stats.warehouseCount} magatzems</span>
            <span>{preview.stats.unitCount} unitats</span>
            <span>{preview.stats.groupCount} grups</span>
            <span>{preview.stats.familyCount} famílies</span>
            <span>{preview.stats.subfamilyCount} subfamílies</span>
          </div>
          {preview.warnings.length ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {preview.warnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              {preview.warnings.length > 5 ? (
                <li>… i {preview.warnings.length - 5} avisos més</li>
              ) : null}
            </ul>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-white bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Codi</th>
                  <th className="px-2 py-1.5">Nom</th>
                  <th className="px-2 py-1.5">U.</th>
                  <th className="px-2 py-1.5">Mag.</th>
                  <th className="px-2 py-1.5">Grup</th>
                  <th className="px-2 py-1.5">Família</th>
                  <th className="px-2 py-1.5">Subfamília</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.slice(0, 8).map((line) => (
                  <tr key={line.articleCode} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-mono">{line.articleCode}</td>
                    <td className="max-w-[12rem] truncate px-2 py-1.5">{line.articleName}</td>
                    <td className="px-2 py-1.5 font-mono">{line.unit}</td>
                    <td className="px-2 py-1.5 font-mono">{line.warehouseCode}</td>
                    <td className="max-w-[8rem] truncate px-2 py-1.5">{line.erpGroupName || '—'}</td>
                    <td className="max-w-[8rem] truncate px-2 py-1.5">{line.erpFamilyName || '—'}</td>
                    <td className="max-w-[8rem] truncate px-2 py-1.5">{line.erpSubfamilyName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Els magatzems assignats manualment no es sobreescriuen. La resta s&apos;actualitza des de
            la columna «Codi Magatzem».
          </p>
        </div>
      ) : null}
    </div>
  )
}
