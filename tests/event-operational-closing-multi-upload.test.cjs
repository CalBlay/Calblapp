const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')
const read = (file) => readFileSync(join(root, file), 'utf8')

test('event audit gallery accepts and processes multiple selected files', () => {
  const source = read('src/components/events/EventAuditExecutionModal.tsx')

  assert.match(source, /ref=\{galleryInputRef\}[\s\S]*?multiple/)
  assert.match(source, /Array\.from\(event\.currentTarget\.files \|\| \[\]\)/)
  assert.match(source, /const uploadPhotos = async/)
  assert.match(source, /selectedFiles\.map\(async \(file\)/)
  assert.doesNotMatch(source, /event\.currentTarget\.files\?\.\[0\]/)
})

test('audit batch uploads use collision-safe storage paths', () => {
  const source = read('src/app/api/auditoria/upload-image/route.ts')

  assert.match(source, /randomUUID\(\)/)
})

test('incident attachments keep their existing multi-file picker', () => {
  const source = read('src/components/incidents/CreateIncidentModal.tsx')

  assert.match(source, /accept="image\/\*,video\/\*"[\s\S]*?multiple/)
  assert.match(source, /handleImageChange\(e\.target\.files\)/)
})
