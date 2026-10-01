const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  additionalWorkDepartmentKeys,
  normalizeAdditionalWorkDepartments,
  worksInDepartment,
} = require('../src/lib/additionalWorkDepartments')

test('additional departments are canonical, unique and exclude the primary department', () => {
  assert.deepEqual(
    normalizeAdditionalWorkDepartments(
      ['serveis', 'Serveis', 'Logistica', 'Cuina'],
      'Logística'
    ),
    ['Cuina', 'Serveis']
  )
  assert.deepEqual(additionalWorkDepartmentKeys(['Serveis', 'Cuina'], 'Logistica'), [
    'cuina',
    'serveis',
  ])
})

test('worksInDepartment accepts the primary or any normalized additional department', () => {
  const person = {
    department: 'Logística',
    departmentLower: 'logistica',
    additionalWorkDepartments: ['Serveis'],
    additionalWorkDepartmentsLower: ['serveis'],
  }

  assert.equal(worksInDepartment(person, 'logistica'), true)
  assert.equal(worksInDepartment(person, 'Serveis'), true)
  assert.equal(worksInDepartment(person, 'Cuina'), false)
})

test('worksInDepartment supports old documents without normalized additional keys', () => {
  assert.equal(
    worksInDepartment(
      { department: 'Logistica', additionalWorkDepartments: ['Sérveis'] },
      'serveis'
    ),
    true
  )
  assert.equal(worksInDepartment({}, 'serveis'), false)
})
