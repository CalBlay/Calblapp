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
