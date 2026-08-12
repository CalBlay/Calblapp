const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  INCIDENT_ORIGIN_DEPARTMENTS,
  capDepartmentMatchesIncidentOrigin,
} = require('../src/lib/incidentOriginDepartments')

test('INCIDENT_ORIGIN_DEPARTMENTS keeps operational order', () => {
  assert.deepEqual([...INCIDENT_ORIGIN_DEPARTMENTS], [
    'Serveis',
    'Cuina',
    'Logistica',
    'Comercial',
    'Produccio',
    'Deco',
  ])
})

test('capDepartmentMatchesIncidentOrigin accepts aliases for comercial and deco', () => {
  assert.equal(capDepartmentMatchesIncidentOrigin('Comercial', 'Empresa'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Comercial', 'Casaments'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Comercial', 'Food Lovers'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Comercial', 'Serveis'), false)

  assert.equal(capDepartmentMatchesIncidentOrigin('Deco', 'Decoració'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Deco', 'Decoracions'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Deco', 'Cuina'), false)
})

test('capDepartmentMatchesIncidentOrigin maps legacy Sala to Serveis caps', () => {
  assert.equal(capDepartmentMatchesIncidentOrigin('Sala', 'Serveis'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Sala', 'Sala'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Sala', 'Cuina'), false)
})

test('capDepartmentMatchesIncidentOrigin is exact for single-alias origins', () => {
  assert.equal(capDepartmentMatchesIncidentOrigin('Cuina', 'Cuina'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Cuina', 'Cuina Central'), false)
  assert.equal(capDepartmentMatchesIncidentOrigin('Logistica', 'Logística'), true)
  assert.equal(capDepartmentMatchesIncidentOrigin('Serveis', 'Produccio'), false)
})
