export type RobaRequestTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

export type RobaRequestExperience = {
  label: string
  nextAction: string
  step: number
  totalSteps: number
  tone: RobaRequestTone
  closed: boolean
}

const TOTAL_STEPS = 4

/**
 * User-facing interpretation of the internal workflow status.
 * Keeping it in one place prevents each view from explaining the same state differently.
 */
export function getRobaRequestExperience(status: string): RobaRequestExperience {
  switch (status) {
    case 'submitted':
      return {
        label: 'Sol·licitud enviada',
        nextAction: 'El teu responsable la revisarà abans d’enviar-la a RRHH.',
        step: 1,
        totalSteps: TOTAL_STEPS,
        tone: 'info',
        closed: false,
      }
    case 'sent_to_rrhh':
      return {
        label: 'En revisió de RRHH',
        nextAction: 'RRHH està comprovant disponibilitat i preparant el material.',
        step: 2,
        totalSteps: TOTAL_STEPS,
        tone: 'info',
        closed: false,
      }
    case 'prepared':
      return {
        label: 'Preparada per al responsable',
        nextAction: 'El responsable del departament ha de validar i recollir la preparació.',
        step: 3,
        totalSteps: TOTAL_STEPS,
        tone: 'warning',
        closed: false,
      }
    case 'ready_for_worker_delivery':
    case 'picked_up':
      return {
        label: 'A punt per entregar-te',
        nextAction: 'El teu responsable ja té el material. Quan te’l lliuri, confirma la recepció.',
        step: 3,
        totalSteps: TOTAL_STEPS,
        tone: 'warning',
        closed: false,
      }
    case 'fulfilled':
      return {
        label: 'Pendent de confirmació',
        nextAction: 'Revisa el material rebut i confirma que les quantitats són correctes.',
        step: 4,
        totalSteps: TOTAL_STEPS,
        tone: 'warning',
        closed: false,
      }
    case 'receipt_confirmed':
      return {
        label: 'Recepció confirmada',
        nextAction: 'Procés completat. No cal fer cap altra acció.',
        step: 4,
        totalSteps: TOTAL_STEPS,
        tone: 'success',
        closed: true,
      }
    case 'cancelled':
      return {
        label: 'Cancel·lada',
        nextAction: 'Aquesta sol·licitud ja no està activa.',
        step: 0,
        totalSteps: TOTAL_STEPS,
        tone: 'neutral',
        closed: true,
      }
    case 'rejected':
      return {
        label: 'No aprovada',
        nextAction: 'Consulta el motiu indicat o crea una nova sol·licitud si cal.',
        step: 0,
        totalSteps: TOTAL_STEPS,
        tone: 'danger',
        closed: true,
      }
    default:
      return {
        label: 'En gestió',
        nextAction: 'Consulta els detalls de la sol·licitud per veure’n l’estat.',
        step: 1,
        totalSteps: TOTAL_STEPS,
        tone: 'neutral',
        closed: false,
      }
  }
}

export function getRobaOperationalNextAction(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Revisar i enviar a RRHH'
    case 'sent_to_rrhh':
      return 'Preparar el material'
    case 'prepared':
      return 'Validar la recollida'
    case 'ready_for_worker_delivery':
    case 'picked_up':
      return 'Registrar l’entrega al treballador'
    case 'fulfilled':
      return 'Esperar la confirmació del treballador'
    case 'receipt_confirmed':
      return 'Procés completat'
    case 'cancelled':
    case 'rejected':
      return 'Sense accions pendents'
    default:
      return 'Revisar la sol·licitud'
  }
}
