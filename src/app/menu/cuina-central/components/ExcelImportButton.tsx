'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { loadXlsx } from '@/lib/loadXlsx'
import type { ImportEntity } from '@/lib/cuina-central/types'

type Props = {
  entity: ImportEntity
  label?: string
  onDone: (summary: string) => void
}

export default function ExcelImportButton({ entity, label, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const XLSX = await loadXlsx()
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const res = await fetch('/api/cuina-central/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, rows, mode: 'incremental' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Import fallit'))
      onDone(
        `Import ${entity}: +${json.created || 0} creats, ${json.updated || 0} actualitzats, ${json.skipped || 0} omessos.`
      )
    } catch (e) {
      onDone(e instanceof Error ? e.message : 'Error importació')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Important…' : label || 'Importar Excel'}
      </Button>
    </>
  )
}
