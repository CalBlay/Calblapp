const assert = require('node:assert/strict')
const { test } = require('node:test')

const { isLikelyImageFile } = require('../src/lib/media/isLikelyImageFile')

test('isLikelyImageFile accepts image MIME types even without a filename', () => {
  assert.equal(isLikelyImageFile({ type: 'image/jpeg' }), true)
  assert.equal(isLikelyImageFile({ type: 'IMAGE/PNG', name: 'x.bin' }), true)
  assert.equal(isLikelyImageFile({ type: 'application/pdf', name: 'scan.pdf' }), false)
  assert.equal(isLikelyImageFile(null), false)
  assert.equal(isLikelyImageFile(undefined), false)
})

test('isLikelyImageFile treats Android gallery files with empty type as images by extension', () => {
  assert.equal(isLikelyImageFile({ type: '', name: 'IMG_0001.HEIC' }), true)
  assert.equal(isLikelyImageFile({ name: 'photo.JPEG' }), true)
  assert.equal(isLikelyImageFile({ type: 'application/octet-stream', name: 'clip.webp' }), true)
  assert.equal(isLikelyImageFile({ type: '', name: 'notes.txt' }), false)
  assert.equal(isLikelyImageFile({ type: '', name: 'noext' }), false)
})
