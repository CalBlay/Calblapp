const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')

require('./register.cjs')

const {
  calendarAttachmentFieldKeys,
  isAllowedCalendarAttachmentField,
  isAllowedCalendarManualAttachField,
  isAllowedCalendarManualCollection,
  pickCalendarManualPutFields,
} = require('@/lib/calendar/calendarManualCollection')

const MODAL_OVERRIDE_FIELDS = new Set([
  'LN',
  'code',
  'NomEvent',
  'DataInici',
  'DataFi',
  'HoraInici',
  'HoraFi',
  'NumPax',
  'Ubicacio',
  'Servei',
  'Comercial',
  'ComercialIntern',
  'Responsable',
])

test('allows only Zoho stage_* collections for calendar manual mutations', () => {
  assert.equal(isAllowedCalendarManualCollection('stage_verd'), true)
  assert.equal(isAllowedCalendarManualCollection('stage_groc'), true)
  assert.equal(isAllowedCalendarManualCollection('stage_taronja'), true)
  assert.equal(isAllowedCalendarManualCollection('users'), false)
  assert.equal(isAllowedCalendarManualCollection('maintenanceTickets'), false)
  assert.equal(isAllowedCalendarManualCollection('permissions'), false)
  assert.equal(isAllowedCalendarManualCollection(''), false)
  assert.equal(isAllowedCalendarManualCollection(null), false)
})

test('attach fields must be fileN slots', () => {
  assert.equal(isAllowedCalendarManualAttachField('file1'), true)
  assert.equal(isAllowedCalendarManualAttachField('file12'), true)
  assert.equal(isAllowedCalendarManualAttachField('role'), false)
  assert.equal(isAllowedCalendarManualAttachField('file1Name'), false)
  assert.equal(isAllowedCalendarManualAttachField('../../etc'), false)
})

test('calendar attachment deletion accepts only manual and Zoho slots', () => {
  assert.equal(isAllowedCalendarAttachmentField('file1'), true)
  assert.equal(isAllowedCalendarAttachmentField('zohoFile12'), true)
  assert.equal(isAllowedCalendarAttachmentField('file1Name'), false)
  assert.equal(isAllowedCalendarAttachmentField('otherFile1'), false)
  assert.deepEqual(calendarAttachmentFieldKeys('zohoFile2'), [
    'zohoFile2',
    'zohoFile2Name',
    'zohoFile2MimeType',
    'zohoFile2AttachmentId',
    'zohoFile2ModifiedTime',
    'zohoFile2Size',
    'zohoFile2Path',
    'zohoFile2Source',
  ])
})

test('PUT picker keeps modal + attachment fields and drops privilege keys', () => {
  const picked = pickCalendarManualPutFields(
    {
      NomEvent: 'Casament',
      code: 'AB-1',
      codeConfirmed: true,
      file1: null,
      file1Name: 'doc.pdf',
      role: 'admin',
      isAdmin: true,
      collection: 'users',
    },
    MODAL_OVERRIDE_FIELDS
  )

  assert.deepEqual(picked, {
    NomEvent: 'Casament',
    code: 'AB-1',
    codeConfirmed: true,
    file1: null,
    file1Name: 'doc.pdf',
  })
  assert.equal(Object.prototype.hasOwnProperty.call(picked, 'role'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(picked, 'isAdmin'), false)
})

test('calendar manual route guards POST and PUT with stage_* allowlist', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/calendar/manual/[id]/route.ts'),
    'utf8'
  )

  assert.match(source, /isAllowedCalendarManualCollection/)
  assert.match(source, /pickCalendarManualPutFields/)
  assert.match(source, /isAllowedCalendarManualAttachField/)

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const re = new RegExp(
      `export\\s+async\\s+function\\s+${method}\\b[\\s\\S]*?(?=export\\s+async\\s+function\\s+(?:GET|POST|PUT|PATCH|DELETE)\\b|$)`
    )
    const body = source.match(re)?.[0] || ''
    assert.ok(body.includes('isAllowedCalendarManualCollection'), `${method} must validate collection`)
  }
})

test('calendar email route rejects non-stage collections before Admin SDK read', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/calendar/manual/[id]/email/route.ts'),
    'utf8'
  )
  assert.match(source, /isAllowedCalendarManualCollection/)
  const guardIdx = source.indexOf('isAllowedCalendarManualCollection(collection)')
  const readIdx = source.indexOf('db.collection(collection).doc(id).get()')
  assert.ok(guardIdx >= 0, 'email route must validate collection')
  assert.ok(readIdx >= 0, 'email route must still read the document')
  assert.ok(guardIdx < readIdx, 'collection guard must run before Admin SDK read')
})

test('calendar attachment DELETE requires its permission and validates field and collection', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/calendar/manual/[id]/attachments/[field]/route.ts'),
    'utf8'
  )
  assert.match(source, /CALENDAR_PERM\.deleteDocuments/)
  assert.match(source, /isAllowedCalendarAttachmentField\(field\)/)
  assert.match(source, /isAllowedCalendarManualCollection\(collection\)/)
  assert.match(source, /FieldValue\.delete\(\)/)
})
