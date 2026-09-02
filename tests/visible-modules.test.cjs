const assert = require('node:assert/strict')
const { test } = require('node:test')

const { getVisibleModules, isMaintenanceWorkerSpacesBlocked } = require('../src/lib/accessControl')

const modulePaths = (user) => getVisibleModules(user).map((mod) => mod.path)
const submodulePaths = (user, modulePath) => {
  const mod = getVisibleModules(user).find((item) => item.path === modulePath)
  return (mod?.submodules || []).map((sub) => sub.path)
}

test('maintenance workers only see Fulls under Manteniment and cannot open Espais', () => {
  const worker = { role: 'treballador', department: 'manteniment' }
  assert.deepEqual(modulePaths(worker), ['/menu/manteniment'])
  assert.deepEqual(submodulePaths(worker, '/menu/manteniment'), [
    '/menu/manteniment/preventius/fulls',
  ])
  assert.equal(isMaintenanceWorkerSpacesBlocked(worker), true)
})

test('ticket-creator and Qualitat users only see the Tickets submodule', () => {
  assert.deepEqual(
    submodulePaths({ role: 'treballador', department: 'serveis' }, '/menu/manteniment'),
    ['/menu/manteniment/tickets']
  )
  assert.deepEqual(
    submodulePaths({ role: 'usuari', department: 'qualitat' }, '/menu/manteniment'),
    ['/menu/manteniment/tickets']
  )
  assert.deepEqual(
    submodulePaths({ role: 'treballador', department: 'cuina central' }, '/menu/manteniment'),
    ['/menu/manteniment/tickets']
  )
})

test('logistics inbox managers get tickets-only Manteniment and hide Incidències/Modificacions', () => {
  const logisticsUser = { role: 'usuari', department: 'logistica' }
  const paths = modulePaths(logisticsUser)
  assert.ok(paths.includes('/menu/manteniment'))
  assert.ok(!paths.includes('/menu/incidents'))
  assert.ok(!paths.includes('/menu/modifications'))
  assert.deepEqual(submodulePaths(logisticsUser, '/menu/manteniment'), [
    '/menu/manteniment/tickets',
  ])
})

test('allergens BBDD is limited to admin or Qualitat department', () => {
  assert.ok(
    submodulePaths({ role: 'admin', department: 'serveis' }, '/menu/allergens').includes(
      '/menu/allergens/bbdd'
    )
  )
  assert.ok(
    submodulePaths({ role: 'cap', department: 'qualitat' }, '/menu/allergens').includes(
      '/menu/allergens/bbdd'
    )
  )
  assert.ok(
    !submodulePaths({ role: 'direccio', department: 'serveis' }, '/menu/allergens').includes(
      '/menu/allergens/bbdd'
    )
  )
  assert.ok(
    !submodulePaths({ role: 'cap', department: 'cuina' }, '/menu/allergens').includes(
      '/menu/allergens/bbdd'
    )
  )
})

test('production workers only keep Incidències quadre/accions and Espais consulta tabs', () => {
  const worker = { role: 'treballador', department: 'produccio' }
  const paths = modulePaths(worker)
  assert.ok(paths.includes('/menu/incidents'))
  assert.ok(paths.includes('/menu/spaces'))
  assert.ok(!paths.includes('/menu/projects'))
  assert.deepEqual(submodulePaths(worker, '/menu/incidents').sort(), [
    '/menu/incidents/accions',
    '/menu/incidents/quadre',
  ])
  assert.deepEqual(submodulePaths(worker, '/menu/spaces').sort(), [
    '/menu/spaces/info',
    '/menu/spaces/reserves',
  ])
})

test('projects module is hidden when opsProjectsConfigurable is false', () => {
  assert.ok(modulePaths({ role: 'cap', department: 'serveis' }).includes('/menu/projects'))
  assert.ok(
    !modulePaths({ role: 'cap', department: 'serveis', opsProjectsConfigurable: false }).includes(
      '/menu/projects'
    )
  )
  assert.ok(!modulePaths({ role: 'treballador', department: 'serveis' }).includes('/menu/projects'))
})
