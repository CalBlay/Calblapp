"use client"

import { Loader2, Sparkles, AlertTriangle, Info, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type Confidence = "insufficient" | "low" | "medium" | "high"

type LearningStatus = {
  hasEnoughData?: boolean
  hasNameSuggestions?: boolean
  confidence?: Confidence
  sampleCount?: number
  similarSampleCount?: number
  totalSamplesInDept?: number
  recommendation?: "use_auto" | "consider_semi" | "use_semi_or_manual"
  reason?: string
}

type Person = { id: string; name: string; available: boolean }

type Preview = {
  ok: boolean
  error?: string
  learningStatus: LearningStatus | null
  proposal: {
    responsible: Person | null
    drivers: Person[]
    staff: Person[]
    totalWorkers: number | null
    numDrivers: number | null
  } | null
} | null

type Props = {
  loading: boolean
  error: string | null
  preview: Preview
  onSwitchToSemi: () => void
  onSwitchToManual: () => void
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Confiança alta",
  medium: "Confiança mitjana",
  low: "Confiança baixa",
  insufficient: "Sense dades",
}

const PersonChip = ({ person, role }: { person: Person; role: string }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
      person.available
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-800"
    }`}
    title={`${role}${person.available ? "" : " · marcat com a no disponible al sistema"}`}
  >
    <span className="font-medium">{person.name}</span>
  </span>
)

export default function AutoLearningBanner({
  loading,
  error,
  preview,
  onSwitchToSemi,
  onSwitchToManual,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calculant proposta a partir de l’historic…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5" />
        <div>
          <div className="font-medium">No s’ha pogut calcular la proposta automatica</div>
          <div className="text-xs opacity-80">{error}</div>
        </div>
      </div>
    )
  }

  const status = preview?.learningStatus || null
  const proposal = preview?.proposal || null

  if (!status) return null

  if (!status.hasEnoughData) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div>
            <div className="font-semibold">Encara no hi ha prou dades per Auto</div>
            <div className="text-sm opacity-90">
              {status.reason ||
                "No hi ha quadrants confirmats prou semblants a aquest esdeveniment."}{" "}
              Recomanem fer servir <strong>Semi-auto</strong> o <strong>Manual</strong>.
            </div>
            <div className="text-xs opacity-75 mt-1">
              Mostres similars trobades: {status.similarSampleCount ?? 0} ·
              Total al departament: {status.totalSamplesInDept ?? 0}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onSwitchToSemi}>
              Canviar a Semi-auto
            </Button>
            <Button size="sm" variant="outline" onClick={onSwitchToManual}>
              Canviar a Manual
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 flex items-start gap-3">
        <Info className="h-5 w-5 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold">
            {CONFIDENCE_LABEL[status.confidence || "low"]} · {status.similarSampleCount ?? 0} mostres similars
          </div>
          <div className="text-sm opacity-90">
            Hi ha estructura aproximada pero encara poques dades per proposar noms.
            Pots desar amb Auto o passar a Semi-auto per ajustar manualment.
          </div>
        </div>
      </div>
    )
  }

  const totalWorkers = proposal.totalWorkers ?? proposal.staff.length + proposal.drivers.length + (proposal.responsible ? 1 : 0)
  const numDrivers = proposal.numDrivers ?? proposal.drivers.length

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-emerald-950 space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 mt-0.5 text-emerald-700" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              Proposta basada en {status.similarSampleCount ?? 0} quadrants similars
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200/70 px-2 py-0.5 text-xs text-emerald-900">
              <CheckCircle2 className="h-3 w-3" />
              {CONFIDENCE_LABEL[status.confidence || "high"]}
            </span>
          </div>
          <div className="text-xs opacity-80 mt-0.5">
            Treballadors estimats: {totalWorkers} · Conductors: {numDrivers}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {proposal.responsible && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide font-medium opacity-70 w-24">Responsable</span>
            <PersonChip person={proposal.responsible} role="Responsable" />
          </div>
        )}
        {proposal.drivers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide font-medium opacity-70 w-24">Conductors</span>
            <div className="flex flex-wrap gap-1.5">
              {proposal.drivers.map((d) => (
                <PersonChip key={d.id || d.name} person={d} role="Conductor" />
              ))}
            </div>
          </div>
        )}
        {proposal.staff.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide font-medium opacity-70 w-24">Treballadors</span>
            <div className="flex flex-wrap gap-1.5">
              {proposal.staff.map((s) => (
                <PersonChip key={s.id || s.name} person={s} role="Treballador" />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs opacity-70">
        Pots editar qualsevol valor abans de desar. La disponibilitat real es validara en confirmar.
      </div>
    </div>
  )
}
