const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')

test('assignment notifications are only emitted when assignees actually change', () => {
  const route = readFileSync(
    join(root, 'src/app/api/maintenance/tickets/[id]/route.ts'),
    'utf8'
  )

  assert.match(route, /if \(assigneesChanged && nextAssignedIds\.length > 0\)/)
  assert.match(route, /if \(assigneesChanged\) \{\s*updates\.assignedAt/)
  assert.match(route, /uids: nextAssignedIds/)
  assert.doesNotMatch(
    route,
    /if \(body\.assignedToIds !== undefined && body\.assignedToIds\.length > 0\)/
  )
})

test('creator assignment notifications deep-link to the ticket inbox', () => {
  const route = readFileSync(
    join(root, 'src/app/api/maintenance/tickets/[id]/route.ts'),
    'utf8'
  )
  const bell = readFileSync(
    join(root, 'src/app/menu/manteniment/components/MaintenanceNotificationsBell.tsx'),
    'utf8'
  )

  assert.match(route, /`\/menu\/manteniment\/tickets\?ticketId=\$\{encodeURIComponent\(id\)\}`/)
  assert.match(bell, /explicitTicketBasePath/)
  assert.match(bell, /query\.forEach\(\(value, key\) => explicitParams\.set\(key, value\)\)/)
})

test('ticket links focus and expand the requested ticket details', () => {
  const page = readFileSync(join(root, 'src/app/menu/manteniment/tickets/page.tsx'), 'utf8')
  const list = readFileSync(
    join(root, 'src/app/menu/manteniment/tickets/components/TicketsList.tsx'),
    'utf8'
  )

  assert.match(page, /focusedTicketId=\{queryTicketId \|\| undefined\}/)
  assert.match(list, /setExpandedId\(focusedTicketId\)/)
  assert.match(list, /Operaris assignats/)
  assert.match(list, /Dia i hora previstos/)
})
