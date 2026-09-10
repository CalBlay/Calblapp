const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  mapUserDeptToCostDept,
  canChooseCostDepartment,
  resolveCostDepartmentFilter,
  costDepartmentSelectOptions,
} = require('../src/lib/costServeis/access')
const { getVisibleModules } = require('../src/lib/accessControl')

const costServeisSubpaths = (user) => {
  const mod = getVisibleModules(user).find((item) => item.path === '/menu/cost-serveis')
  return (mod?.submodules || []).map((sub) => sub.path)
}

test('mapUserDeptToCostDept folds logistics/transports and cuina aliases', () => {
  assert.equal(mapUserDeptToCostDept('Logística'), 'logistica')
  assert.equal(mapUserDeptToCostDept('transports'), 'logistica')
  assert.equal(mapUserDeptToCostDept('Serveis'), 'serveis')
  assert.equal(mapUserDeptToCostDept('cuina'), 'cuina')
  assert.equal(mapUserDeptToCostDept('Cuina Central'), 'cuina')
  assert.equal(mapUserDeptToCostDept('cuina  central'), 'cuina')
  assert.equal(mapUserDeptToCostDept('manteniment'), null)
  assert.equal(mapUserDeptToCostDept(''), null)
  assert.equal(mapUserDeptToCostDept(null), null)
})

test('canChooseCostDepartment is admin, direcció, or company-wide dept only', () => {
  assert.equal(canChooseCostDepartment('admin', 'logistica'), true)
  assert.equal(canChooseCostDepartment('Direcció', 'cuina'), true)
  assert.equal(canChooseCostDepartment('cap', 'empresa'), true)
  assert.equal(canChooseCostDepartment('cap', 'total'), true)
  assert.equal(canChooseCostDepartment('treballador', 'direccio'), true)
  assert.equal(canChooseCostDepartment('cap', 'logistica'), false)
  assert.equal(canChooseCostDepartment('cap', 'cuina'), false)
  assert.equal(canChooseCostDepartment('comercial', 'empresa'), true)
  assert.equal(canChooseCostDepartment('comercial', 'logistica'), false)
  assert.equal(canChooseCostDepartment(null, 'logistica'), false)
})

test('resolveCostDepartmentFilter locks non-choosers to their mapped dept', () => {
  assert.equal(
    resolveCostDepartmentFilter({
      role: 'cap',
      department: 'cuina',
      requested: 'logistica',
    }),
    'cuina'
  )
  assert.equal(
    resolveCostDepartmentFilter({
      role: 'cap',
      department: 'transports',
      requested: 'all',
    }),
    'logistica'
  )
  assert.equal(
    resolveCostDepartmentFilter({
      role: 'cap',
      department: 'manteniment',
      requested: 'serveis',
    }),
    'logistica'
  )
})

test('resolveCostDepartmentFilter lets choosers pick a known dept or fall back to all', () => {
  assert.equal(
    resolveCostDepartmentFilter({ role: 'admin', department: 'logistica', requested: 'Serveis' }),
    'serveis'
  )
  assert.equal(
    resolveCostDepartmentFilter({ role: 'admin', department: 'logistica', requested: 'all' }),
    'all'
  )
  assert.equal(
    resolveCostDepartmentFilter({ role: 'admin', department: 'logistica', requested: '' }),
    'all'
  )
  assert.equal(
    resolveCostDepartmentFilter({ role: 'admin', department: 'logistica', requested: 'rrhh' }),
    'all'
  )
  assert.equal(
    resolveCostDepartmentFilter({ role: 'cap', department: 'empresa', requested: 'cuina' }),
    'cuina'
  )
})

test('costDepartmentSelectOptions prepends Tots only when includeAll is set', () => {
  const withAll = costDepartmentSelectOptions(true)
  assert.equal(withAll[0].value, 'all')
  assert.deepEqual(
    withAll.slice(1).map((opt) => opt.value),
    ['logistica', 'serveis', 'cuina']
  )
  assert.deepEqual(
    costDepartmentSelectOptions(false).map((opt) => opt.value),
    ['logistica', 'serveis', 'cuina']
  )
})

test('Cost de serveis menu is limited by role and department', () => {
  assert.deepEqual(costServeisSubpaths({ role: 'admin', department: 'produccio' }), [
    '/menu/cost-serveis/configuracio',
    '/menu/cost-serveis/costos-estructura',
    '/menu/cost-serveis/edicio',
    '/menu/cost-serveis/resultats',
  ])
  assert.deepEqual(costServeisSubpaths({ role: 'cap', department: 'Logística' }), [
    '/menu/cost-serveis/costos-estructura',
    '/menu/cost-serveis/edicio',
    '/menu/cost-serveis/resultats',
  ])
  assert.deepEqual(costServeisSubpaths({ role: 'comercial', department: 'cuina' }), [
    '/menu/cost-serveis/resultats',
  ])
  assert.deepEqual(costServeisSubpaths({ role: 'treballador', department: 'logistica' }), [])
  assert.deepEqual(costServeisSubpaths({ role: 'cap', department: 'manteniment' }), [])
  assert.deepEqual(costServeisSubpaths({ role: 'cap', department: 'transports' }), [])
})
