'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Control = {
  enabled: boolean
  lastRunAt: string | null
  lastRunSummary: string | null
  lastRunError: string | null
  lastRunJobId: string | null
}

type Props = {
  /** Només es pinta si l’usuari té el permís. */
  visible: boolean
}

export function CalendarOportunitatsSapControls({ visible }: Props) {
  const [control, setControl] = useState<Control | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!visible) return
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/oportunitats-sap/control', {
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setControl(json.control)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error carregant control')
    } finally {
      setLoading(false)
    }
  }, [visible])

  useEffect(() => {
    void load()
  }, [load])

  if (!visible) return null

  const enabled = control?.enabled === true

  const toggle = async () => {
    setToggling(true)
    setMessage(null)
    try {
      const res = await fetch('/api/calendar/oportunitats-sap/control', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setControl(json.control)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error canviant interruptor')
    } finally {
      setToggling(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    setMessage(null)
    try {
      const res = await fetch('/api/calendar/oportunitats-sap/run', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      if (json.control) setControl(json.control)
      setMessage(json.hint || 'Feina encoada al PC worker.')
      alert(json.hint || 'Feina encoada al PC worker (oportunitats SAP).')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error encoant'
      setMessage(msg)
      alert(msg)
    } finally {
      setRunning(false)
      void load()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void toggle()}
        disabled={toggling || loading}
        className="flex items-center gap-1"
        title="Interruptor proves: OFF no permet revisar"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            enabled ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
          aria-hidden
        />
        {toggling
          ? '…'
          : enabled
            ? 'Oportunitats SAP ON'
            : 'Oportunitats SAP OFF'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void runNow()}
        disabled={!enabled || running || loading}
        className="flex items-center gap-1"
        title="Només mails d’avui (oriol@) → crea oportunitats a SAP si n’hi ha"
      >
        <RefreshCw
          size={14}
          className={running ? 'animate-spin text-blue-500' : ''}
        />
        {running ? 'Encoant…' : 'Crear oportunitats (avui)'}
      </Button>
      {message ? (
        <span className="max-w-[220px] truncate text-xs text-slate-500" title={message}>
          {message}
        </span>
      ) : control?.lastRunSummary ? (
        <span
          className="max-w-[220px] truncate text-xs text-slate-500"
          title={control.lastRunSummary}
        >
          Últim: {control.lastRunSummary}
        </span>
      ) : null}
    </div>
  )
}
