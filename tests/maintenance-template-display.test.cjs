const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  resolveMaintenanceTemplateName,
  displayMaintenanceTemplateName,
} = require('../src/lib/maintenanceTemplateDisplay')

test('resolveMaintenanceTemplateName prefers legacy name keys in priority order', () => {
  assert.equal(
    resolveMaintenanceTemplateName({ name: '  A  ', Name: 'B', nom: 'C' }, 'id1', []),
    'A'
  )
  assert.equal(
    resolveMaintenanceTemplateName({ Name: 'B', title: 'T' }, 'id1', []),
    'B'
  )
  assert.equal(
    resolveMaintenanceTemplateName({ Label: 'L' }, 'id1', []),
    'L'
  )
})

test('resolveMaintenanceTemplateName falls back to first section item label then short id', () => {
  assert.equal(
    resolveMaintenanceTemplateName(
      {},
      'doc-1',
      [
        { location: 'Sala', items: [{ label: '  ' }, { label: 'Revisió filtres' }] },
      ]
    ),
    'Revisió filtres'
  )

  assert.equal(
    resolveMaintenanceTemplateName({}, 'short-id', []),
    'Sense nom (short-id)'
  )
  assert.equal(
    resolveMaintenanceTemplateName({}, 'abcdefghijklmnop', []),
    'Sense nom (abcdefghij…)'
  )
})

test('displayMaintenanceTemplateName uses trimmed name or Sense nom fallback', () => {
  assert.equal(
    displayMaintenanceTemplateName({ id: 't1', name: '  Plantilla  ' }),
    'Plantilla'
  )
  assert.equal(
    displayMaintenanceTemplateName({ id: 't2', name: '   ' }),
    'Sense nom (t2)'
  )
  assert.equal(
    displayMaintenanceTemplateName({ id: 'verylongtemplateid' }),
    'Sense nom (verylongte…)'
  )
})
