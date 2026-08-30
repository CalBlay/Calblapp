const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (
    request === '@/lib/media/compressVideoForUpload' ||
    /[\\/]src[\\/]lib[\\/]media[\\/]compressVideoForUpload\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return {
      DEFAULT_MAX_VIDEO_UPLOAD_BYTES: 5 * 1024 * 1024,
      MAX_VIDEO_INPUT_BYTES: 80 * 1024 * 1024,
      MAX_VIDEO_DURATION_SECONDS: 120,
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  isTicketImageMime,
  isTicketVideoMime,
  isTicketVideoUrl,
  isTicketDocumentMime,
  isTicketDocumentName,
  extensionForVideoMime,
  formatTicketAttachmentLimitMb,
} = require('../src/lib/media/ticketAttachments')

after(() => {
  Module._load = originalLoad
})

test('isTicketDocumentMime accepts office/pdf/text and rejects images and empty types', () => {
  assert.equal(isTicketDocumentMime('application/pdf'), true)
  assert.equal(isTicketDocumentMime('APPLICATION/PDF'), true)
  assert.equal(
    isTicketDocumentMime(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),
    true
  )
  assert.equal(isTicketDocumentMime('application/msword'), true)
  assert.equal(isTicketDocumentMime('application/vnd.ms-excel'), true)
  assert.equal(isTicketDocumentMime('text/plain'), true)
  assert.equal(isTicketDocumentMime('image/jpeg'), false)
  assert.equal(isTicketDocumentMime('video/mp4'), false)
  assert.equal(isTicketDocumentMime('application/octet-stream'), false)
  assert.equal(isTicketDocumentMime(''), false)
})

test('isTicketDocumentName matches document extensions including query strings', () => {
  assert.equal(isTicketDocumentName('informe.PDF'), true)
  assert.equal(isTicketDocumentName('notes.docx?dl=1'), true)
  assert.equal(isTicketDocumentName('sheet.xlsx'), true)
  assert.equal(isTicketDocumentName('readme.txt'), true)
  assert.equal(isTicketDocumentName('photo.jpg'), false)
  assert.equal(isTicketDocumentName('clip.mp4'), false)
  assert.equal(isTicketDocumentName(''), false)
})

test('image/video mime and URL helpers classify uploads used by maintenance and spaces', () => {
  assert.equal(isTicketImageMime('image/png'), true)
  assert.equal(isTicketImageMime('IMAGE/JPEG'), true)
  assert.equal(isTicketImageMime('video/mp4'), false)
  assert.equal(isTicketVideoMime('video/webm'), true)
  assert.equal(isTicketVideoMime('application/pdf'), false)
  assert.equal(isTicketVideoUrl('https://cdn.example/clip.MOV'), true)
  assert.equal(isTicketVideoUrl('https://cdn.example/clip.mp4?token=1'), true)
  assert.equal(isTicketVideoUrl('https://cdn.example/clip.pdf'), false)
  assert.equal(extensionForVideoMime('video/quicktime'), 'mov')
  assert.equal(extensionForVideoMime('video/webm'), 'webm')
  assert.equal(extensionForVideoMime('video/x-msvideo'), 'avi')
  assert.equal(extensionForVideoMime('video/mp4'), 'mp4')
  assert.equal(formatTicketAttachmentLimitMb(10 * 1024 * 1024), '10 MB')
})
