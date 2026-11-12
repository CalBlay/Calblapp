const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  aggregatePersonnelWorkload,
  buildPersonnelWorkloadSummary,
  candidateHoursInPeriod,
  hoursForPerson,
  workloadPeriodsForDate,
} = require('../src/lib/personnelWorkload')

test('workload periods use Monday-Sunday and the calendar month', () => {
  assert.deepEqual(workloadPeriodsForDate('2026-11-12'), {
    week: { startDate: '2026-11-09', endDate: '2026-11-15' },
    month: { startDate: '2026-11-01', endDate: '2026-11-30' },
  })
})

test('weekly workload mixes closed real hours and open planned hours', () => {
  const periods = workloadPeriodsForDate('2026-11-12')
  const totals = aggregatePersonnelWorkload(
    [
      { id: 'w1', name: 'Anna', startDate: '2026-11-10', endDate: '2026-11-10', startTime: '08:00', endTime: '18:00', endTimeReal: '16:00' },
      { id: 'w1', name: 'Anna', startDate: '2026-11-11', endDate: '2026-11-11', startTime: '10:00', endTime: '15:00' },
      { id: 'w1', name: 'Anna', startDate: '2026-11-12', endDate: '2026-11-12', startTime: '10:00', endTime: '15:00', endTimeReal: '15:00', noShow: true },
    ],
    periods.week,
    periods.month
  )

  assert.equal(hoursForPerson(totals.weeklyHoursByPerson, { id: 'w1' }), 13)
  assert.equal(hoursForPerson(totals.monthlyActualHoursByPerson, { id: 'w1' }), 8)
})

test('candidate crossing midnight is added and produces orange before exceeding', () => {
  const week = { startDate: '2026-11-09', endDate: '2026-11-15' }
  const candidateHours = candidateHoursInPeriod(
    { startDate: '2026-11-14', endDate: '2026-11-15', startTime: '22:00', endTime: '04:00' },
    week
  )
  const workload = buildPersonnelWorkloadSummary({
    maxHoursWeek: 40,
    weeklyHours: 36,
    candidateHours,
    monthlyActualHours: 100,
  })

  assert.equal(candidateHours, 6)
  assert.equal(workload.weeklyTone, 'orange')
  assert.equal(workload.projectedWeeklyHours, 42)
})

test('a multi-day event header does not turn one personnel line into a continuous shift', () => {
  const periods = workloadPeriodsForDate('2026-11-12')
  const totals = aggregatePersonnelWorkload(
    [
      {
        id: 'w1',
        name: 'Anna',
        startDate: '2026-11-09',
        endDate: '2026-11-15',
        startTime: '08:00',
        endTime: '16:00',
      },
    ],
    periods.week,
    periods.month
  )

  assert.equal(hoursForPerson(totals.weeklyHoursByPerson, { id: 'w1' }), 8)
})

test('overlapping roles and groups count each worked minute only once', () => {
  const periods = workloadPeriodsForDate('2026-11-12')
  const totals = aggregatePersonnelWorkload(
    [
      { id: 'w1', name: 'Anna', startDate: '2026-11-12', startTime: '06:30', endTime: '23:00' },
      { id: 'w1', name: 'Anna', startDate: '2026-11-12', startTime: '12:00', endTime: '23:59' },
      { name: 'Anna', startDate: '2026-11-12', startTime: '13:00', endTime: '23:00' },
      { name: 'Anna', startDate: '2026-11-12', startTime: '20:00', endTime: '23:00' },
    ],
    periods.week,
    periods.month
  )

  assert.equal(hoursForPerson(totals.weeklyHoursByPerson, { id: 'w1', name: 'Anna' }), 17.483333333333334)
})

test('already at the weekly limit is red and monthly uses factor 4.3', () => {
  const workload = buildPersonnelWorkloadSummary({
    maxHoursWeek: 40,
    weeklyHours: 40,
    candidateHours: 2,
    monthlyActualHours: 173,
  })

  assert.equal(workload.weeklyTone, 'red')
  assert.equal(workload.monthlyLimitHours, 172)
  assert.equal(workload.monthlyExceeded, true)
})
