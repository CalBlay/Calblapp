const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildEttScheduleEmailText,
  collectEttEmailSchedules,
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
