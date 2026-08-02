const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canCreateMaintenanceTicketsAsReporter,
  canCreateMaintenanceTicketWithUiAccess,
  isMaintenanceTicketCreatorOnlyUser,
} = require('../src/lib/maintenanceTicketCreators')

test('treballador reporters can create with view but not edit (fred regression)', () => {
  const serveisWorker = { role: 'treballador', department: 'serveis' }
  const cuinaWorker = { role: 'treballador', department: 'cuina central' }
  const qualitatWorker = { role: 'treballador', department: 'qualitat' }

  for (const user of [serveisWorker, cuinaWorker, qualitatWorker]) {
    assert.equal(canCreateMaintenanceTicketsAsReporter(user), true)
    assert.equal(
      canCreateMaintenanceTicketWithUiAccess({
        user,
        canEditTicketsPath: false,
        canViewTicketsPath: true,
      }),
      true,
      `expected create for ${user.department}`
    )
  }
})

test('view-only non-reporters cannot create tickets via API', () => {
  const logisticsViewer = { role: 'treballador', department: 'logistica' }
  assert.equal(canCreateMaintenanceTicketsAsReporter(logisticsViewer), false)
  assert.equal(
    canCreateMaintenanceTicketWithUiAccess({
      user: logisticsViewer,
      canEditTicketsPath: false,
      canViewTicketsPath: true,
    }),
    false
  )
})

test('path editors can create even when not reporters', () => {
  const maintUser = { role: 'usuari', department: 'manteniment' }
  assert.equal(canCreateMaintenanceTicketsAsReporter(maintUser), false)
  assert.equal(
    canCreateMaintenanceTicketWithUiAccess({
      user: maintUser,
      canEditTicketsPath: true,
      canViewTicketsPath: true,
    }),
    true
  )
})

test('creator-only scope excludes Qualitat (deep-link / assign UI)', () => {
  assert.equal(
    isMaintenanceTicketCreatorOnlyUser({ role: 'treballador', department: 'serveis' }),
    true
  )
  assert.equal(
    isMaintenanceTicketCreatorOnlyUser({ role: 'usuari', department: 'qualitat' }),
    false
  )
  assert.equal(
    isMaintenanceTicketCreatorOnlyUser({ role: 'treballador', department: 'qualitat' }),
    false
  )
})
