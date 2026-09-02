const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  if (
    request === '@/services/sharepoint/graph' ||
    /[\\/]src[\\/]services[\\/]sharepoint[\\/]graph\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { getSiteAndDrive: async () => ({}), getGraphToken: async () => ({}) }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  parseSharePointItemId,
  fileNameFromUrl,
} = require('../src/lib/calendar/calendarEmail')

after(() => {
  Module._load = originalLoad
})

test('parseSharePointItemId requires /api/sharepoint/file and a non-empty itemId', () => {
  assert.equal(parseSharePointItemId(''), null)
  assert.equal(parseSharePointItemId('   '), null)
  assert.equal(parseSharePointItemId('not a url :::'), null)
  assert.equal(
    parseSharePointItemId('https://app.example/api/sharepoint/browse?itemId=abc'),
    null
  )
  assert.equal(
    parseSharePointItemId('https://app.example/api/sharepoint/file'),
    null
  )
  assert.equal(
    parseSharePointItemId('https://app.example/api/sharepoint/file?itemId='),
    null
  )
})

test('parseSharePointItemId reads itemId from absolute and relative SharePoint file URLs', () => {
  assert.equal(
    parseSharePointItemId('https://app.example/api/sharepoint/file?itemId=01ABC'),
    '01ABC'
  )
  assert.equal(
    parseSharePointItemId('/api/sharepoint/file?itemId=rel-id&download=1'),
    'rel-id'
  )
  assert.equal(
    parseSharePointItemId('  /api/sharepoint/file?itemId=%20trim-me%20  '),
    'trim-me'
  )
})

test('fileNameFromUrl keeps the fallback for SharePoint file links and otherwise uses the path', () => {
  assert.equal(
    fileNameFromUrl('https://app.example/api/sharepoint/file?itemId=01ABC', 'carta.pdf'),
    'carta.pdf'
  )
  assert.equal(
    fileNameFromUrl('https://cdn.example/docs/menu%20final.pdf'),
    'menu final.pdf'
  )
  assert.equal(fileNameFromUrl('/folder/only/', 'fallback.doc'), 'fallback.doc')
  assert.equal(fileNameFromUrl('', 'empty.doc'), 'empty.doc')
  assert.equal(fileNameFromUrl('http://', 'broken.doc'), 'broken.doc')
})
