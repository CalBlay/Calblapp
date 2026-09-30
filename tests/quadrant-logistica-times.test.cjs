const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  hydrateLogisticPhaseFromDraft,
} = require('../src/app/menu/quadrants/[id]/lib/hydrateLogisticPhasesFromDraft')

test('el payload logístic propaga arribada i tornada a Cal Blay fins al document', () => {
  const root = path.resolve(__dirname, '..')
  const files = [
    'src/app/menu/quadrants/[id]/hooks/useQuadrantFormState.ts',
    'src/lib/quadrantsPost/buildLogisticaPhaseRequests.ts',
    'src/lib/quadrantsPost/phaseWriter.ts',
    'src/lib/quadrantsPost/buildQuadrantSave.ts',
  ]

  files.forEach((relativePath) => {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
    assert.match(source, /arrivalTime/)
    assert.match(source, /returnTimeCalBlay/)
  })
})

test('la fase logística recupera la tornada a Cal Blay en reobrir el quadrant', () => {
  const hydrated = hydrateLogisticPhaseFromDraft(
    {
      id: 'event-1__event__2026-10-02__group',
      startDate: '2026-10-02',
      endDate: '2026-10-02',
      startTime: '10:00',
      endTime: '23:59',
      arrivalTime: '09:30',
      returnTimeCalBlay: '00:45',
      phaseType: 'event',
    },
    'event',
    {
      startDate: '2026-10-02',
      endDate: '2026-10-02',
      startTime: '',
      endTime: '',
      workers: 0,
      drivers: 0,
      meetingPoint: 'CENTRAL',
    }
  )

  assert.equal(hydrated.form.arrivalTime, '09:30')
  assert.equal(hydrated.form.returnTimeCalBlay, '00:45')
})
