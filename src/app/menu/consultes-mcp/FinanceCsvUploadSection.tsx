'use client'

import { ChangeEvent, memo, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatabaseZap, FolderUp, RefreshCw } from 'lucide-react'

type UploadResult = {
  ok?: boolean
  bucket?: string
  uploadedCount?: number
  skippedCount?: number
  uploaded?: Array<{ name: string; path: string; kind: string; size: number }>
  skipped?: Array<{ name: string; reason: string }>
  error?: string
}

type SignedUpload = {
  ok?: boolean
  url?: string
  bucket?: string
  path?: string
  kind?: string
  contentType?: string
  error?: string
}

const relativePathFor = (file: File) =>
  String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)

const readUploadResult = async (res: Response): Promise<UploadResult> => {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return (await res.json().catch(() => ({}))) as UploadResult
  }

  const text = await res.text().catch(() => '')
  return {
    error: text.trim() || `${res.status} ${res.statusText}`.trim() || 'Resposta no JSON',
  }
}

const responseError = (res: Response, data: UploadResult) =>
  data.error || `${res.status} ${res.statusText}`.trim() || 'Error desconegut'

const fetchErrorMessage = (err: unknown, context: string) => {
  const message = err instanceof Error ? err.message : ''
  if (/failed to fetch/i.test(message)) {
    return `${context}: el navegador ha bloquejat la connexio o el bucket no te CORS configurat`
  }
  return message ? `${context}: ${message}` : context
}

const uploadOneThroughApp = async (file: File, relativePath: string, kind: string) => {
  const form = new FormData()
  form.append('kind', kind)
  form.append('files', file, file.name)
  form.append('paths', relativePath)

  const res = await fetch('/api/mcp/finances/upload-csv', {
    method: 'POST',
    body: form,
  })
  const data = await readUploadResult(res)
  return { res, data }
}

function FinanceCsvUploadSectionInner() {
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallbackKind, setFallbackKind] = useState('compres')

  useEffect(() => {
    const input = folderInputRef.current
    if (!input) return
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
  }, [])

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    setFiles(selected)
    setResult(null)
    setError(null)
  }

  const upload = async () => {
    if (!files.length) return
    setUploading(true)
    setResult(null)
    setError(null)

    try {
      const uploaded: NonNullable<UploadResult['uploaded']> = []
      const skipped: NonNullable<UploadResult['skipped']> = []
      let bucket = ''

      for (const file of files) {
        if (!/\.(csv|tsv)$/i.test(file.name)) {
          skipped.push({ name: file.name, reason: 'No es CSV/TSV' })
          continue
        }

        const relativePath = relativePathFor(file)
        let signed: SignedUpload = {}
        let directUploadError = ''

        try {
          const signRes = await fetch('/api/mcp/finances/signed-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              relativePath,
              kind: fallbackKind,
              contentType: file.type || 'text/csv',
            }),
          })
          signed = (await signRes.json().catch(() => ({}))) as SignedUpload
          if (!signRes.ok || !signed.url || signed.ok === false) {
            directUploadError = signed.error || `Signatura ${signRes.status} ${signRes.statusText}`.trim()
          }
        } catch (err) {
          directUploadError = fetchErrorMessage(err, "No s'ha pogut signar la pujada")
        }

        if (signed.url && !directUploadError) {
          try {
            const uploadRes = await fetch(signed.url, {
              method: 'PUT',
              headers: { 'Content-Type': signed.contentType || file.type || 'text/csv' },
              body: file,
            })
            if (uploadRes.ok) {
              bucket = signed.bucket || bucket
              uploaded.push({
                name: file.name,
                path: signed.path || file.name,
                kind: signed.kind || fallbackKind,
                size: file.size,
              })
              continue
            }
            directUploadError = `Bucket ${uploadRes.status} ${uploadRes.statusText}`.trim()
          } catch (err) {
            directUploadError = `${fetchErrorMessage(err, 'Pujada directa al bucket')}. Reintentant via app`
          }
        }

        const fallback = await uploadOneThroughApp(file, relativePath, fallbackKind).catch((err) => ({
          res: null,
          data: {
            error: fetchErrorMessage(err, "No s'ha pogut pujar via app"),
          } as UploadResult,
        }))

        if (!fallback.res?.ok || fallback.data.ok === false) {
          skipped.push({
            name: file.name,
            reason: fallback.res
              ? responseError(fallback.res, fallback.data)
              : fallback.data.error || directUploadError || 'Error pujant via app',
          })
          continue
        }

        bucket = fallback.data.bucket || bucket
        uploaded.push(...(fallback.data.uploaded || []))
        skipped.push(...(fallback.data.skipped || []))
      }

      setResult({
        ok: true,
        bucket,
        uploadedCount: uploaded.length,
        skippedCount: skipped.length,
        uploaded,
        skipped,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No s’han pogut pujar els CSV')
    } finally {
      setUploading(false)
    }
  }

  const totalCsv = files.filter((file) => /\.(csv|tsv)$/i.test(file.name)).length

  return (
    <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-6 w-6 text-emerald-700" />
          <h2 className="text-lg font-semibold text-emerald-950">CSV finances</h2>
        </div>
        <Button
          type="button"
          onClick={upload}
          disabled={uploading || totalCsv === 0}
          className="min-h-10 bg-emerald-700 text-white hover:bg-emerald-800"
        >
          {uploading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FolderUp className="mr-2 h-4 w-4" />
          )}
          Actualitzar bucket
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <div className="space-y-2">
          <label htmlFor="finance-folder-upload" className="text-sm font-medium text-slate-800">
            Carpeta o fitxers CSV
          </label>
          <input
            ref={folderInputRef}
            id="finance-folder-upload"
            type="file"
            multiple
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            onChange={onFilesChange}
            className="block w-full rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-900"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="finance-upload-kind" className="text-sm font-medium text-slate-800">
            Si són fitxers solts
          </label>
          <select
            id="finance-upload-kind"
            value={fallbackKind}
            onChange={(event) => setFallbackKind(event.target.value)}
            className="h-10 w-full rounded-md border border-emerald-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="compres">Compres</option>
            <option value="costos">Costos</option>
            <option value="vendes">Vendes</option>
            <option value="rh">RH</option>
          </select>
        </div>
        <div className="text-sm text-slate-700">
          {files.length ? `${totalCsv} CSV/TSV seleccionats de ${files.length} fitxers` : 'Cap fitxer seleccionat'}
        </div>
      </div>

      <p className="text-sm text-slate-600">
        Si selecciones una carpeta amb subcarpetes <strong>compres</strong>, <strong>costos</strong>,{' '}
        <strong>vendes</strong> o <strong>recursos_humans</strong>, cada CSV es puja al destí
        corresponent dins del bucket.
      </p>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-md border border-emerald-200 bg-white p-3 text-sm text-slate-700">
          <div className="font-medium text-emerald-900">
            {result.uploadedCount || 0} fitxers pujats
            {result.bucket ? ` a ${result.bucket}` : ''}
            {result.skippedCount ? ` · ${result.skippedCount} ignorats` : ''}
          </div>
          {result.uploaded?.length ? (
            <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs">
              {result.uploaded.slice(0, 12).map((item) => (
                <li key={item.path} className="truncate">
                  {item.path}
                </li>
              ))}
            </ul>
          ) : null}
          {result.skipped?.length ? (
            <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-amber-800">
              {result.skipped.slice(0, 12).map((item) => (
                <li key={`${item.name}-${item.reason}`} className="truncate">
                  {item.name}: {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export const FinanceCsvUploadSection = memo(FinanceCsvUploadSectionInner)
