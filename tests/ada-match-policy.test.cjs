const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildAdaMatch,
  stageAdaDateKeys,
} = require('../src/services/sync/adaMatchPolicy.ts')

test('a provisional PM can match ADA by tasting date, client and commercial name', () => {
  const stage = {
    NomEvent: "ALEA IBERIA, S.L. · Restaurant La Masia d'Esplugues · 4 pax",
    NomClient: 'ALEA IBERIA, S.L.',
    Comercial: 'Anna Ferrete',
    DataInici: '2026-12-10',
    MenuTastingCompanyDate: '2026-11-18',
  }
  const ada = {
    codigo: 'E2600524',
    descripcion: 'E 101226 ALEA IBERIA-LA PALOMA',
    fechaInicio: '2026-11-18T20:00:00',
    nombreCliente: 'ALEA IBERIA, S.L.',
    nombreComercial: 'Anna Ferrete',
  }

  const match = buildAdaMatch(stage, ada, true)
  assert.equal(match.score, 3)
  assert.deepEqual(match.fields, ['date', 'commercial', 'client'])
})

test('menu tasting dates are only considered for provisional PM matching', () => {
  const stage = {
    DataInici: '2026-12-10',
    Data_1_Prova_Men: 'Dimecres (18.11.2026 - 13:00 h)',
  }

  assert.deepEqual(stageAdaDateKeys(stage, false), ['2026-12-10'])
  assert.deepEqual(stageAdaDateKeys(stage, true), ['2026-12-10', '2026-11-18'])
})
