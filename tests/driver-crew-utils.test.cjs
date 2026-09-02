const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  findDriverCrewForPerson,
  getCrewMembersForDriver,
  isCrewMember,
  sortPeopleWithCrewFirst,
} = require('../src/lib/driverCrewUtils')

const CREWS = [
  {
    id: 'crew-a',
    driverId: 'D-1',
    driverName: 'Joan Pujol',
    companions: [
      { id: 'c1', name: 'Anna' },
      { id: 'c2', name: 'Berta' },
    ],
  },
  {
    id: 'crew-b',
    driverId: 'D-2',
    driverName: 'Pere',
    companions: [{ id: 'c3', name: 'Carla' }],
  },
]

test('findDriverCrewForPerson matches by id or accent-insensitive name', () => {
  assert.equal(findDriverCrewForPerson('D-1', undefined, CREWS)?.id, 'crew-a')
  assert.equal(findDriverCrewForPerson(undefined, 'joan pujol', CREWS)?.id, 'crew-a')
  assert.equal(findDriverCrewForPerson(undefined, 'Joàn Pújol', CREWS)?.id, 'crew-a')
  assert.equal(findDriverCrewForPerson('missing', 'nobody', CREWS), null)
  assert.equal(findDriverCrewForPerson(undefined, undefined, CREWS), null)
  assert.equal(findDriverCrewForPerson('D-1', 'Joan', undefined), null)
})

test('getCrewMembersForDriver returns trimmed companion refs', () => {
  assert.deepEqual(getCrewMembersForDriver('D-1', 'Joan', CREWS), [
    { id: 'c1', name: 'Anna' },
    { id: 'c2', name: 'Berta' },
  ])
  assert.deepEqual(getCrewMembersForDriver('x', 'y', CREWS), [])
})

test('isCrewMember matches by id or name with diacritic folding', () => {
  const members = getCrewMembersForDriver('D-1', 'Joan', CREWS)
  assert.equal(isCrewMember({ id: 'c1', name: 'Other' }, members), true)
  assert.equal(isCrewMember({ id: '', name: 'Ànna' }, members), true)
  assert.equal(isCrewMember({ id: 'x', name: 'Zoe' }, members), false)
  assert.equal(isCrewMember({ id: 'c1', name: 'Anna' }, []), false)
})

test('sortPeopleWithCrewFirst keeps crew order then locale-sorts the rest', () => {
  const members = [
    { id: 'c2', name: 'Berta' },
    { id: 'c1', name: 'Anna' },
  ]
  const people = [
    { id: 'z', name: 'Zoe' },
    { id: 'c1', name: 'Anna' },
    { id: 'x', name: 'Marc' },
    { id: 'c2', name: 'Berta' },
  ]
  assert.deepEqual(
    sortPeopleWithCrewFirst(people, members).map((p) => p.id),
    ['c2', 'c1', 'x', 'z']
  )
  assert.deepEqual(
    sortPeopleWithCrewFirst(people, []).map((p) => p.id),
    ['z', 'c1', 'x', 'c2']
  )
})
