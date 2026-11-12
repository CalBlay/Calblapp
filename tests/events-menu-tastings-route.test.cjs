const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')

test('events list builds menu tastings with the shared calendar grouping', () => {
  const source = read('src/app/api/events/list/route.ts')

  assert.match(source, /buildMenuTastingOccurrence/)
  assert.match(source, /groupWeddingMenuTastingOccurrences\(codedTastingOccurrences\)/)
  assert.match(source, /queryStageCollectionDocsByDateFieldInRange/)
  assert.match(source, /const eventsInRange = \[\.\.\.expandedByRange, \.\.\.menuTastings\]/)
  assert.match(source, /isMenuTasting: true/)
  assert.match(source, /sourceEventIds/)
  assert.match(source, /stage_taronja/)
  assert.match(source, /stage_groc/)
  assert.match(source, /codedTastingOccurrences/)
})

test('quadrants only expose coded menu tastings from every commercial stage', () => {
  const source = read('src/lib/quadrantEvents.ts')

  assert.match(source, /stage_taronja/)
  assert.match(source, /stage_groc/)
  assert.match(source, /codedTastingOccurrences/)
})

test('calendar lets current editors assign codes to menu tastings before stage verd', () => {
  const source = read('src/components/calendar/CalendarModal.tsx')

  assert.match(source, /isZohoVerd \|\| isManual \|\| isMenuTasting/)
  assert.match(source, /canEditGroupedMenuTastingCodes/)
  assert.match(source, /placeholder="Codi del projecte"/)
})

test('calendar PM reads the same event code including the Zoho C_digo field', () => {
  const calendarRangeSource = read('src/lib/api/calendarEventsRange.ts')
  assert.match(
    calendarRangeSource,
    /code: d\.code \|\| d\.Code \|\| d\.C_digo \|\| d\.codi \|\| d\.Codi \|\| ''/
  )
})

test('events UI opens every source document for a grouped menu tasting', () => {
  const pageSource = read('src/app/menu/events/page.tsx')
  const modalSource = read('src/components/events/EventMenuModal.tsx')

  assert.match(pageSource, /eventIds=\{docsEvent\.eventIds\}/)
  assert.match(pageSource, /sourceEvents=\{docsEvent\.sourceEvents\}/)
  assert.match(modalSource, /eventIds=\{event\.sourceEventIds\}/)
  assert.match(modalSource, /sourceEvents=\{event\.sourceEvents\}/)
})
