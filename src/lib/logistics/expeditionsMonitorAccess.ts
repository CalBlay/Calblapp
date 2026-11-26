export const EXPEDITIONS_MONITOR_USER_ID = 'iD7OMe2lG6Oi68xHbXc9'

export function isExpeditionsMonitorUser(userId?: string | null): boolean {
  return String(userId || '').trim() === EXPEDITIONS_MONITOR_USER_ID
}
