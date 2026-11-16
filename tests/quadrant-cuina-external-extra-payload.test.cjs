const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildCuinaPayload,
} = require('../src/app/menu/quadrants/[id]/lib/buildCuinaPayload')
const { getTargetInternalWorkerCount } = require('../src/lib/quadrantWorkerCounts')

test('cuina save payload preserves generic external-extra identity end to end', () => {
  const { payload } = buildCuinaPayload({
    basePayload: {},
    mode: 'manual',
    cuinaGroups: [
      {
        id: 'group-1',
        meetingPoint: 'Cal Blay',
        serviceDate: '2026-11-16',
        startTime: '10:00',
        arrivalTime: '',
        endTime: '14:00',
        workers: 1,
        drivers: 0,
        needsDriver: false,
        wantsResponsible: false,
        responsibleId: '',
        driverMode: '__auto__',
        vehicleType: '',
        roleLines: [
          {
            slotId: 'slot-extra-1',
            role: 'treballador',
            personId: '',
            personName: 'Extra C. Extern',
            isExternal: true,
            externalType: 'centerExternalExtra',
            isCenterExternalExtra: true,
          },
        ],
      },
    ],
    cuinaTotals: { workers: 1, drivers: 0, responsables: 0, headcount: 1 },
    cuinaVehiclesPayload: [],
    cuinaEtt: {
      open: false,
      data: {
        serviceDate: '',
        meetingPoint: '',
        startTime: '',
        endTime: '',
        workers: '0',
        ettProviderId: '',
        ettProviderName: '',
        ettResponsibleName: '',
        ettEmail: '',
      },
    },
    isManualResponsibleConductor: false,
    manualResponsibleId: null,
    manualResponsibleName: null,
    meetingPoint: 'Cal Blay',
    startDate: '2026-11-16',
    endDate: '2026-11-16',
    startTime: '10:00',
    endTime: '14:00',
    availableResponsables: [],
    availableConductors: [],
  })

  assert.equal(payload.externalWorkers.length, 1)
  assert.deepEqual(payload.externalWorkers[0], {
    id: 'center-external-group-1-slot-extra-1',
    groupId: 'group-1',
    name: 'Extra C.Extern',
    isExternal: true,
    externalType: 'centerExternalExtra',
    meetingPoint: 'Cal Blay',
    startDate: '2026-11-16',
    endDate: '2026-11-16',
    startTime: '10:00',
    endTime: '14:00',
  })

  assert.equal(payload.groups[0].roleLines[0].externalType, 'centerExternalExtra')
  assert.equal(payload.groups[0].roleLines[0].isCenterExternalExtra, true)

  assert.equal(
    getTargetInternalWorkerCount({
      totalWorkers: payload.totalWorkers,
      numDrivers: payload.numDrivers,
      responsibleCount: 0,
      externalWorkerCount: payload.externalWorkers.length,
    }),
    0
  )
})
