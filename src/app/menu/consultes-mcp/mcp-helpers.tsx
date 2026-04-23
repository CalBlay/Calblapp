import type { McpApiErr, McpUiError } from './types'

export function mcpErrorFromApi(body: McpApiErr, status: number): McpUiError {
  return {
    message: body.error || `Error ${status}`,
    hint: body.hint,
    raw: body.raw,
  }
}

export function McpErrorBanner({ err }: { err: McpUiError }) {
  return (
    <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <p className="font-medium">{err.message}</p>
      {err.hint ? <p className="text-xs leading-snug opacity-90">{err.hint}</p> : null}
      {err.raw ? (
        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/10 p-2 text-xs text-slate-900">
          {err.raw}
        </pre>
      ) : null}
    </div>
  )
}

export function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v)
  }
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
