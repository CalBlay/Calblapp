const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (isFirebaseAdminModule(request)) {
    return { firestoreAdmin: { collection: () => ({}), doc: () => ({}) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const { normalizeManualLnName } = require('../src/lib/costServeis/manualLnOptions')
const { resolveOpsiaLnCodi } = require('../src/lib/costServeis/peSeed')
const { peBucketDocId } = require('../src/lib/costServeis/peBuckets')
const {
  applyManualDeductionsToPots,
  computeManualTotal,
  laborCostFromPeopleHours,
  structureCostFromHours,
  sumManualPotDeductions,
} = require('../src/lib/costServeis/manualServices')

test('normalizeManualLnName maps ERP codes and restaurant aliases to one canonical LN', () => {
  assert.equal(normalizeManualLnName(''), '')
  assert.equal(normalizeManualLnName(null), '')
  assert.equal(normalizeManualLnName('LN00001'), 'Grups Restaurants')
  assert.equal(normalizeManualLnName('restaurants'), 'Grups Restaurants')
  assert.equal(normalizeManualLnName('Restauració'), 'Grups Restaurants')
  assert.equal(normalizeManualLnName('Grups Restaurants (LN00001)'), 'Grups Restaurants')
  assert.equal(normalizeManualLnName('ln00004'), 'Precuinats')
  assert.equal(normalizeManualLnName('Precuinat central'), 'Precuinats')
  assert.equal(normalizeManualLnName('  Casaments  '), 'Casaments')
  assert.equal(normalizeManualLnName('Empresa'), 'Empresa')
  assert.equal(normalizeManualLnName('ATMETLLER'), 'ATMETLLER')
})

test('resolveOpsiaLnCodi matches code, canonical name, and folded aliases', () => {
  const byLn = {
    LN00001: { lnCodi: 'LN00001', lnNom: 'Grups Restaurants' },
    LN00004: { lnCodi: 'LN00004', lnNom: 'Precuinats' },
    LN00009: { lnCodi: 'LN00009', lnNom: 'Empresa' },
  }

  assert.equal(resolveOpsiaLnCodi(byLn, ''), null)
  assert.equal(resolveOpsiaLnCodi(byLn, 'ln00001'), 'LN00001')
  assert.equal(resolveOpsiaLnCodi(byLn, 'Restaurants'), 'LN00001')
  assert.equal(resolveOpsiaLnCodi(byLn, 'Grups Restaurants'), 'LN00001')
  assert.equal(resolveOpsiaLnCodi(byLn, 'Precuinats'), 'LN00004')
  assert.equal(resolveOpsiaLnCodi(byLn, 'empresa'), 'LN00009')
  assert.equal(resolveOpsiaLnCodi(byLn, 'Desconegut'), null)
})

test('peBucketDocId slugs LN and service while keeping spaceKind casing', () => {
  assert.equal(
    peBucketDocId(2026, 'Grups Restaurants', 'Aperitiu', 'Propi'),
    '2026__grups-restaurants__aperitiu__Propi'
  )
  assert.equal(
    peBucketDocId(2026, 'Càtering Extra', 'Banquet - Menú 1', 'Extern'),
    '2026__catering-extra__banquet-menu-1__Extern'
  )
  assert.equal(peBucketDocId(2026, '***', '', 'Propi'), '2026__x__x__Propi')
})

test('manual labor and structure hours never go negative and round to cents', () => {
  assert.equal(laborCostFromPeopleHours(2, 3, 18), 108)
  assert.equal(laborCostFromPeopleHours(2.5, 1.5, 18), 67.5)
  assert.equal(laborCostFromPeopleHours(-2, 3, 18), 0)
  assert.equal(laborCostFromPeopleHours(2, -1, 18), 0)
  assert.equal(structureCostFromHours(2.5, 18), 45)
  assert.equal(structureCostFromHours(-4, 18), 0)
  assert.equal(structureCostFromHours(1, -18), 0)
})

test('computeManualTotal sums labor + structure + fuel and ignores negatives', () => {
  assert.equal(
    computeManualTotal({
      laborCost: 108,
      managementCost: 36,
      preparationCost: 18,
      washingCost: 9,
      fuelCost: 12.345,
    }),
    183.35
  )
  assert.equal(
    computeManualTotal({
      laborCost: -10,
      managementCost: 5,
      preparationCost: undefined,
      washingCost: null,
      fuelCost: 2.5,
    }),
    7.5
  )
})

test('sumManualPotDeductions groups by month and skips fuel, labor, and non-ponderacio depts', () => {
  const byYm = sumManualPotDeductions([
    {
      dept: 'logistica',
      eventDate: '2026-03-08',
      managementCost: 40,
      preparationCost: 10,
      washingCost: 5,
      laborCost: 999,
      fuelCost: 80,
    },
    {
      dept: 'logistica',
      eventDate: '2026-03-20',
      managementCost: 10.555,
      preparationCost: 0,
      washingCost: 0,
    },
    {
      dept: 'cuina',
      eventDate: '2026-03-08',
      managementCost: 7,
      preparationCost: 3,
      washingCost: 1,
    },
    {
      dept: 'serveis',
      eventDate: '2026-03-08',
      managementCost: 100,
      preparationCost: 100,
      washingCost: 100,
    },
    {
      dept: 'logistica',
      eventDate: '',
      managementCost: 50,
      preparationCost: 50,
      washingCost: 50,
    },
  ])

  assert.deepEqual(byYm.get('2026-03').logistica, {
    gestio: 50.56,
    preparacio: 10,
    rentat: 5,
  })
  assert.deepEqual(byYm.get('2026-03').cuina, {
    gestio: 7,
    preparacio: 3,
    rentat: 1,
  })
  assert.equal(byYm.get('2026-03').serveis, undefined)
  assert.equal(byYm.size, 1)
})

test('applyManualDeductionsToPots floors remaining pots at zero', () => {
  const pots = { gestio: 100, preparacio: 20, rentat: 5 }
  assert.deepEqual(applyManualDeductionsToPots(pots, null), pots)
  assert.deepEqual(
    applyManualDeductionsToPots(pots, { gestio: 40.4, preparacio: 8, rentat: 1 }),
    { gestio: 59.6, preparacio: 12, rentat: 4 }
  )
  assert.deepEqual(
    applyManualDeductionsToPots(pots, { gestio: 400, preparacio: 0, rentat: 5 }),
    { gestio: 0, preparacio: 20, rentat: 0 }
  )
})
