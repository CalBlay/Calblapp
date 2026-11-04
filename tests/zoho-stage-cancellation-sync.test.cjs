const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const source = fs.readFileSync(
  path.join(__dirname, '../src/services/zoho/sync.ts'),
  'utf8'
)

test('Zoho lost stages cancel both verd and taronja documents', () => {
  assert.match(
    source,
    /cancelLostZohoDealsInStage\('stage_verd', existingVerd, zohoById\)/
  )
  assert.match(
    source,
    /cancelLostZohoDealsInStage\('stage_taronja', existingTaronja, zohoById\)/
  )
})

test('full sync preserves lost Zoho documents in stage_taronja', () => {
  assert.match(source, /name === 'stage_taronja'/)
  assert.match(source, /isLostZohoStage\(zohoById\.get\(id\)\?\.Stage \|\| ''\)/)
})

test('full sync cancels stage_verd documents removed from Zoho', () => {
  assert.doesNotMatch(source, /const zoho = zohoById\.get\(id\)\s+if \(!zoho\) continue/)
  assert.match(
    source,
    /if \(!zoho\) \{[\s\S]*cancelled: true[\s\S]*'zoho-record-missing'[\s\S]*ja no existeix a Zoho/
  )
  assert.doesNotMatch(
    source,
    /if \(!zoho\) \{\s*verdCleanupBatch\.delete\(doc\.ref\)/
  )
})
