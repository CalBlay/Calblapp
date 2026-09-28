const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildLogisticaPayload,
} = require('../src/app/menu/quadrants/[id]/lib/buildLogisticaPayload')

const recipient = {
  ettProviderId: 'cal-blay-rrhh-logistica',
  ettProviderName: 'ETT Logística',
  ettResponsibleName: 'Marina Ràfols - CAL BLAY',
  ettEmail: 'recursoshumans@calblay.com',
}

test('logistics payload keeps multiple ETT groups separate', () => {
  const { payload } = buildLogisticaPayload({
    basePayload: { department: 'logistica' },
    totalWorkers: 0,
    numDrivers: 0,
    buildLogisticaPhases: () => [],
    ettEntries: [
      {
        name: 'ETT',
        workers: 2,
        startDate: '2026-10-05',
        endDate: '2026-10-05',
        startTime: '08:00',
        endTime: '12:00',
        meetingPoint: 'Central',
        ettGroupKey: 'logistica-ett-mati',
        ...recipient,
      },
      {
        name: 'ETT',
        workers: 1,
        startDate: '2026-10-05',
        endDate: '2026-10-05',
        startTime: '17:00',
        endTime: '23:00',
        meetingPoint: 'El Vilar de la Duquessa',
        ettGroupKey: 'logistica-ett-tarda',
        ...recipient,
      },
    ],
  })

  assert.equal(payload.externalWorkers.length, 3)
  assert.deepEqual(
    payload.externalWorkers.map((worker) => worker.groupId),
    ['logistica-ett-mati', 'logistica-ett-mati', 'logistica-ett-tarda']
  )
  assert.equal(payload.externalWorkers[2].startTime, '17:00')
  assert.equal(payload.externalWorkers[2].ettEmail, 'recursoshumans@calblay.com')
})
