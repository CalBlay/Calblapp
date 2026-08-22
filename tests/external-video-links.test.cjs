const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  GOOGLE_PHOTOS_VIDEO_MIME,
  isGooglePhotosVideoUrl,
  normalizeGooglePhotosVideoRef,
  googlePhotosVideoViewUrl,
} = require('../src/lib/googlePhotosVideoLink')
const {
  extractGoogleDriveFileId,
  normalizeGoogleDriveVideoRef,
  isGoogleDriveVideoRef,
} = require('../src/lib/googleDriveVideoLink')
const {
  parsePastedSpaceMediaUrl,
  readSpaceMedia,
  writeSpaceMediaPayload,
} = require('../src/lib/spaces/spaceMedia')

test('isGooglePhotosVideoUrl accepts official hosts and photos: prefix, rejects lookalikes', () => {
  assert.equal(isGooglePhotosVideoUrl('https://photos.app.goo.gl/abc'), true)
  assert.equal(isGooglePhotosVideoUrl('https://photos.google.com/share/xyz'), true)
  assert.equal(
    isGooglePhotosVideoUrl('https://albums.photos.google.com/share/xyz'),
    true
  )
  assert.equal(isGooglePhotosVideoUrl('photos:https://photos.app.goo.gl/abc'), true)
  assert.equal(isGooglePhotosVideoUrl('photos.app.goo.gl/abc'), true)

  assert.equal(isGooglePhotosVideoUrl(''), false)
  assert.equal(isGooglePhotosVideoUrl('https://example.com/photos'), false)
  assert.equal(
    isGooglePhotosVideoUrl('https://photos.google.com.evil.test/share/xyz'),
    false
  )
  assert.equal(isGooglePhotosVideoUrl('https://photos.app.goo.gl.evil.test/abc'), false)
})

test('normalizeGooglePhotosVideoRef returns viewUrl and strips photos: prefix', () => {
  const share = 'https://photos.app.goo.gl/clip'
  assert.deepEqual(normalizeGooglePhotosVideoRef(share), {
    ref: share,
    viewUrl: share,
  })
  assert.deepEqual(normalizeGooglePhotosVideoRef(`photos:${share}`), {
    ref: share,
    viewUrl: share,
  })
  assert.equal(normalizeGooglePhotosVideoRef('https://example.com/x'), null)
  assert.equal(googlePhotosVideoViewUrl(''), null)
})

test('extractGoogleDriveFileId reads drive: refs, /d/ paths, and id query params', () => {
  assert.equal(extractGoogleDriveFileId('drive:FILE_1-id'), 'FILE_1-id')
  assert.equal(extractGoogleDriveFileId('drive:'), null)
  assert.equal(
    extractGoogleDriveFileId('https://drive.google.com/file/d/abc123XYZ/view'),
    'abc123XYZ'
  )
  assert.equal(
    extractGoogleDriveFileId('https://docs.google.com/open?id=docId99'),
    'docId99'
  )
  assert.equal(extractGoogleDriveFileId('https://example.com/file/d/abc123/view'), null)
  assert.equal(extractGoogleDriveFileId('not a url'), null)
  assert.equal(extractGoogleDriveFileId(''), null)
})

test('normalizeGoogleDriveVideoRef stores drive:id and a view URL', () => {
  assert.deepEqual(
    normalizeGoogleDriveVideoRef('https://drive.google.com/file/d/abc123/view?usp=sharing'),
    {
      ref: 'drive:abc123',
      viewUrl: 'https://drive.google.com/file/d/abc123/view',
    }
  )
  assert.equal(isGoogleDriveVideoRef('drive:abc123'), true)
  assert.equal(isGoogleDriveVideoRef('https://evil.example/file/d/abc123/view'), false)
})

test('parsePastedSpaceMediaUrl classifies Google Photos, videos, and generic http images', () => {
  const photos = parsePastedSpaceMediaUrl('https://photos.app.goo.gl/clip')
  assert.deepEqual(photos, {
    kind: 'google-photos',
    url: 'https://photos.app.goo.gl/clip',
    mimeType: GOOGLE_PHOTOS_VIDEO_MIME,
  })

  assert.deepEqual(parsePastedSpaceMediaUrl('https://cdn.example.com/clip.mp4'), {
    kind: 'video',
    url: 'https://cdn.example.com/clip.mp4',
  })
  assert.deepEqual(parsePastedSpaceMediaUrl('https://cdn.example.com/photo.JPG?w=800'), {
    kind: 'image',
    url: 'https://cdn.example.com/photo.JPG?w=800',
  })
  assert.deepEqual(parsePastedSpaceMediaUrl('https://cdn.example.com/no-extension'), {
    kind: 'image',
    url: 'https://cdn.example.com/no-extension',
  })

  assert.equal(parsePastedSpaceMediaUrl(''), null)
  assert.equal(parsePastedSpaceMediaUrl('not a url'), null)
  assert.equal(parsePastedSpaceMediaUrl('   '), null)
})

test('readSpaceMedia prefers media[] and falls back to legacy images', () => {
  assert.deepEqual(readSpaceMedia(null), [])
  assert.deepEqual(
    readSpaceMedia({
      media: [
        { kind: 'video', url: 'https://cdn.example.com/a.mp4' },
        { url: '' },
        'https://cdn.example.com/b.jpg',
      ],
    }),
    [
      { kind: 'video', url: 'https://cdn.example.com/a.mp4', mimeType: null },
      { kind: 'image', url: 'https://cdn.example.com/b.jpg' },
    ]
  )
  assert.deepEqual(
    readSpaceMedia({ images: ['https://cdn.example.com/legacy.png', ''] }),
    [{ kind: 'image', url: 'https://cdn.example.com/legacy.png', mimeType: null }]
  )
})

test('writeSpaceMediaPayload drops empty urls and mirrors image urls into images[]', () => {
  assert.deepEqual(
    writeSpaceMediaPayload([
      { kind: 'image', url: ' https://cdn.example.com/a.jpg ' },
      { kind: 'video', url: 'https://cdn.example.com/b.mp4', mimeType: 'video/mp4' },
      { kind: 'google-photos', url: '' },
    ]),
    {
      media: [
        { kind: 'image', url: 'https://cdn.example.com/a.jpg', mimeType: null },
        {
          kind: 'video',
          url: 'https://cdn.example.com/b.mp4',
          mimeType: 'video/mp4',
        },
      ],
      images: ['https://cdn.example.com/a.jpg'],
    }
  )
})
