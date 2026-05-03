import type { RrhhRobaOverview } from './rrhhOverview'

export type RrhhSignalTone = 'positive' | 'neutral' | 'attention' | 'critical'

export type RrhhSignal = {
  tone: RrhhSignalTone
  message: string
}

/**
 * Lectures tipus control intern: regles explícites (sense IA).
 * Llindars revisables amb RRHH quan hi hagi sèrie històrica.
 */
export function deriveRrhhSignals(d: RrhhRobaOverview): RrhhSignal[] {
  if (d.totalRequests === 0) {
    return [
      {
        tone: 'neutral',
        message:
          'Sense sol·licituds en el període; ampliï el rang de dates o confirmi que no hi ha moviment.',
      },
    ]
  }

  const signals: RrhhSignal[] = []
  const active = d.totalRequests - d.cancelledRequestsInPeriod
  const pendingRatio = active > 0 ? d.requestsPendingNoDelivery / active : 0

  if (d.deliveriesWithOpenDispute > 0) {
    signals.push({
      tone: 'critical',
      message: `${d.deliveriesWithOpenDispute} entrega(es) amb incidència de recepció oberta: prioritat per evitar disputes allargades.`,
    })
  }

  let backlogFlagged = false
  if (d.requestsPendingNoDelivery > 0 && pendingRatio >= 0.35 && active >= 3) {
    backlogFlagged = true
    signals.push({
      tone: 'attention',
      message: `Backlog rellevant: ${d.requestsPendingNoDelivery} sol·licituds actives sense entrega (${(pendingRatio * 100).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}% de les no cancel·lades).`,
    })
  }

  if (
    d.pctDeliveredVsRequested != null &&
    d.requestedUnitsInPeriod >= 8 &&
    d.pctDeliveredVsRequested < 75
  ) {
    signals.push({
      tone: 'attention',
      message: `Compliment d’unitats moderat o baix (${d.pctDeliveredVsRequested.toLocaleString('ca-ES', { maximumFractionDigits: 1 })}%): revisar estoc, preparació o entregues.`,
    })
  }

  if (d.totalRequests >= 5 && d.cancelledRequestsInPeriod / d.totalRequests > 0.2) {
    signals.push({
      tone: 'attention',
      message: `Cancel·lacions elevades (${((100 * d.cancelledRequestsInPeriod) / d.totalRequests).toLocaleString('ca-ES', { maximumFractionDigits: 0 })}% del volum): revisar procés o comunicació als sol·licitants.`,
    })
  }

  if (d.avgDaysToFirstDelivery != null && d.avgDaysToFirstDelivery > 10) {
    signals.push({
      tone: 'attention',
      message: `Temps fins a 1a entrega (${d.avgDaysToFirstDelivery.toLocaleString('ca-ES', { maximumFractionDigits: 1 })} dies de mitjana): definir o contrastar amb objectiu de servei.`,
    })
  }

  const hasHard =
    signals.some((s) => s.tone === 'critical') || signals.some((s) => s.tone === 'attention')

  if (!hasHard) {
    signals.push({
      tone: 'positive',
      message:
        'No es detecten alertes de control fortes en el període; seguiu monitoritzant backlog i incidències.',
    })
  }

  if (d.requestsPendingNoDelivery > 0 && !backlogFlagged) {
    signals.push({
      tone: 'neutral',
      message: `${d.requestsPendingNoDelivery} sol·licitud(s) sense entrega registrada (flux habitual si el cicle és llarg).`,
    })
  }

  return signals
}
