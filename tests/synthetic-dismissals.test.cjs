const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const {
  SYNTHETIC_DISMISSAL_ID_LIMIT,
  SYNTHETIC_DISMISSAL_SCOPES,
  normalizeSyntheticDismissalIds,
  normalizeSyntheticDismissalScope,
} = require('../src/lib/notifications/syntheticDismissals')

test('synthetic dismissal scopes are only incidents and roba_personal', () => {
  assert.deepEqual([...SYNTHETIC_DISMISSAL_SCOPES], ['incidents', 'roba_personal'])
  assert.equal(normalizeSyntheticDismissalScope('incidents'), 'incidents')
  assert.equal(normalizeSyntheticDismissalScope(' roba_personal '), 'roba_personal')
  assert.equal(normalizeSyntheticDismissalScope('Incidents'), null)
  assert.equal(normalizeSyntheticDismissalScope('projects'), null)
  assert.equal(normalizeSyntheticDismissalScope(''), null)
  assert.equal(normalizeSyntheticDismissalScope(null), null)
})

test('synthetic dismissal ids trim, dedupe, drop blanks, and cap at 500', () => {
  assert.deepEqual(normalizeSyntheticDismissalIds(undefined), [])
  assert.deepEqual(normalizeSyntheticDismissalIds('action-1'), [])
  assert.deepEqual(
    normalizeSyntheticDismissalIds([' action-1 ', '', null, 'action-1', 'action-2']),
    ['action-1', 'action-2']
  )

  const overflow = Array.from({ length: SYNTHETIC_DISMISSAL_ID_LIMIT + 25 }, (_, i) => `id-${i}`)
  const capped = normalizeSyntheticDismissalIds(overflow)
  assert.equal(capped.length, SYNTHETIC_DISMISSAL_ID_LIMIT)
  assert.equal(capped[0], 'id-0')
  assert.equal(capped[SYNTHETIC_DISMISSAL_ID_LIMIT - 1], `id-${SYNTHETIC_DISMISSAL_ID_LIMIT - 1}`)
})

test('synthetic dismissal API and hook share the normalizers', () => {
  const route = readFileSync(
    join(__dirname, '../src/app/api/notifications/synthetic-dismissals/route.ts'),
    'utf8'
  )
  const hook = readFileSync(
    join(__dirname, '../src/hooks/useSyntheticNotificationDismissals.ts'),
    'utf8'
  )

  assert.match(route, /normalizeSyntheticDismissalScope/)
  assert.match(route, /normalizeSyntheticDismissalIds/)
  assert.match(hook, /normalizeSyntheticDismissalIds/)
})
