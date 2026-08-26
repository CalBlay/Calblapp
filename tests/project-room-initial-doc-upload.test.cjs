const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  fillRoomInitialDocumentUploadForm,
  roomInitialDocumentUploadOmitsProjectSnapshot,
  ROOM_INITIAL_DOCUMENT_UPLOAD_FORBIDDEN_FIELDS,
} = require('../src/lib/projects/roomInitialDocumentUpload')

const ROOT = path.join(__dirname, '..')

test('room initial-document form only sends the file fields', () => {
  const form = fillRoomInitialDocumentUploadForm(new FormData(), new Blob(['pdf']), 'pla.pdf')

  assert.equal(form.get('fileCategory'), 'initial')
  assert.equal(form.get('fileLabel'), 'pla.pdf')
  assert.ok(form.get('file'))
  assert.equal(roomInitialDocumentUploadOmitsProjectSnapshot(form), true)
  for (const field of ROOM_INITIAL_DOCUMENT_UPLOAD_FORBIDDEN_FIELDS) {
    assert.equal(form.get(field), null, `must not send ${field}`)
  }
})

test('room GET returns a privacy-scoped blocks/rooms snapshot', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/projects/[id]/rooms/[roomId]/route.ts'),
    'utf8'
  )
  assert.match(source, /blocks:\s*linkedBlock\s*\?\s*\[linkedBlock\]\s*:\s*\[\]/)
  assert.match(source, /rooms:\s*\[room\]/)
})

test('room page uses the document-only upload helper and does not PATCH truncated arrays', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/menu/projects/[id]/rooms/[roomId]/page.tsx'),
    'utf8'
  )
  assert.match(source, /fillRoomInitialDocumentUploadForm/)
  assert.doesNotMatch(
    source,
    /form\.set\(\s*['"]blocks['"]/,
    'room page must not send blocks on project PATCH'
  )
  assert.doesNotMatch(
    source,
    /form\.set\(\s*['"]rooms['"]/,
    'room page must not send rooms on project PATCH'
  )
  assert.match(source, /method:\s*['"]PATCH['"]/)
})
