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
  assert.equal(shouldImportZohoAttachment('PM proposta.pdf'), true)
  assert.equal(shouldImportZohoAttachment('PM1_proposta.pdf'), true)
  assert.equal(shouldImportZohoAttachment('PM2 proposta.pdf'), true)
  assert.equal(shouldImportZohoAttachment('PMS-proposta.pdf'), true)
  assert.equal(shouldImportZohoAttachment('TM_menu-antic.pdf'), true)
  assert.equal(shouldImportZohoAttachment('TM2_menu-antic.pdf'), true)
})

test('shouldImportZohoAttachment still rejects non-prefix and punctuation-without-separator names', () => {
  assert.equal(shouldImportZohoAttachment('FM.encarrec.pdf'), false)
  assert.equal(shouldImportZohoAttachment('contracte FT 123.pdf'), false)
  assert.equal(shouldImportZohoAttachment(''), false)
  assert.equal(shouldImportZohoAttachment('NOTES.pdf'), false)
  assert.equal(shouldImportZohoAttachment('FTX123.pdf'), false)
  assert.equal(shouldImportZohoAttachment('PM3_menu.pdf'), false)
})
