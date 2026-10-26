const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  businessLineFromPipeline,
  classifyStage,
  isLostZohoStage,
  normalizeZohoDeals,
  resolveZohoEndTime,
} = require('../src/services/zoho/sync-normalization')

after(() => {
  Module._load = originalLoad
})

test('businessLineFromPipeline uses Pipeline as the canonical business line', () => {
  assert.equal(businessLineFromPipeline('Bodas'), 'Casaments')
  assert.equal(businessLineFromPipeline({ id: '1', name: 'Corporativo' }), 'Empresa')
  assert.equal(businessLineFromPipeline('Fires i Festivals'), 'Foodlovers')
  assert.equal(businessLineFromPipeline('Grupos Restaurantes'), 'Grups Restaurants')
  assert.equal(businessLineFromPipeline(null), null)
})

test('restaurant centres keep priority over Pipeline when resolving LN', async () => {
  const dependencies = {
    parseZohoDate: (value) => value || null,
    parseZohoTime: () => null,
    getLN: async () => 'Agenda',
    lnForMartaGranatoCommercial: (ln, commercial) =>
      String(commercial || '').includes('Marta Granato') ? 'Grups Restaurants' : ln,
    stripCode: (value) => String(value).replace(/\s*\([^)]+\)\s*/g, '').trim(),
    normalizeIncomingZohoCode: (value) => value || null,
    extractCodeFromName: (value) => String(value).match(/\(([^)]+)\)/)?.[1] || null,
    isBadCode: () => false,
    hasRestaurantKeyword: () => false,
    findFincaForUbicacio: () => null,
    extractZohoDisplayName: () => null,
    operativeResponsableFromZohoDeal: () => '',
    fincaLnForDeal: (ln, _commercial, force) =>
      force ? 'Grups Restaurants' : ln,
  }
  const [restaurant] = await normalizeZohoDeals(
    [{
      id: 'deal-1',
      Deal_Name: 'Prova restaurant',
      Stage: 'Pagament confirmat',
      Pipeline: 'Bodas',
      Fecha_del_evento: '2027-06-21',
      Owner: { id: 'owner-1', name: 'Comercial' },
      Finca_2: ['Restaurant Mirador (CCR00006)'],
    }],
    dependencies
  )
  const [company] = await normalizeZohoDeals(
    [{
      id: 'deal-2',
      Deal_Name: 'Empresa fora restaurant',
      Stage: 'Pagament confirmat',
      Pipeline: 'Corporativo',
      Fecha_del_evento: '2027-06-22',
      Owner: { id: 'owner-2', name: 'Comercial' },
      Finca_2: ['Espai Empresa (CCE00001)'],
    }],
    dependencies
  )

  assert.equal(restaurant.LN, 'Grups Restaurants')
  assert.equal(company.LN, 'Empresa')
})

test('classifyStage routes calentet to taronja and payment/RQ to verd', () => {
  assert.equal(classifyStage('Calentet'), 'taronja')
  assert.equal(classifyStage('Prereserva'), 'taronja')
  assert.equal(classifyStage('Pre-reserva'), 'taronja')
  assert.equal(classifyStage('Prereserva calentet'), 'taronja')
  assert.equal(classifyStage('Pagament confirmat'), 'verd')
  assert.equal(classifyStage('Cerrada ganada'), 'verd')
  assert.equal(classifyStage('RQ enviada'), 'verd')
})

test('classifyStage maps proposal/pending stages to groc and drops unknown', () => {
  assert.equal(classifyStage('Pendent client'), 'groc')
  assert.equal(classifyStage('Proposta enviada'), 'groc')
  assert.equal(classifyStage('Propuesta'), 'groc')
  assert.equal(classifyStage('Pressupost'), 'groc')
  assert.equal(classifyStage('Pressupost enviat'), 'groc')
  assert.equal(classifyStage('Seguiment 1'), 'groc')
  assert.equal(classifyStage('Seguiment 2'), 'groc')
  assert.equal(classifyStage('Qualificació'), null)
  assert.equal(classifyStage(''), null)
})

test('isLostZohoStage recognizes Spanish and Catalan lost stages', () => {
  assert.equal(isLostZohoStage('Cerrada perdida'), true)
  assert.equal(isLostZohoStage('PÉRDIDA'), true)
  assert.equal(isLostZohoStage('Oportunitat perduda'), true)
  assert.equal(isLostZohoStage('Cerrada ganada'), false)
  assert.equal(isLostZohoStage('Propuesta enviada'), false)
})

test('resolveZohoEndTime prioritizes wedding end time and falls back to event end time', () => {
  const parseTime = (value) => {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
  }

  assert.equal(
    resolveZohoEndTime(
      { Hora_Fi_Boda: '01:30 h', Hora_Fi_Evento: '23:00' },
      parseTime
    ),
    '01:30'
  )
  assert.equal(
    resolveZohoEndTime(
      { Hora_Fi_Boda: '', Hora_Fi_Evento: '9:15' },
      parseTime
    ),
    '09:15'
  )
  assert.equal(resolveZohoEndTime({}, parseTime), null)
})
