const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  resolveServeisGroupPhaseLabel,
} = require('../src/lib/quadrantsPost/resolveServeisGroupPhaseLabel')
const {
  buildServeisPhaseRequests,
} = require('../src/lib/quadrantsPost/buildServeisPhaseRequests')

test('resolveServeisGroupPhaseLabel prefers dateLabel over phaseKey and date heuristic', () => {
  assert.equal(
    resolveServeisGroupPhaseLabel(
      { dateLabel: 'Event', phaseKey: 'muntatge', serviceDate: '2026-08-01' },
      '2026-08-01'
    ),
    'Event'
  )
})

test('resolveServeisGroupPhaseLabel uses phaseKey when dateLabel is empty (same-day Muntatge)', () => {
  assert.equal(
    resolveServeisGroupPhaseLabel(
      { dateLabel: '', phaseKey: 'muntatge', serviceDate: '2026-08-01' },
      '2026-08-01'
    ),
    'Muntatge'
  )
  assert.equal(
    resolveServeisGroupPhaseLabel(
      { phaseKey: 'event', serviceDate: '2026-08-01' },
      '2026-08-01'
    ),
    'Event'
  )
})

test('resolveServeisGroupPhaseLabel falls back to date heuristic only without phase info', () => {
  assert.equal(
    resolveServeisGroupPhaseLabel({ serviceDate: '2026-08-01' }, '2026-08-01'),
    'Event'
  )
  assert.equal(
    resolveServeisGroupPhaseLabel({ serviceDate: '2026-07-31' }, '2026-08-01'),
    'Muntatge'
  )
})

test('buildServeisPhaseRequests keeps same-day Muntatge off the Event prefix', async () => {
  const { phaseRequests } = await buildServeisPhaseRequests({
    body: {
      startDate: '2026-08-01',
      startTime: '08:00',
      endTime: '16:00',
      meetingPoint: 'Base',
      groups: [
        {
          id: 'group-muntatge-1',
          serviceDate: '2026-08-01',
          dateLabel: null,
          phaseKey: 'muntatge',
          workers: 2,
          drivers: 1,
          wantsResponsible: false,
          driverId: 'd1',
        },
      ],
    },
    mode: 'manual',
    getDepartmentPeople: async () => [],
    getPremisesData: async () => ({ premises: { driverCrews: [] } }),
  })

  assert.equal(phaseRequests.length, 1)
  assert.equal(phaseRequests[0].label, 'Muntatge')
  assert.equal(phaseRequests[0].phaseType, 'muntatge')
  assert.notEqual(phaseRequests[0].phaseType, 'event')
})

test('buildServeisPhaseRequests still labels same-day Event when phaseKey is event', async () => {
  const { phaseRequests, remainingServiceEventGroups } = await buildServeisPhaseRequests({
    body: {
      startDate: '2026-08-01',
      startTime: '08:00',
      endTime: '16:00',
      meetingPoint: 'Base',
      groups: [
        {
          id: 'group-event-1',
          serviceDate: '2026-08-01',
          dateLabel: '',
          phaseKey: 'event',
          workers: 3,
          drivers: 1,
          wantsResponsible: true,
          driverId: 'd1',
        },
      ],
    },
    mode: 'manual',
    getDepartmentPeople: async () => [],
    getPremisesData: async () => ({ premises: { driverCrews: [] } }),
  })

  assert.equal(phaseRequests.length, 1)
  assert.equal(phaseRequests[0].label, 'Event')
  assert.equal(phaseRequests[0].phaseType, 'event')
  assert.equal(remainingServiceEventGroups, 1)
})
