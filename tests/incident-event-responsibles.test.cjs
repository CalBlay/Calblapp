const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  extractQuadrantResponsibleNames,
  incidentResponsibleDepartmentLabel,
} = require('../src/lib/incidentEventResponsibles')

test('extractQuadrantResponsibleNames supports all current quadrant shapes', () => {
  assert.deepEqual(
    extractQuadrantResponsibleNames({
      responsableName: 'Responsable general',
      responsable: { name: 'Responsable general' },
      responsables: [{ name: 'Segona responsable' }],
      groups: [
        {
          responsibleName: 'Responsable de grup',
          roleLines: [
            { role: 'responsable', personName: 'Responsable de línia' },
            { role: 'treballador', personName: 'No incloure' },
          ],
        },
      ],
    }),
    [
      'Responsable general',
      'Segona responsable',
      'Responsable de grup',
      'Responsable de línia',
    ]
  )
})

test('incident responsible labels distinguish operational departments', () => {
  assert.equal(incidentResponsibleDepartmentLabel('logistica'), 'Logística')
  assert.equal(incidentResponsibleDepartmentLabel('cuina'), 'Cuina')
  assert.equal(incidentResponsibleDepartmentLabel('serveis'), 'Serveis')
})
