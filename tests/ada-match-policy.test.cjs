const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildAdaMatch,
  chooseAdaCodeWinner,
  isStrongAdaMatch,
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

test('date and commercial alone are not a strong ADA match', () => {
  const match = buildAdaMatch(
    {
      NomEvent: 'CAFES NOVELL, S.A. / 18/12/26 / 200',
      NomClient: 'CAFES NOVELL, S.A.',
      Comercial: 'Anna Ferrete',
      DataInici: '2026-12-18',
    },
    {
      codigo: 'E2600641',
      descripcion: 'E 181226 CASA AMETLLER/COCKTAIL - FDLC',
      fechaInicio: '2026-12-18T00:00:00',
      nombreCliente: 'CASA AMETLLER, S.L.',
      nombreComercial: 'Anna Ferrete',
    },
    false
  )

  assert.deepEqual(match.fields, ['date', 'commercial'])
  assert.equal(isStrongAdaMatch(match), false)
})

test('date, commercial and client form a strong ADA match', () => {
  const match = buildAdaMatch(
    {
      NomEvent: 'CASA AMETLLER, S.L. / 18/12/26 / 230',
      NomClient: 'CASA AMETLLER, S.L.',
      Comercial: 'Anna Ferrete',
      DataInici: '2026-12-18',
    },
    {
      codigo: 'E2600641',
      descripcion: 'E 181226 CASA AMETLLER/COCKTAIL - FDLC',
      fechaInicio: '2026-12-18T00:00:00',
      nombreCliente: 'CASA AMETLLER, S.L.',
      nombreComercial: 'Anna Ferrete',
    },
    false
  )

  assert.deepEqual(match.fields, ['date', 'commercial', 'client'])
  assert.equal(isStrongAdaMatch(match), true)
})

test('a stronger ADA contender beats the current weak owner', () => {
  const winner = chooseAdaCodeWinner([
    { documentKey: 'stage_taronja/cafes-novell', score: 2, ownsCode: true },
    { documentKey: 'stage_verd/casa-ametller', score: 3, ownsCode: false },
  ])

  assert.equal(winner?.documentKey, 'stage_verd/casa-ametller')
})

test('the current ADA owner is preserved when the best score is tied', () => {
  const winner = chooseAdaCodeWinner([
    { documentKey: 'stage_verd/first', score: 2, ownsCode: false },
    { documentKey: 'stage_verd/current', score: 2, ownsCode: true },
  ])

  assert.equal(winner?.documentKey, 'stage_verd/current')
})
