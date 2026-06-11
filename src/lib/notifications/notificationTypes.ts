export const TORN_NOTIFICATION_TYPES = ['torn', 'NEW_SHIFTS'] as const

export const PROJECT_NOTIFICATION_TYPES = [
  'project_assignment',
  'project_block_assignment',
  'project_task_assignment',
] as const

export const LOGISTICS_NOTIFICATION_TYPES = [
  'commercial_vehicle_request',
  'commercial_vehicle_validation',
] as const

export const MAINTENANCE_NOTIFICATION_TYPES = [
  'maintenance_ticket_new',
  'maintenance_ticket_assigned',
  'maintenance_ticket_validated',
  'maintenance_ticket_stale',
  'maintenance_ticket_external_stale',
] as const

export const INCIDENT_NOTIFICATION_TYPES = ['incident_marketing_9xx_new'] as const
