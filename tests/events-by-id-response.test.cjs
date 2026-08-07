const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  buildStageVerdEventByIdResponse,
  pickEventClockTime,
} = require('../src/lib/eventsByIdResponse')

test('pickEventClockTime keeps HH:mm and falls back otherwise', () => {
  assert.equal(pickEventClockTime('09:30', '12:00'), '09:30')
  assert.equal(pickEventClockTime('09:30:00', '12:00'), '09:30')
  assert.equal(pickEventClockTime('bad', '12:00'), '12:00')
  assert.equal(pickEventClockTime(undefined, '12:00'), '12:00')
})

test('buildStageVerdEventByIdResponse maps stage_verd commercial fields', () => {
  const payload = buildStageVerdEventByIdResponse('evt-1', {
    NomEvent: 'Casament / nota interna',
    DataInici: '2026-08-10',
    DataFi: '2026-08-10',
    HoraInici: '18:00',
    HoraFi: '23:30',
    Ubicacio: 'Mas Cal Blay',
    code: 'CB-100',
    Comercial: 'Anna',
    ComercialIntern: 'Pau',
    Responsable: 'Marc',
    Servei: 'Banquet',
    LN: 'BODA',
  })

  assert.equal(payload.id, 'evt-1')
  assert.equal(payload.summary, 'Casament')
  assert.equal(payload.location, 'Mas Cal Blay')
  assert.equal(payload.start.dateTime, '2026-08-10T18:00:00')
  assert.equal(payload.end.dateTime, '2026-08-10T23:30:00')
  assert.equal(payload.code, 'CB-100')
  assert.equal(payload.Comercial, 'Anna')
  assert.equal(payload.ComercialIntern, 'Pau')
  assert.equal(payload.Responsable, 'Marc')
  assert.equal(payload.Servei, 'Banquet')
  assert.equal(payload.LN, 'BODA')
  assert.equal(payload.source, 'firestore')
})

test('GET /api/events/[id] requires auth before stage_verd Admin SDK read', () => {
  const routePath = path.join(
    __dirname,
    '..',
    'src',
    'app',
    'api',
    'events',
    '[id]',
    'route.ts'
  )
  const source = fs.readFileSync(routePath, 'utf8')
  const authIdx = source.indexOf('requireAuth()')
  const denyIdx = source.indexOf('if (!auth.ok) return auth.res')
  const readIdx = source.indexOf("db.collection('stage_verd')")
  assert.ok(authIdx >= 0, 'route must call requireAuth()')
  assert.ok(denyIdx >= 0, 'route must return auth failure response')
  assert.ok(readIdx >= 0, 'route must still read stage_verd')
  assert.ok(authIdx < denyIdx && denyIdx < readIdx, 'auth gate must precede Firestore read')
})
