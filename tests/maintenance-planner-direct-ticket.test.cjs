const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('the maintenance planner exposes direct internal ticket creation only to ticket managers', () => {
  const page = read('src/app/menu/manteniment/preventius/planificador/page.tsx')
  const modal = read(
    'src/app/menu/manteniment/preventius/planificador/components/CreatePlannerTicketModal.tsx'
  )

  assert.match(page, /canCreateDirectTicket[\s\S]*canManagePlannerTickets/)
  assert.match(page, /Crear ticket intern/)
  assert.match(modal, /creationMode: 'planner_direct'/)
  assert.match(modal, /assignedToIds:/)
  assert.match(modal, /plannedStart,/)
  assert.match(modal, /plannedEnd,/)
})

test('direct planner tickets are authorized server-side and born assigned outside the inbox', () => {
  const route = read('src/app/api/maintenance/tickets/route.ts')

  assert.match(route, /isPlannerDirect && !\(await canManageAllMaintenanceTickets\(user\)\)/)
  assert.match(route, /status = isPlannerDirect \? 'assignat'/)
  assert.match(route, /isPlannerDirect\s*\? 'planned_internal'/)
  assert.match(route, /source = isPlannerDirect \? 'planner_direct'/)
  assert.match(route, /isPlannerDirect\s*\? 'maintenance_internal'/)
  assert.match(route, /findMaintenancePlanningConflict/)
  assert.match(route, /status: 409/)
  assert.match(route, /notifyMaintenanceAssignees/)
})

test('planned internal tickets remain visible in ticket buckets and maintenance reports', () => {
  const ticketsHook = read('src/app/menu/manteniment/tickets/useMaintenanceTickets.ts')
  const reports = read('src/lib/informes/buildMaintenanceOverview.ts')

  assert.match(ticketsHook, /ticket\.workflowStage === 'planned_internal'[\s\S]*return 'planned'/)
  assert.match(reports, /db\.collection\('maintenanceTickets'\)\.get\(\)/)
  assert.match(reports, /originalWorkerIds: assigneeIds/)
  assert.match(reports, /workerNames: assigneeNames/)
})
