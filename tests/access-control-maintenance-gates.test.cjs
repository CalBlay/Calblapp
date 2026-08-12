const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeDept,
  canManageMaintenanceTickets,
  isLogisticsMaintenanceTicketsManager,
  isExternalMaintenanceTicketReporter,
  isQualitatCuinaCentralTicketViewer,
  canRequestMaintenancePersonnelByQuery,
  isMaintenanceWorkerSpacesBlocked,
  canEditFinca,
  canAccessProjectsModule,
} = require('../src/lib/accessControl')

test('normalizeDept folds accents and foodlovers aliases', () => {
  assert.equal(normalizeDept('  Logística  '), 'logistica')
  assert.equal(normalizeDept('Food Lover'), 'foodlovers')
  assert.equal(normalizeDept('foodlovers'), 'foodlovers')
  assert.equal(normalizeDept(null), '')
})

test('canManageMaintenanceTickets is admin/direccio or cap of manteniment/logistica', () => {
  assert.equal(canManageMaintenanceTickets({ role: 'admin', department: 'serveis' }), true)
  assert.equal(canManageMaintenanceTickets({ role: 'direccio', department: 'cuina' }), true)
  assert.equal(canManageMaintenanceTickets({ role: 'cap', department: 'manteniment' }), true)
  assert.equal(canManageMaintenanceTickets({ role: 'cap', department: 'logistica' }), true)
  assert.equal(canManageMaintenanceTickets({ role: 'cap', department: 'serveis' }), false)
  assert.equal(canManageMaintenanceTickets({ role: 'usuari', department: 'logistica' }), false)
  assert.equal(canManageMaintenanceTickets(undefined), false)
})

test('logistics inbox manager vs external reporter vs qualitat viewer are mutually exclusive', () => {
  const logisticsUsuari = { role: 'usuari', department: 'logistica' }
  const serveisWorker = { role: 'treballador', department: 'serveis' }
  const qualitatUsuari = { role: 'usuari', department: 'qualitat' }
  const maintCap = { role: 'cap', department: 'manteniment' }

  assert.equal(isLogisticsMaintenanceTicketsManager(logisticsUsuari), true)
  assert.equal(isExternalMaintenanceTicketReporter(logisticsUsuari), false)
  assert.equal(isQualitatCuinaCentralTicketViewer(logisticsUsuari), false)

  assert.equal(isExternalMaintenanceTicketReporter(serveisWorker), true)
  assert.equal(isLogisticsMaintenanceTicketsManager(serveisWorker), false)
  assert.equal(isQualitatCuinaCentralTicketViewer(serveisWorker), false)

  assert.equal(isQualitatCuinaCentralTicketViewer(qualitatUsuari), true)
  assert.equal(isExternalMaintenanceTicketReporter(qualitatUsuari), true)
  assert.equal(canManageMaintenanceTickets(qualitatUsuari), false)

  assert.equal(isExternalMaintenanceTicketReporter(maintCap), false)
  assert.equal(isQualitatCuinaCentralTicketViewer(maintCap), false)
})

test('canRequestMaintenancePersonnelByQuery allows only logistics/manteniment/total caps', () => {
  assert.equal(
    canRequestMaintenancePersonnelByQuery({ role: 'cap', department: 'logistica' }),
    true
  )
  assert.equal(
    canRequestMaintenancePersonnelByQuery({ role: 'cap', department: 'manteniment' }),
    true
  )
  assert.equal(
    canRequestMaintenancePersonnelByQuery({ role: 'cap', department: 'total' }),
    true
  )
  assert.equal(
    canRequestMaintenancePersonnelByQuery({ role: 'cap', department: 'serveis' }),
    false
  )
  assert.equal(
    canRequestMaintenancePersonnelByQuery({ role: 'admin', department: 'manteniment' }),
    false
  )
})

test('spaces block and finca/project gates cover high-blast edge cases', () => {
  assert.equal(
    isMaintenanceWorkerSpacesBlocked({ role: 'treballador', department: 'manteniment' }),
    true
  )
  assert.equal(
    isMaintenanceWorkerSpacesBlocked({ role: 'treballador', department: 'serveis' }),
    false
  )

  assert.equal(canEditFinca({ role: 'comercial', department: 'serveis' }), true)
  assert.equal(canEditFinca({ role: 'cap', department: 'empresa' }), true)
  assert.equal(canEditFinca({ role: 'cap', department: 'foodlovers' }), true)
  assert.equal(canEditFinca({ role: 'cap', department: 'logistica' }), false)
  assert.equal(canEditFinca({ role: 'treballador', department: 'produccio' }), true)

  assert.equal(canAccessProjectsModule({ role: 'usuari', department: 'serveis' }), true)
  assert.equal(
    canAccessProjectsModule({
      role: 'usuari',
      department: 'serveis',
      opsProjectsConfigurable: false,
    }),
    false
  )
  assert.equal(canAccessProjectsModule(null), false)
})
