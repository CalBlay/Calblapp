const assert = require('node:assert/strict')
const { test } = require('node:test')

const { buildServeisPayload } = require('../src/app/menu/quadrants/[id]/lib/buildServeisPayload')

const ettGroup = (id, providerId, workers, startTime) => ({
  id,
  data: {
    serviceDate: '2026-10-10',
    meetingPoint: 'Cal Blay',
    startTime,
    endTime: '20:00',
    workers: String(workers),
    ettProviderId: providerId,
    ettProviderName: `ETT ${providerId}`,
    ettResponsibleName: `Responsable ${providerId}`,
    ettEmail: `${providerId.toLowerCase()}@example.com`,
  },
})

test('buildServeisPayload preserves multiple independent ETT groups in one phase', () => {
  const { payload } = buildServeisPayload({
    basePayload: {},
    buildServiceGroupsPayload: () => [],
    serviceTotals: { workers: 0, drivers: 0, responsables: 0, jamoneros: 0 },
    serviceJamoneroAssignments: [],
    servicePhaseEtt: {
      event: {
        open: true,
        groups: [ettGroup('first', 'A', 2, '10:00'), ettGroup('second', 'B', 3, '11:00')],
      },
      muntatge: { open: false, groups: [] },
    },
    vestimentModelChoice: '__none__',
    manualResponsibleId: null,
    manualResponsibleName: null,
    meetingPoint: 'Fallback',
    startDate: '2026-10-10',
    endDate: '2026-10-10',
    startTime: '09:00',
    endTime: '21:00',
    availableConductors: [],
    availableJamoneros: [],
  })

  const workers = payload.externalWorkers
  assert.equal(workers.length, 5)
  assert.deepEqual(
    [...new Set(workers.map((worker) => worker.groupId))],
    ['serveis-event-first', 'serveis-event-second']
  )
  assert.equal(workers.filter((worker) => worker.ettProviderId === 'A').length, 2)
  assert.equal(workers.filter((worker) => worker.ettProviderId === 'B').length, 3)
})
