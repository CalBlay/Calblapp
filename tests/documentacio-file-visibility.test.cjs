const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  documentacioFileVisibleToViewer,
  slugifyDocumentacioTopicTitle,
  isValidDocumentacioTopicSlug,
  isValidDocumentacioAmbitSlug,
  humanizeDocumentacioTopicSlug,
  getAmbitDisplayTitle,
  isStaticDocumentacioAmbit,
} = require('../src/lib/documentacio-structure')

test('documentacioFileVisibleToViewer: admin sees all; others need empty or matching department', () => {
  const restricted = { id: 'f1', label: 'Protocol', departments: ['Cuina Central'] }
  const general = { id: 'f2', label: 'General' }

  assert.equal(
    documentacioFileVisibleToViewer({
      file: restricted,
      viewerRole: 'admin',
      viewerDepartment: 'Serveis',
    }),
    true
  )
  assert.equal(
    documentacioFileVisibleToViewer({
      file: restricted,
      viewerRole: 'direccio',
      viewerDepartment: 'Serveis',
    }),
    false
  )
  assert.equal(
    documentacioFileVisibleToViewer({
      file: restricted,
      viewerRole: 'treballador',
      viewerDepartment: 'cuina central',
    }),
    true
  )
  assert.equal(
    documentacioFileVisibleToViewer({
      file: restricted,
      viewerRole: 'treballador',
      viewerDepartment: 'Logística',
    }),
    false
  )
  assert.equal(
    documentacioFileVisibleToViewer({
      file: general,
      viewerRole: 'treballador',
      viewerDepartment: 'Logística',
    }),
    true
  )
  assert.equal(
    documentacioFileVisibleToViewer({
      file: { id: 'f3', label: 'Empty', departments: [] },
      viewerRole: 'cap',
      viewerDepartment: 'Serveis',
    }),
    true
  )
})

test('documentacio slugs fold accents, reject invalid shapes, and humanize fallbacks', () => {
  assert.equal(slugifyDocumentacioTopicTitle('Cuina Central!'), 'cuina-central')
  assert.equal(slugifyDocumentacioTopicTitle('  '), 'tema')
  assert.equal(isValidDocumentacioTopicSlug('cuina-central'), true)
  assert.equal(isValidDocumentacioTopicSlug('-bad'), false)
  assert.equal(isValidDocumentacioTopicSlug('Has Space'), false)
  assert.equal(isValidDocumentacioAmbitSlug('formacions'), true)
  assert.equal(isStaticDocumentacioAmbit('formacions'), true)
  assert.equal(isStaticDocumentacioAmbit('custom-ambit'), false)
  assert.equal(humanizeDocumentacioTopicSlug('cuina-central'), 'Cuina Central')
  assert.equal(getAmbitDisplayTitle('formacions'), 'Formacions')
  assert.equal(getAmbitDisplayTitle('custom-ambit', '  Títol guardat '), 'Títol guardat')
  assert.equal(getAmbitDisplayTitle('custom-ambit'), 'Custom Ambit')
})
