const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildEttScheduleEmailText,
  collectEttEmailSchedules,
  LOGISTICS_ETT_RECIPIENT,
} = require('../src/lib/quadrantEttEmail')

test('ETT email schedules aggregate confirmed workers with the same recipient and hours', () => {
  const worker = {
    name: 'ETT',
    isExternal: true,
    externalType: 'ett',
    ettProviderId: 'provider-1',
    ettProviderName: 'Treball Temporal',
    ettResponsibleName: 'Anna',
    ettEmail: 'ANNA@ETT.CAT',
    startDate: '2026-10-05',
    startTime: '16:00',
    endTime: '23:30',
    meetingPoint: 'Magatzem central',
  }
  const schedules = collectEttEmailSchedules(
    [{
      status: 'confirmed',
      code: 'E26001',
      eventName: 'Sopar empresa',
      location: 'Cal Blay',
      vestimentModel: 'Camisa blanca i pantaló negre',
      responsableId: 'person-1',
      responsableName: 'Joan Responsable',
      responsablePhone: '600 123 123',
      treballadors: [worker, { ...worker }],
    }],
    'event-1',
    'serveis'
  )

  assert.equal(schedules.length, 1)
  assert.equal(schedules[0].workers, 2)
  assert.equal(schedules[0].email, 'anna@ett.cat')
  const emailText = buildEttScheduleEmailText(schedules)
  assert.match(emailText, /Data: 05\/10\/2026/)
  assert.match(emailText, /Núm\. treballadors: 2/)
  assert.match(emailText, /Lloc: Magatzem central/)
  assert.match(emailText, /Vestimenta: Camisa blanca i pantaló negre/)
  assert.match(emailText, /Responsable: Joan Responsable/)
  assert.match(emailText, /Telèfon del responsable: 600 123 123/)
  assert.match(emailText, /Hora inici: 16:00/)
  assert.match(emailText, /Hora fi \(estimada\): 23:30/)
  assert.match(emailText, /confirmeu l’assistència, els noms de les persones/)
})

test('ETT email schedules ignore drafts and contacts without email', () => {
  const schedules = collectEttEmailSchedules(
    [
      { status: 'draft', treballadors: [{ name: 'ETT', isExternal: true, ettEmail: 'ett@exemple.cat' }] },
      { status: 'confirmed', treballadors: [{ name: 'ETT', isExternal: true, ettEmail: '' }] },
    ],
    'event-1',
    'cuina'
  )

  assert.deepEqual(schedules, [])
})

test('logistics ETT schedules always use the fixed Cal Blay HR recipient', () => {
  const schedules = collectEttEmailSchedules(
    [{
      status: 'confirmed',
      code: 'E26002',
      eventName: 'Servei logístic',
      treballadors: [{
        name: 'ETT',
        isExternal: true,
        externalType: 'ett',
        ettProviderName: 'Proveïdor extern',
        ettResponsibleName: 'Una altra persona',
        ettEmail: 'altre@example.com',
        startDate: '2026-10-06',
        startTime: '08:00',
        endTime: '16:00',
      }],
    }],
    'event-2',
    'logistica'
  )

  assert.equal(schedules.length, 1)
  assert.equal(schedules[0].email, LOGISTICS_ETT_RECIPIENT.email)
  assert.equal(
    schedules[0].responsibleName,
    LOGISTICS_ETT_RECIPIENT.responsibleName
  )
  assert.equal(schedules[0].providerId, LOGISTICS_ETT_RECIPIENT.providerId)
})

test('logistics fixed recipient works when the stored ETT has no email', () => {
  const schedules = collectEttEmailSchedules(
    [{
      status: 'confirmed',
      treballadors: [{ name: 'ETT', isExternal: true, externalType: 'ett' }],
    }],
    'event-3',
    'logistica'
  )

  assert.equal(schedules.length, 1)
  assert.equal(schedules[0].email, 'recursoshumans@calblay.com')
})

test('ETT email schedules do not duplicate a group copied across phase documents', () => {
  const worker = {
    name: 'ETT',
    isExternal: true,
    externalType: 'ett',
    ettProviderName: 'ETT Exemple',
    ettEmail: 'contacte@ett.cat',
    ettGroupKey: 'serveis-event',
    startDate: '2026-10-05',
    startTime: '16:00',
    endTime: '23:30',
  }
  const copiedDoc = { status: 'confirmed', treballadors: [worker, { ...worker }] }
  const schedules = collectEttEmailSchedules(
    [copiedDoc, { ...copiedDoc }],
    'event-1',
    'serveis'
  )

  assert.equal(schedules.length, 1)
  assert.equal(schedules[0].workers, 2)
})
