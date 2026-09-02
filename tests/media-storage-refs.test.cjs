const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === 'firebase-admin/storage') {
    return { getDownloadURL: async () => '' }
  }
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {}, storageAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  extractOwnedStoragePath,
  toMillis,
  cleanText,
  mergeContextField,
  aggregateMedia,
  mediaIndexDocId,
  mediaRefKey,
} = require('../src/lib/media/collectMediaRefs')

after(() => {
  Module._load = originalLoad
})

test('extractOwnedStoragePath only returns paths under the given bucket prefix', () => {
  assert.equal(extractOwnedStoragePath('', 'my-bucket'), null)
  assert.equal(extractOwnedStoragePath('   ', 'my-bucket'), null)
  assert.equal(extractOwnedStoragePath('not a url', 'my-bucket'), null)
  assert.equal(
    extractOwnedStoragePath('https://storage.googleapis.com/other-bucket/incidents/a.jpg', 'my-bucket'),
    null
  )
  assert.equal(
    extractOwnedStoragePath(
      'https://storage.googleapis.com/my-bucket/incidents/evt-1/a.jpg',
      'my-bucket'
    ),
    'incidents/evt-1/a.jpg'
  )
  assert.equal(
    extractOwnedStoragePath(
      'https://storage.googleapis.com/my-bucket/path%20with%20spaces/file.png',
      'my-bucket'
    ),
    'path with spaces/file.png'
  )
})

test('toMillis accepts numbers, ISO strings, and toDate(); invalid values are 0', () => {
  assert.equal(toMillis(1_700_000_000_000), 1_700_000_000_000)
  assert.equal(toMillis(Number.NaN), 0)
  assert.equal(toMillis('2026-08-30T10:00:00.000Z'), Date.parse('2026-08-30T10:00:00.000Z'))
  assert.equal(toMillis('not-a-date'), 0)
  assert.equal(toMillis({ toDate: () => new Date('2026-01-02T00:00:00.000Z') }), Date.parse('2026-01-02T00:00:00.000Z'))
  assert.equal(toMillis({ toDate: 'nope' }), 0)
  assert.equal(toMillis(null), 0)
  assert.equal(cleanText('  hello  '), 'hello')
  assert.equal(cleanText(undefined), '')
})

test('mergeContextField prefers a non-empty next value and otherwise keeps prev', () => {
  assert.equal(mergeContextField('old', 'new'), 'new')
  assert.equal(mergeContextField('old', '  '), 'old')
  assert.equal(mergeContextField('old', null), 'old')
  assert.equal(mergeContextField(undefined, undefined), null)
  assert.equal(mergeContextField('  ', ''), null)
})

test('aggregateMedia merges the same path, unions sources, and keeps the newest timestamp', () => {
  const items = aggregateMedia([
    {
      source: 'incidents',
      docId: 'i1',
      createdAt: 100,
      url: null,
      path: 'shared/a.jpg',
      size: null,
      type: null,
      title: '',
      incidentEventId: 'evt-1',
    },
    {
      source: 'maintenance',
      docId: 'm1',
      createdAt: 250,
      url: 'https://cdn.example/a.jpg',
      path: 'shared/a.jpg',
      size: 12,
      type: 'image/jpeg',
      title: 'Ticket photo',
      incidentEventId: null,
    },
    {
      source: 'audits',
      docId: 'a1',
      createdAt: 80,
      url: 'https://cdn.example/b.jpg',
      path: 'other/b.jpg',
      size: 4,
      type: 'image/png',
      title: 'Audit',
      auditEventId: 'aud-1',
    },
  ])

  assert.equal(items.length, 2)
  assert.equal(items[0].path, 'shared/a.jpg')
  assert.equal(items[0].referenceCount, 2)
  assert.deepEqual(items[0].sourceKinds, ['incidents', 'maintenance'])
  assert.equal(items[0].url, 'https://cdn.example/a.jpg')
  assert.equal(items[0].size, 12)
  assert.equal(items[0].type, 'image/jpeg')
  assert.equal(items[0].createdAt, 250)
  assert.equal(items[0].title, 'Ticket photo')
  assert.equal(items[0].incidentEventId, 'evt-1')
  assert.equal(items[1].path, 'other/b.jpg')
  assert.equal(items[1].auditEventId, 'aud-1')
})

test('mediaIndexDocId is sha256 hex of the path; mediaRefKey includes optional suffix', () => {
  assert.equal(
    mediaIndexDocId('incidents/a.jpg'),
    createHash('sha256').update('incidents/a.jpg', 'utf8').digest('hex')
  )
  assert.equal(mediaRefKey({ source: 'incidents', docId: 'doc-1' }), 'incidents__doc-1')
  assert.equal(
    mediaRefKey({ source: 'audits', docId: 'doc-2', refSuffix: ' photo-3 ' }),
    'audits__doc-2__photo-3'
  )
})
