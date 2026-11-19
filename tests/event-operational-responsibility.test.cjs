const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isUserOperationalResponsibleInQuadrants,
} = require('../src/lib/server/eventOperationalResponsibility')

test('only the person assigned with the event responsible role can close it', () => {
  const docs = [
    {
      groups: [
        {
          id: 'service-shift',
          roleLines: [
            { personId: 'event-responsible', personName: 'Anna', role: 'responsable' },
            { personId: 'profile-responsible', personName: 'Bernat', role: 'treballador' },
            { personId: 'other-responsible', personName: 'Carla', role: 'conductor' },
          ],
        },
      ],
    },
  ]

  assert.equal(
    isUserOperationalResponsibleInQuadrants({
      docs,
      userId: 'event-responsible',
      userName: 'Anna',
    }),
    true
  )
  assert.equal(
    isUserOperationalResponsibleInQuadrants({
      docs,
      userId: 'profile-responsible',
      userName: 'Bernat',
    }),
    false
  )
  assert.equal(
    isUserOperationalResponsibleInQuadrants({
      docs,
      userId: 'other-responsible',
      userName: 'Carla',
    }),
    false
  )
})

test('responsible identity matching accepts normalized names when personnel ids differ', () => {
  assert.equal(
    isUserOperationalResponsibleInQuadrants({
      docs: [{ responsable: { id: 'personnel-7', name: 'Àlex Puig' } }],
      userId: 'user-19',
      userName: 'Alex Puig',
    }),
    true
  )
})
