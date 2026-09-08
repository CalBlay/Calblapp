const assert = require('node:assert/strict')
const { test } = require('node:test')

const { splitServiceTypeLabels, allServiceTypesInCatalog } = require('../src/lib/serveis/utils')
const {
  allocateStructurePotsToEvents,
  coefForEvent,
} = require('../src/lib/costServeis/allocateStructure')

test('splitServiceTypeLabels splits on comma and trims', () => {
  assert.deepEqual(splitServiceTypeLabels('Aperitiu,Banquet - Menu 1'), [
    'Aperitiu',
    'Banquet - Menu 1',
  ])
  assert.deepEqual(splitServiceTypeLabels('  Aperitiu , Banquet  '), [
    'Aperitiu',
    'Banquet',
  ])
  assert.deepEqual(splitServiceTypeLabels('Només un'), ['Només un'])
  assert.deepEqual(splitServiceTypeLabels(''), [])
})

test('allServiceTypesInCatalog requires every part', () => {
  const catalog = [
    { id: 'aperitiu', nom: 'Aperitiu', codi: 'aperitiu' },
    { id: 'banquet-menu-1', nom: 'Banquet - Menu 1', codi: 'banquet-menu-1' },
  ]
  assert.equal(allServiceTypesInCatalog('Aperitiu,Banquet - Menu 1', catalog), true)
  assert.equal(allServiceTypesInCatalog('Aperitiu,Desconegut', catalog), false)
})

test('coefForEvent sums weights of comma-separated services', () => {
  const catalog = [
    { id: 'a', nom: 'Aperitiu', codi: 'aperitiu' },
    { id: 'b', nom: 'Banquet', codi: 'banquet' },
  ]
  const weightsByKey = new Map([
    [
      'a__Propi',
      {
        id: 'a__logistica__Propi',
        serveiId: 'a',
        spaceKind: 'Propi',
        dept: 'logistica',
        gestio: 2,
        preparacio: 1,
        rentat: 1,
      },
    ],
    [
      'b__Propi',
      {
        id: 'b__logistica__Propi',
        serveiId: 'b',
        spaceKind: 'Propi',
        dept: 'logistica',
        gestio: 3,
        preparacio: 2,
        rentat: 0.5,
      },
    ],
  ])
  const coef = coefForEvent('Aperitiu,Banquet', 'Propi', catalog, weightsByKey)
  assert.deepEqual(coef, { gestio: 5, preparacio: 3, rentat: 1.5 })
})

test('allocateStructurePotsToEvents uses spaceKind and multi-service sum', () => {
  const catalog = [
    { id: 'a', nom: 'Aperitiu', codi: 'aperitiu' },
    { id: 'b', nom: 'Banquet', codi: 'banquet' },
  ]
  const weightRows = [
    {
      id: 'a__logistica__Propi',
      serveiId: 'a',
      serveiNom: 'Aperitiu',
      serveiCodi: 'aperitiu',
      dept: 'logistica',
      spaceKind: 'Propi',
      gestio: 1,
      preparacio: 1,
      rentat: 1,
      updatedAt: '',
    },
    {
      id: 'b__logistica__Propi',
      serveiId: 'b',
      serveiNom: 'Banquet',
      serveiCodi: 'banquet',
      dept: 'logistica',
      spaceKind: 'Propi',
      gestio: 1,
      preparacio: 1,
      rentat: 1,
      updatedAt: '',
    },
    {
      id: 'a__logistica__Extern',
      serveiId: 'a',
      serveiNom: 'Aperitiu',
      serveiCodi: 'aperitiu',
      dept: 'logistica',
      spaceKind: 'Extern',
      gestio: 4,
      preparacio: 1,
      rentat: 1,
      updatedAt: '',
    },
  ]

  const quotas = allocateStructurePotsToEvents({
    pots: { gestio: 100, preparacio: 0, rentat: 0 },
    events: [
      {
        eventId: 'e1',
        serviceType: 'Aperitiu,Banquet',
        numPax: 10,
        spaceKind: 'Propi',
      },
      {
        eventId: 'e2',
        serviceType: 'Aperitiu',
        numPax: 10,
        spaceKind: 'Extern',
      },
    ],
    catalog,
    weightRows,
    dept: 'logistica',
  })

  // e1 coef gestio = 1+1 = 2; e2 = 4; total 6 → 100 * 2/6 vs 100 * 4/6
  assert.equal(quotas.get('e1').managementCost, 33.33)
  assert.equal(quotas.get('e2').managementCost, 66.67)
})
