import 'server-only'
import { firestoreAdmin } from '@/lib/firebaseAdmin'

export const OPORTUNITATS_SAP_CONTROL_DOC =
  'calendar_controls/oportunitats_sap'

export type OportunitatsSapControl = {
  /** Interruptor proves: OFF = no s’encua feina. */
  enabled: boolean
  updatedAt: string | null
  updatedBy: string | null
  lastRunAt: string | null
  lastRunBy: string | null
  lastRunJobId: string | null
  lastRunSummary: string | null
  lastRunError: string | null
}

const defaults = (): OportunitatsSapControl => ({
  enabled: false,
  updatedAt: null,
  updatedBy: null,
  lastRunAt: null,
  lastRunBy: null,
  lastRunJobId: null,
  lastRunSummary: null,
  lastRunError: null,
})

export async function getOportunitatsSapControl(): Promise<OportunitatsSapControl> {
  const snap = await firestoreAdmin.doc(OPORTUNITATS_SAP_CONTROL_DOC).get()
  if (!snap.exists) return defaults()
  const d = snap.data() || {}
  return {
    enabled: d.enabled === true,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
    updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : null,
    lastRunAt: typeof d.lastRunAt === 'string' ? d.lastRunAt : null,
    lastRunBy: typeof d.lastRunBy === 'string' ? d.lastRunBy : null,
    lastRunJobId: typeof d.lastRunJobId === 'string' ? d.lastRunJobId : null,
    lastRunSummary:
      typeof d.lastRunSummary === 'string' ? d.lastRunSummary : null,
    lastRunError: typeof d.lastRunError === 'string' ? d.lastRunError : null,
  }
}

export async function setOportunitatsSapEnabled(opts: {
  enabled: boolean
  userEmail: string
}): Promise<OportunitatsSapControl> {
  const now = new Date().toISOString()
  const ref = firestoreAdmin.doc(OPORTUNITATS_SAP_CONTROL_DOC)
  await ref.set(
    {
      enabled: opts.enabled === true,
      updatedAt: now,
      updatedBy: opts.userEmail,
    },
    { merge: true }
  )
  return getOportunitatsSapControl()
}

export async function recordOportunitatsSapRun(opts: {
  userEmail: string
  jobId: string | null
  summary: string | null
  error: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  await firestoreAdmin.doc(OPORTUNITATS_SAP_CONTROL_DOC).set(
    {
      lastRunAt: now,
      lastRunBy: opts.userEmail,
      lastRunJobId: opts.jobId,
      lastRunSummary: opts.summary,
      lastRunError: opts.error,
    },
    { merge: true }
  )
}

/** Encua feina al Gestor Compres (PC worker). */
export async function enqueueCompresSalesOppJob(): Promise<{
  ok: boolean
  jobId: string | null
  hint: string | null
  error: string | null
}> {
  const appUrl = (process.env.COMPRES_APP_URL || '').replace(/\/$/, '')
  const agentKey = process.env.COMPRES_AGENT_KEY || ''
  if (!appUrl || !agentKey) {
    return {
      ok: false,
      jobId: null,
      hint: null,
      error:
        'Falten COMPRES_APP_URL o COMPRES_AGENT_KEY a .env.local / Vercel (calblapp).',
    }
  }

  // Prova controlada des de Calendar: només mails d’avui + crear a SAP.
  const res = await fetch(`${appUrl}/api/agent-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-compres-agent-key': agentKey,
    },
    body: JSON.stringify({
      kind: 'sales-opp-from-mail',
      params: { todayOnly: true, confirm: true },
    }),
    signal: AbortSignal.timeout(30000),
  })
  const text = await res.text()
  let json: { job?: { id?: string }; hint?: string; error?: string } = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    // ignore
  }
  if (!res.ok) {
    return {
      ok: false,
      jobId: null,
      hint: null,
      error: json.error || `Compres ${res.status}: ${text.slice(0, 200)}`,
    }
  }
  return {
    ok: true,
    jobId: json.job?.id || null,
    hint: json.hint || null,
    error: null,
  }
}
