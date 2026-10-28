const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')

test('events list builds menu tastings with the shared calendar grouping', () => {
  const source = read('src/app/api/events/list/route.ts')

  assert.match(source, /buildMenuTastingOccurrence/)
  assert.match(source, /groupWeddingMenuTastingOccurrences\(tastingOccurrences\)/)
  assert.match(source, /queryStageCollectionDocsByDateFieldInRange/)
  assert.match(source, /const eventsInRange = \[\.\.\.expandedByRange, \.\.\.menuTastings\]/)
  assert.match(source, /isMenuTasting: true/)
  assert.match(source, /sourceEventIds/)
})

test('events UI opens every source document for a grouped menu tasting', () => {
  const pageSource = read('src/app/menu/events/page.tsx')
  const modalSource = read('src/components/events/EventMenuModal.tsx')

  assert.match(pageSource, /eventIds=\{docsEvent\.eventIds\}/)
  assert.match(pageSource, /sourceEvents=\{docsEvent\.sourceEvents\}/)
  assert.match(modalSource, /eventIds=\{event\.sourceEventIds\}/)
  assert.match(modalSource, /sourceEvents=\{event\.sourceEvents\}/)
})
