const assert = require('node:assert/strict')
const { test } = require('node:test')

const { canAccessProjectsModule } = require('../src/lib/accessControl')
const {
  normalizeProjectDepartment,
  resolveUserProjectParticipation,
  userHasGlobalProjectListAccess,
  userParticipatesInProject,
} = require('../src/lib/projectParticipation')
const {
  canAccessBlockRoom,
  canAccessGeneralRoom,
  canManageProjectForRoom,
} = require('../src/lib/projectRoomAccess')
const {
  buildAutoGeneralRoom,
  buildGeneralRoomId,
  deriveGeneralRoomParticipants,
} = require('../src/lib/projectGeneralRoom')

test('canAccessProjectsModule denies workers, missing users, and explicit opt-out', () => {
  assert.equal(canAccessProjectsModule(), false)
  assert.equal(canAccessProjectsModule({ role: 'treballador', department: 'serveis' }), false)
  assert.equal(
    canAccessProjectsModule({ role: 'admin', opsProjectsConfigurable: false }),
    false
  )
  assert.equal(canAccessProjectsModule({ role: 'cap', department: 'serveis' }), true)
  assert.equal(canAccessProjectsModule({ role: 'usuari', department: 'logistica' }), true)
})

test('userHasGlobalProjectListAccess is admin/direccio only', () => {
  assert.equal(userHasGlobalProjectListAccess({ role: 'admin' }), true)
  assert.equal(userHasGlobalProjectListAccess({ role: 'Direcció' }), true)
  assert.equal(userHasGlobalProjectListAccess({ role: 'cap' }), false)
  assert.equal(userHasGlobalProjectListAccess({ role: 'usuari' }), false)
})

test('normalizeProjectDepartment folds accents and department aliases', () => {
  assert.equal(normalizeProjectDepartment('Dirección'), 'direccio')
  assert.equal(normalizeProjectDepartment('Marketing'), 'marqueting')
  assert.equal(normalizeProjectDepartment('Administración'), 'administracio')
  assert.equal(normalizeProjectDepartment('Cuina Central'), 'cuina central')
})

test('userParticipatesInProject matches owner, sponsor, block/task, and department aliases', () => {
  const project = {
    owner: 'Anna Owner',
    ownerUserId: 'u-owner',
    sponsor: 'Pep Sponsor',
    createdById: 'u-sponsor',
    departments: ['Marqueting'],
    blocks: [
      {
        owner: 'Bloc Cap',
        department: 'Serveis',
        tasks: [{ owner: 'Task Owner', department: 'Serveis', status: 'pending' }],
      },
    ],
  }

  assert.equal(userParticipatesInProject({ id: 'u-owner', name: 'X', role: 'usuari' }, project), true)
  assert.equal(
    userParticipatesInProject({ id: 'other', name: 'Anna Owner', role: 'usuari' }, project),
    true
  )
  assert.equal(
    userParticipatesInProject({ id: 'u-sponsor', name: 'X', role: 'usuari' }, project),
    true
  )
  assert.equal(
    userParticipatesInProject({ id: 'x', name: 'Bloc Cap', role: 'usuari' }, project),
    true
  )
  assert.equal(
    userParticipatesInProject({ id: 'x', name: 'Task Owner', role: 'usuari' }, project),
    true
  )
  assert.equal(
    userParticipatesInProject(
      { id: 'm1', name: 'Mkt', role: 'usuari', department: 'marketing' },
      project
    ),
    true
  )
  assert.equal(
    userParticipatesInProject(
      { id: 's1', name: 'Stranger', role: 'usuari', department: 'cuina' },
      project
    ),
    false
  )

  const summary = resolveUserProjectParticipation(
    { id: 'u-owner', name: 'Anna Owner', role: 'admin', department: 'marqueting' },
    project,
    { includeGlobalAccessLabel: true }
  )
  assert.equal(summary.primary, 'owner')
  assert.equal(summary.participates, true)
  assert.ok(summary.kinds.includes('department'))

  const outsiderAdmin = resolveUserProjectParticipation(
    { id: 'admin-2', name: 'Admin', role: 'admin', department: 'direccio' },
    { id: 'empty', owner: 'Other', blocks: [] },
    { includeGlobalAccessLabel: true }
  )
  assert.equal(outsiderAdmin.participates, false)
  assert.equal(outsiderAdmin.label, 'Visibilitat global')
})

test('room access grants managers and named participants; general rooms do not include task-only owners', () => {
  const project = { owner: 'Anna Owner', ownerUserId: 'u-owner', sponsor: 'Pep Sponsor', createdById: 'u-sp' }
  const block = { owner: 'Bloc Cap', tasks: [{ owner: 'Task Owner' }] }
  const room = { participants: ['Convidat'] }

  assert.equal(canManageProjectForRoom({ role: 'admin', name: 'X' }, project), true)
  assert.equal(canManageProjectForRoom({ id: 'u-owner', name: 'X', role: 'usuari' }, project), true)
  assert.equal(
    canManageProjectForRoom({ id: 'x', name: 'Pep Sponsor', role: 'usuari' }, project),
    true
  )
  assert.equal(canManageProjectForRoom({ id: 'x', name: 'Bloc Cap', role: 'usuari' }, project), false)

  assert.equal(
    canAccessGeneralRoom({ name: 'Bloc Cap', role: 'usuari' }, project, [block], room),
    true
  )
  assert.equal(
    canAccessGeneralRoom({ name: 'Convidat', role: 'usuari' }, project, [block], room),
    true
  )
  assert.equal(
    canAccessGeneralRoom({ name: 'Task Owner', role: 'usuari' }, project, [block], room),
    false
  )

  assert.equal(
    canAccessBlockRoom({ name: 'Task Owner', role: 'usuari' }, project, block, room),
    true
  )
  assert.equal(
    canAccessBlockRoom({ name: 'Stranger', role: 'usuari' }, project, block, room),
    false
  )
  assert.equal(canAccessBlockRoom({ name: 'Admin', role: 'admin' }, project, null, room), false)
})

test('deriveGeneralRoomParticipants and auto room keep unique owners/sponsors/block owners', () => {
  assert.equal(buildGeneralRoomId('abc'), 'room-general-abc')
  assert.deepEqual(
    deriveGeneralRoomParticipants({
      owner: 'Anna',
      sponsor: 'Anna',
      blocks: [{ owner: 'Bloc' }, { owner: '' }],
      extraParticipants: ['Convidat', 'Anna'],
    }),
    ['Anna', 'Bloc', 'Convidat']
  )

  const auto = buildAutoGeneralRoom(
    {
      owner: 'Anna',
      sponsor: 'Pep',
      departments: ['Serveis'],
      blocks: [{ owner: 'Bloc' }],
      rooms: [{ id: 'room-general-p1', notes: 'kept', participants: ['Extra'] }],
    },
    'p1'
  )
  assert.equal(auto.id, 'room-general-p1')
  assert.equal(auto.kind, 'general')
  assert.equal(auto.notes, 'kept')
  assert.deepEqual(auto.participants, ['Anna', 'Pep', 'Bloc', 'Extra'])
  assert.equal(buildAutoGeneralRoom({}, 'p1', 'room-other'), null)
})
