const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  shouldNotifyMarketingCategoryChange,
} = require('../src/lib/incidentMarketingCategory')

test('marketing notification is triggered when an incident enters any 9XX category', () => {
  assert.equal(shouldNotifyMarketingCategoryChange('101', '901'), true)
  assert.equal(shouldNotifyMarketingCategoryChange('401', '999'), true)
})

test('marketing notification is triggered when the 9XX subcategory changes', () => {
  assert.equal(shouldNotifyMarketingCategoryChange('901', '902'), true)
})

test('marketing notification ignores unchanged or non-marketing categories', () => {
  assert.equal(shouldNotifyMarketingCategoryChange('901', '901'), false)
  assert.equal(shouldNotifyMarketingCategoryChange('901', '401'), false)
  assert.equal(shouldNotifyMarketingCategoryChange('', ''), false)
})
