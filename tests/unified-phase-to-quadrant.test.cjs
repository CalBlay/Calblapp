const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  draftToQuadrantEvent,
  unifiedPhaseToQuadrantEvent,
} = require('../src/lib/unifiedPhaseToQuadrantEvent')

test('unifiedPhaseToQuadrantEvent keeps the base event id before __ phase suffixes', () => {
  const event = unifiedPhaseToQuadrantEvent({
    id: 'evt123__muntatge',
    eventId: 'evt123__serveis',
    summary: '  Sopar  ',
    title: 'ignored',
    start: '2026-08-28T18:00:00.000Z',
    end: '',
    displayStartTime: '18:00',
    startTime: '17:00',
    displayEndTime: '23:00',
    location: 'Masía',
    meetingPoint: '',
    phaseKey: 'muntatge',
    phaseType: '',
    phaseDate: '2026-08-29',
    service: 'sopar',
    numPax: 80,
    code: 'CB1',
    department: 'serveis',
    responsable: 'Anna',
  })

  assert.equal(event.id, 'evt123')
  assert.equal(event.summary, 'Sopar')
  assert.equal(event.start, '2026-08-28T18:00:00.000Z')
  assert.equal(event.end, '2026-08-28T18:00:00.000Z')
  assert.equal(event.startTime, '18:00')
  assert.equal(event.endTime, '23:00')
  assert.equal(event.eventLocation, 'Masía')
  assert.equal(event.meetingPoint, 'Masía')
  assert.equal(event.phaseKey, 'muntatge')
  assert.equal(event.phaseType, 'muntatge')
})

test('unifiedPhaseToQuadrantEvent falls back to phaseDate and a dash summary', () => {
  const event = unifiedPhaseToQuadrantEvent({
    id: '  phase-only__deco  ',
    summary: '',
    title: '',
    phaseDate: '2026-08-28T09:15:00.000Z',
  })

  assert.equal(event.id, 'phase-only')
  assert.equal(event.summary, '-')
  assert.equal(event.start, '2026-08-28T00:00:00.000Z')
  assert.equal(event.end, '2026-08-28T00:00:00.000Z')
  assert.equal(event.phaseKey, 'event')
  assert.equal(event.phaseType, 'event')
})

test('draftToQuadrantEvent strips composite ids and reads location objects', () => {
  const fromAddress = draftToQuadrantEvent({
    id: 'draft-9__cuina',
    eventName: 'Brunch',
    startDate: '2026-08-28T00:00:00.000Z',
    endDate: '2026-08-29T12:00:00.000Z',
    startTime: '09:00',
    endTime: '14:00',
    location: { address: '  Ctra. 12  ', name: 'ignored' },
    meetingPoint: '',
    phaseType: '  ',
    responsableName: 'Pau',
    responsable: { name: 'Other' },
    code: 'B1',
    department: 'cuina',
    service: null,
    numPax: 12,
  })

  assert.equal(fromAddress.id, 'draft-9')
  assert.equal(fromAddress.summary, 'Brunch')
  assert.equal(fromAddress.start, '2026-08-28T00:00:00.000Z')
  assert.equal(fromAddress.end, '2026-08-29T00:00:00.000Z')
  assert.equal(fromAddress.location, 'Ctra. 12')
  assert.equal(fromAddress.eventLocation, 'Ctra. 12')
  assert.equal(fromAddress.meetingPoint, 'Ctra. 12')
  assert.equal(fromAddress.phaseType, 'event')
  assert.equal(fromAddress.phaseKey, 'event')
  assert.equal(fromAddress.responsable, 'Pau')
})

test('draftToQuadrantEvent prefers nested responsable name and location.name', () => {
  const event = draftToQuadrantEvent({
    id: 'plain',
    eventName: '',
    startDate: '2026-08-28',
    location: { name: 'Sala 2' },
    responsableName: { label: 'not a string' },
    responsable: { name: 'Laia' },
  })

  assert.equal(event.id, 'plain')
  assert.equal(event.summary, '-')
  assert.equal(event.location, 'Sala 2')
  assert.equal(event.responsable, 'Laia')
  assert.equal(event.start, '2026-08-28T00:00:00.000Z')
  assert.equal(event.end, '2026-08-28T00:00:00.000Z')
})
