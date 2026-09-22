const test = require('node:test')
const assert = require('node:assert/strict')

const { compareSpaceReservationRows } = require('../src/lib/spacesReservationSort.ts')
const {
  indexSpaceOwnershipDocs,
  resolveSpaceKind,
} = require('../src/lib/costServeis/spaceOwnership.ts')

test('ordena primer els centres propis i alfabèticament dins de cada grup', () => {
  const rows = [
    { finca: 'Zoo extern', isOwn: false },
    { finca: 'Àgora pròpia', isOwn: true },
    { finca: 'Bosc propi', isOwn: true },
    { finca: 'Àtic extern', isOwn: false },
  ]

  assert.deepEqual(rows.sort(compareSpaceReservationRows).map((row) => row.finca), [
    'Àgora pròpia',
    'Bosc propi',
    'Àtic extern',
    'Zoo extern',
  ])
})

test('els centres sense classificació queden després dels propis', () => {
  const rows = [
    { finca: 'Centre desconegut' },
    { finca: 'Masia pròpia', isOwn: true },
  ]

  assert.equal(rows.sort(compareSpaceReservationRows)[0].finca, 'Masia pròpia')
})

test('una variant abreujada del nom conserva la classificació de finca pròpia', () => {
  const index = indexSpaceOwnershipDocs([
    {
      id: 'batllori',
      data: {
        nom: 'Finca Batllori (CCH00123)',
        code: 'CCH00123',
        tipus: 'Propi',
      },
    },
  ])

  assert.equal(resolveSpaceKind(index, { location: 'Finca Batllori' }), 'Propi')
})
