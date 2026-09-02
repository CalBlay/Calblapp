const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  CUINA_CENTRAL_TICKET_LOCATION,
  CUINA_CENTRAL_TICKET_ROUTING,
  cuinaCentralMachineToTicketItem,
  machineLabel,
  mergeTicketMachines,
} = require('../src/lib/cuina-central/maintenanceTicket')

const machine = (overrides = {}) => ({
  id: 'm1',
  code: 'CC-01',
  name: 'Cutter',
  location: '',
  zone: '',
  mapX: null,
  mapY: null,
  active: true,
  customFields: {},
  createdAt: null,
  updatedAt: null,
  ...overrides,
})

test('machineLabel joins trimmed code and name, or whichever side is present', () => {
  assert.equal(machineLabel({ code: ' CC-01 ', name: ' Cutter ' }), 'CC-01 · Cutter')
  assert.equal(machineLabel({ code: 'CC-01', name: '  ' }), 'CC-01')
  assert.equal(machineLabel({ code: '', name: 'Cutter' }), 'Cutter')
  assert.equal(machineLabel({ code: '  ', name: '' }), '')
})

test('cuinaCentralMachineToTicketItem defaults location to Cuina Central', () => {
  assert.deepEqual(cuinaCentralMachineToTicketItem(machine()), {
    code: 'CC-01',
    name: 'Cutter',
    label: 'CC-01 · Cutter',
    location: CUINA_CENTRAL_TICKET_LOCATION,
  })
  assert.equal(
    cuinaCentralMachineToTicketItem(machine({ location: '  Zona freda  ' })).location,
    'Zona freda'
  )
  assert.deepEqual(CUINA_CENTRAL_TICKET_ROUTING, {
    source: 'manual_cuina_central',
    intakeChannel: 'manual_cuina_central',
    workflowStage: 'planner_queue',
  })
})

test('mergeTicketMachines overwrites same-label maintenance rows and drops unlabeled items', () => {
  const merged = mergeTicketMachines(
    [
      { code: 'OLD', name: 'Cutter', label: 'CC-01 · Cutter', location: 'Taller' },
      { code: 'SKIP', name: 'No label', label: '  ', location: 'Taller' },
      { code: 'BETA', name: 'Beta', label: 'Beta', location: 'Taller' },
    ],
    [
      machine({ code: 'CC-01', name: 'Cutter', location: 'Zona freda' }),
      machine({ id: 'm2', code: 'AA-09', name: 'Alpha' }),
      machine({ id: 'm3', code: '', name: '' }),
    ]
  )

  assert.deepEqual(
    merged.map((item) => item.label),
    ['AA-09 · Alpha', 'Beta', 'CC-01 · Cutter']
  )
  const cutter = merged.find((item) => item.label === 'CC-01 · Cutter')
  assert.equal(cutter.location, 'Zona freda')
  assert.equal(cutter.code, 'CC-01')
})
