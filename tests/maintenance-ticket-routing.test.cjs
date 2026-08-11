const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  matchesMaintenanceTicketLocation,
  resolveDefaultTicketLocationFromUserName,
  resolveDefaultTicketCenterFromUserName,
  resolveManualTicketRouting,
  getMaintenanceTicketScope,
  getExternalReporterTicketBucket,
  matchesMaintenanceTicketScope,
  requiresMaintenanceTicketWorkerName,
} = require('../src/lib/maintenanceTicketCreators')

test('matchesMaintenanceTicketLocation uses compact exact match only', () => {
  assert.equal(matchesMaintenanceTicketLocation('Nàutic', 'Nautic'), true)
  assert.equal(matchesMaintenanceTicketLocation('Restaurant Nàutic', 'Nàutic'), true)
  assert.equal(matchesMaintenanceTicketLocation('Can Blay', 'Can Blay Restaurant'), false)
  assert.equal(matchesMaintenanceTicketLocation('', 'Nàutic'), false)
  assert.equal(matchesMaintenanceTicketLocation('Nàutic', null), false)
})

test('resolveDefaultTicketLocationFromUserName matches catalog then OPS fallback', () => {
  const locations = ['Clos la Plana', 'Nàutic', 'Mirador Events']
  assert.equal(resolveDefaultTicketLocationFromUserName('NAUTIC', locations), 'Nàutic')
  assert.equal(resolveDefaultTicketLocationFromUserName('clos la plana', locations), 'Clos la Plana')
  assert.equal(resolveDefaultTicketLocationFromUserName('Camp Nou', locations), 'Camp Nou')
  assert.equal(resolveDefaultTicketLocationFromUserName('', locations), null)
  assert.equal(resolveDefaultTicketLocationFromUserName('NAUTIC', []), null)
})

test('resolveDefaultTicketCenterFromUserName requires exact center catalog name', () => {
  const centers = ['Can Blay', 'Clos la Plana']
  assert.equal(resolveDefaultTicketCenterFromUserName('can blay', centers), 'Can Blay')
  assert.equal(resolveDefaultTicketCenterFromUserName('Can', centers), null)
  assert.equal(resolveDefaultTicketCenterFromUserName('NAUTIC', centers), null)
})

test('resolveManualTicketRouting sends Cuina/Qualitat to planner and restaurants to inbox', () => {
  assert.deepEqual(
    resolveManualTicketRouting({ department: 'cuina central', location: 'Cuina Central' }),
    {
      source: 'manual_cuina_central',
      intakeChannel: 'manual_cuina_central',
      workflowStage: 'planner_queue',
    }
  )
  assert.deepEqual(
    resolveManualTicketRouting({ department: 'qualitat', location: 'Qualitat' }),
    {
      source: 'manual_cuina_central',
      intakeChannel: 'manual_cuina_central',
      workflowStage: 'planner_queue',
    }
  )
  assert.deepEqual(
    resolveManualTicketRouting({ department: 'serveis', location: 'Nàutic' }),
    {
      source: 'manual',
      intakeChannel: 'restaurant',
      workflowStage: 'tickets_inbox',
    }
  )
  assert.deepEqual(
    resolveManualTicketRouting({ department: 'manteniment', location: 'Clos la Plana' }),
    {
      source: 'manual',
      intakeChannel: 'manual_tickets',
      workflowStage: 'tickets_inbox',
    }
  )
})

test('getMaintenanceTicketScope classifies cuina, restaurant OPS, and centres', () => {
  assert.equal(
    getMaintenanceTicketScope({ location: 'Cuina Central' }),
    'cuina_central'
  )
  assert.equal(
    getMaintenanceTicketScope({ source: 'manual_cuina_central' }),
    'cuina_central'
  )
  assert.equal(
    getMaintenanceTicketScope({ intakeChannel: 'restaurant' }),
    'restaurants'
  )
  assert.equal(
    getMaintenanceTicketScope({ location: 'Nàutic' }),
    'restaurants'
  )
  assert.equal(
    getMaintenanceTicketScope({ location: 'Clos la Plana' }),
    'centres_propis'
  )
  assert.equal(matchesMaintenanceTicketScope({ location: 'Nàutic' }, 'restaurants'), true)
  assert.equal(matchesMaintenanceTicketScope({ location: 'Nàutic' }, 'cuina_central'), false)
  assert.equal(matchesMaintenanceTicketScope({ location: 'Nàutic' }, '__all__'), true)
})

test('getExternalReporterTicketBucket groups statuses and prefers externalized', () => {
  assert.equal(getExternalReporterTicketBucket({ status: 'nou' }), 'nou')
  assert.equal(getExternalReporterTicketBucket({ status: 'no_fet' }), 'nou')
  assert.equal(getExternalReporterTicketBucket({ status: 'reassignat' }), 'nou')
  assert.equal(getExternalReporterTicketBucket({ status: 'assignat' }), 'assignat')
  assert.equal(getExternalReporterTicketBucket({ status: 'en_curs' }), 'assignat')
  assert.equal(getExternalReporterTicketBucket({ status: 'espera' }), 'assignat')
  assert.equal(getExternalReporterTicketBucket({ status: 'fet' }), 'fet')
  assert.equal(getExternalReporterTicketBucket({ status: 'validat' }), 'fet')
  assert.equal(
    getExternalReporterTicketBucket({ status: 'en_curs', externalized: true }),
    'externalitzat'
  )
})

test('requiresMaintenanceTicketWorkerName for restaurant/cuina/qualitat reporters', () => {
  assert.equal(
    requiresMaintenanceTicketWorkerName({ department: 'serveis', location: 'Nàutic' }),
    true
  )
  assert.equal(
    requiresMaintenanceTicketWorkerName({
      department: 'cuina central',
      location: 'Cuina Central',
    }),
    true
  )
  assert.equal(
    requiresMaintenanceTicketWorkerName({ department: 'qualitat', location: 'X' }),
    true
  )
  assert.equal(
    requiresMaintenanceTicketWorkerName({ department: 'manteniment', location: '' }),
    false
  )
})
