const assert = require('node:assert/strict')
const { test } = require('node:test')

const { shouldImportZohoAttachment } = require('../src/services/zoho/attachments')

test('shouldImportZohoAttachment accepts prefix + space/underscore/hyphen/digit (adjunts)', () => {
  assert.equal(shouldImportZohoAttachment('FT 123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FT_123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FT-123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FT123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FT'), true)
  assert.equal(shouldImportZohoAttachment('fg_contracte.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FC 07022024_AURA.pptx'), true)
})

test('shouldImportZohoAttachment still rejects non-prefix and punctuation-without-separator names', () => {
  assert.equal(shouldImportZohoAttachment('FM.encarrec.pdf'), false)
  assert.equal(shouldImportZohoAttachment('contracte FT 123.pdf'), false)
  assert.equal(shouldImportZohoAttachment(''), false)
  assert.equal(shouldImportZohoAttachment('NOTES.pdf'), false)
  assert.equal(shouldImportZohoAttachment('FTX123.pdf'), false)
})
