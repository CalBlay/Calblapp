const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  extractFileNameFromContentDisposition,
  sanitizeStorageName,
} = require('../src/services/zoho/attachmentFileNames')

test('extractFileNameFromContentDisposition prefers RFC 5987 UTF-8 filename*', () => {
  const header =
    "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''FT%20tast%20Pla%C3%A0.pdf"
  assert.equal(extractFileNameFromContentDisposition(header), 'FT tast Plaà.pdf')
})

test('extractFileNameFromContentDisposition uses quoted filename when UTF-8 is absent', () => {
  assert.equal(
    extractFileNameFromContentDisposition('attachment; filename="FM encarrec.docx"'),
    'FM encarrec.docx'
  )
})

test('extractFileNameFromContentDisposition uses unquoted filename tokens', () => {
  assert.equal(
    extractFileNameFromContentDisposition('inline; filename=FT-123.pdf'),
    'FT-123.pdf'
  )
})

test('extractFileNameFromContentDisposition returns empty for missing or junk headers', () => {
  assert.equal(extractFileNameFromContentDisposition(null), '')
  assert.equal(extractFileNameFromContentDisposition(''), '')
  assert.equal(extractFileNameFromContentDisposition('attachment'), '')
})

test('extractFileNameFromContentDisposition keeps invalid percent-encoding instead of throwing', () => {
  assert.equal(
    extractFileNameFromContentDisposition("attachment; filename*=UTF-8''FT%ZZ.pdf"),
    'FT%ZZ.pdf'
  )
})

test('sanitizeStorageName strips accents and collapses unsafe characters', () => {
  assert.equal(sanitizeStorageName('  FT tast Plaà (v2).pdf  '), 'FT_tast_Plaa_v2_.pdf')
  assert.equal(sanitizeStorageName('FM__encarrec--ok.docx'), 'FM_encarrec--ok.docx')
})

test('sanitizeStorageName falls back when the name is empty after sanitizing', () => {
  const name = sanitizeStorageName('   ***   ')
  assert.match(name, /^attachment-\d+$/)
})
