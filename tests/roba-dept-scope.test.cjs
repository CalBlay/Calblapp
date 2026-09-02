const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normDeptLabel,
  normDeptLabelsInRobaEquivalenceClass,
  departmentsInSameRobaScope,
  productDepartmentsVisibleToRobaLead,
  robaProductDepartmentTagsForFirestoreQuery,
} = require('../src/lib/roba-personal/deptScope')
const { ROBA_PRODUCT_DEPARTMENTS } = require('../src/data/departments')

test('normDeptLabel folds accents, case, and whitespace', () => {
  assert.equal(normDeptLabel('  Cuína  '), 'cuina')
  assert.equal(normDeptLabel(null), '')
  assert.equal(normDeptLabel(undefined), '')
})

test('Cuina and Cuina Central share roba scope (lead product visibility)', () => {
  assert.equal(departmentsInSameRobaScope('Cuina', 'Cuina Central'), true)
  assert.equal(departmentsInSameRobaScope('cuina central', 'Cuina'), true)
  assert.equal(departmentsInSameRobaScope('Serveis', 'Cuina'), false)
  assert.equal(departmentsInSameRobaScope('', 'Cuina'), false)
  assert.equal(departmentsInSameRobaScope('Logistica', 'Logística'), true)
})

test('normDeptLabelsInRobaEquivalenceClass expands cuina group and leaves others alone', () => {
  assert.deepEqual(
    normDeptLabelsInRobaEquivalenceClass('Cuina').sort(),
    ['cuina', 'cuina central'].sort()
  )
  assert.deepEqual(
    normDeptLabelsInRobaEquivalenceClass('Cuina Central').sort(),
    ['cuina', 'cuina central'].sort()
  )
  assert.deepEqual(normDeptLabelsInRobaEquivalenceClass('Serveis'), ['serveis'])
  assert.deepEqual(normDeptLabelsInRobaEquivalenceClass(''), [])
})

test('productDepartmentsVisibleToRobaLead treats empty tags as unrestricted', () => {
  assert.equal(productDepartmentsVisibleToRobaLead([], 'cuina'), true)
  assert.equal(productDepartmentsVisibleToRobaLead(null, 'cuina'), true)
  assert.equal(productDepartmentsVisibleToRobaLead(['Cuina Central'], 'Cuina'), true)
  assert.equal(productDepartmentsVisibleToRobaLead(['Serveis'], 'Cuina'), false)
  assert.equal(productDepartmentsVisibleToRobaLead(['Serveis'], ''), false)
})

test('robaProductDepartmentTagsForFirestoreQuery returns catalog literals not normalized labels', () => {
  const tags = robaProductDepartmentTagsForFirestoreQuery('Cuina')
  assert.deepEqual(tags, ['Cuina Central'])
  for (const tag of tags) {
    assert.ok(ROBA_PRODUCT_DEPARTMENTS.includes(tag), `expected catalog literal ${tag}`)
    assert.notEqual(tag, tag.toLowerCase(), 'must not return lowercased query labels')
  }

  assert.deepEqual(robaProductDepartmentTagsForFirestoreQuery('Serveis'), ['Serveis'])
  assert.deepEqual(robaProductDepartmentTagsForFirestoreQuery(''), [])
  assert.deepEqual(robaProductDepartmentTagsForFirestoreQuery('cuina central'), ['Cuina Central'])
})
