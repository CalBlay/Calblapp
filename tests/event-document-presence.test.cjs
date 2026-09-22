const test = require('node:test')
const assert = require('node:assert/strict')

const {
  eventRecordHasAttachedDocuments,
} = require('../src/lib/events/eventDocumentPresence.ts')

test('detecta tots els tipus de documents visibles a Esdeveniments i Quadrants', () => {
  for (const key of ['file1', 'zohoFile2', 'cuinaFile3', 'visitVideo1']) {
    assert.equal(eventRecordHasAttachedDocuments({ [key]: '/document.pdf' }), true)
  }
})

test('ignora metadades, camps no compatibles i valors buits', () => {
  assert.equal(
    eventRecordHasAttachedDocuments({
      file1Name: 'document.pdf',
      file1MimeType: 'application/pdf',
      file1: '   ',
      attachment1: '/altre.pdf',
    }),
    false
  )
})
