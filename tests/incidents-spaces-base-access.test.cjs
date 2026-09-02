const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  INCIDENTS_ACTION,
  incidentsActionBaseAccess,
} = require('../src/lib/incidentsPermissions')
const {
  baseCanDeleteSpacesBbdd,
  baseCanEditSpacesPremisses,
  baseCanMutateSpacesBbdd,
  isSpacesBbddActionPath,
  SPACES_BBDD_PATH,
  SPACES_UI_PATH,
} = require('../src/lib/spacesPermissions')
const { canEditFinca } = require('../src/lib/accessControl')

const editorOpts = {
  canViewIncidents: true,
  canEditIncidents: true,
  canViewQuadrePath: false,
}
const viewerOpts = {
  canViewIncidents: true,
  canEditIncidents: false,
  canViewQuadrePath: false,
}

test('incidentsActionBaseAccess: meeting minutes need edit; other actions also allow production workers on quadre', () => {
  const cap = { role: 'cap', department: 'produccio' }
  const productionWorker = { role: 'treballador', department: 'producció' }
  const serveisWorker = { role: 'treballador', department: 'serveis' }

  assert.equal(
    incidentsActionBaseAccess(cap, editorOpts, INCIDENTS_ACTION.MEETING_MINUTES),
    true
  )
  assert.equal(
    incidentsActionBaseAccess(productionWorker, viewerOpts, INCIDENTS_ACTION.MEETING_MINUTES),
    false
  )
  assert.equal(
    incidentsActionBaseAccess(
      productionWorker,
      { ...viewerOpts, canViewQuadrePath: true },
      INCIDENTS_ACTION.MEETING_MINUTES
    ),
    false
  )
  assert.equal(
    incidentsActionBaseAccess(
      productionWorker,
      { ...viewerOpts, canViewQuadrePath: true },
      INCIDENTS_ACTION.COMMAND_BOARD
    ),
    true
  )
  assert.equal(
    incidentsActionBaseAccess(
      serveisWorker,
      { ...viewerOpts, canViewQuadrePath: true },
      INCIDENTS_ACTION.COMMAND_BOARD
    ),
    false
  )
})

test('spaces BBDD delete is admin or cap producció; mutate follows finca edit; premisses is admin-only', () => {
  assert.equal(baseCanDeleteSpacesBbdd({ role: 'admin' }), true)
  assert.equal(baseCanDeleteSpacesBbdd({ role: 'cap', department: 'produccio' }), true)
  assert.equal(baseCanDeleteSpacesBbdd({ role: 'treballador', department: 'produccio' }), false)
  assert.equal(baseCanDeleteSpacesBbdd({ role: 'cap', department: 'cuina' }), false)
  assert.equal(baseCanDeleteSpacesBbdd(undefined), false)

  assert.equal(baseCanEditSpacesPremisses({ role: 'admin' }), true)
  assert.equal(baseCanEditSpacesPremisses({ role: 'direccio' }), false)
  assert.equal(baseCanEditSpacesPremisses({ role: 'cap', department: 'produccio' }), false)

  assert.equal(baseCanMutateSpacesBbdd({ role: 'comercial' }), true)
  assert.equal(baseCanMutateSpacesBbdd({ role: 'cap', department: 'foodlovers' }), true)
  // canEditFinca does not collapse "Food Lover" the way module visibility does.
  assert.equal(baseCanMutateSpacesBbdd({ role: 'cap', department: 'Food Lover' }), false)
  assert.equal(baseCanMutateSpacesBbdd({ role: 'cap', department: 'cuina' }), false)
  assert.equal(canEditFinca({ role: 'treballador', department: 'produccio' }), true)

  assert.equal(isSpacesBbddActionPath(SPACES_BBDD_PATH), true)
  assert.equal(isSpacesBbddActionPath(SPACES_UI_PATH), true)
  assert.equal(isSpacesBbddActionPath('/menu/spaces/reserves'), false)
})
