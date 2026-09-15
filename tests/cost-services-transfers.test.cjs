const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  adjustStructureLinesWithTransfers,
  sumOperationalTransfersForLn,
} = require('../src/lib/costServeis/transferCostMath')

const transfers = [
  transfer('admin-catering', 'DCC0001', 'CATERING', 1581.45, 'CCC00007', 'DCC0005'),
  transfer('bases-catering', 'DPP0002', 'CATERING', 3060.45, 'CCC00007', 'DCC0005'),
  transfer('bases-foodlovers', 'DPP0002', 'FOODLOVERS', 179.25, 'CCF00001', null),
  transfer('catering-foodlovers', 'DCC0005', 'FOODLOVERS', 376.2, 'CCF00001', null),
  transfer('magatzems-catering', 'DPP0003', 'CATERING', 602.25, 'CCC00007', 'DCC0005'),
]

function transfer(id, origenDeptCodi, destiGrup, importTotal, destiCentreCodi, destiDeptCodi) {
  return {
    id,
    origenGrup: origenDeptCodi === 'DCC0005' ? 'CATERING' : 'CUINA',
    origenCentreCodi: 'CCC00007',
    origenCentreNom: 'CUINA CENTRAL',
    origenDeptCodi,
    origenDeptNom: origenDeptCodi,
    destiCentreCodi,
    destiCentreNom: destiCentreCodi,
    destiDeptCodi,
    destiDeptNom: destiDeptCodi,
    destiGrup,
    destiLnCodi: destiGrup === 'CATERING' ? 'LN00000' : 'LN00005',
    destiLnNom: destiGrup,
    minuts: 0,
    hores: 0,
    tarifaHora: 15,
    importTotal,
  }
}

test('internal Catering movements reclassify costs while external movements leave Cuina Central', () => {
  const result = adjustStructureLinesWithTransfers({
    department: 'cuina',
    sourceLines: [
      { deptCodi: 'DCC0001', deptNom: 'ADMINISTRACIO', costPersonal: 51780.39, pot: 'gestio' },
      { deptCodi: 'DPP0002', deptNom: 'BASES', costPersonal: 78704.31, pot: 'preparacio' },
      { deptCodi: 'DCC0005', deptNom: 'CATERING', costPersonal: 159026.77, pot: 'preparacio' },
      { deptCodi: 'DPP0003', deptNom: 'MAGATZEMS', costPersonal: 20735.25, pot: null },
    ],
    transfers,
  })

  assert.equal(result.transferOut, 5799.6)
  assert.equal(result.transferIn, 5244.15)
  assert.equal(result.netAdjustment, -555.45)
  assert.equal(result.unappliedTransfers, 0)
  assert.equal(result.lines.find((line) => line.deptCodi === 'DCC0001').costPersonal, 50198.94)
  assert.equal(result.lines.find((line) => line.deptCodi === 'DPP0002').costPersonal, 75464.61)
  assert.equal(result.lines.find((line) => line.deptCodi === 'DCC0005').costPersonal, 163894.72)
  assert.equal(result.lines.find((line) => line.deptCodi === 'DPP0003').costPersonal, 20133)
})

test('only external transfers are excluded from the destination LN indirect personnel', () => {
  const doc = { estat: 'CONFIRMAT', lines: transfers }
  assert.equal(sumOperationalTransfersForLn(doc, 'Foodlovers'), 555.45)
  assert.equal(
    sumOperationalTransfersForLn(doc, 'FIRES & FESTIVALS', 'LN00005'),
    555.45
  )
  assert.equal(sumOperationalTransfersForLn(doc, 'Empresa'), 0)
  assert.equal(sumOperationalTransfersForLn(doc, 'Casaments'), 0)
  assert.equal(sumOperationalTransfersForLn({ estat: 'BORRADOR', lines: transfers }, 'Foodlovers'), null)
})

test('Logistics is never adjusted because the imported origin is only Central Kitchen', () => {
  const source = [
    { deptCodi: 'DLC0001', deptNom: 'ADMINISTRACIO', costPersonal: 13355.5, pot: 'gestio' },
  ]
  const result = adjustStructureLinesWithTransfers({
    department: 'logistica',
    sourceLines: source,
    transfers: [
      {
        ...transfers[2],
        id: 'old-logistics-row',
        origenGrup: 'LOGISTICA',
        origenCentreCodi: 'CCC00004',
        origenDeptCodi: 'DLC0001',
        importTotal: 500,
      },
    ],
  })

  assert.equal(result.lines[0].costPersonal, 13355.5)
  assert.equal(result.transferOut, 0)
})
