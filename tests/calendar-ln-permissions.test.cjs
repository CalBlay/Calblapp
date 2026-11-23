const assert = require('node:assert/strict')
const { test } = require('node:test')

require('./register.cjs')

const {
  CALENDAR_LN_PERMISSION,
  calendarLnOptionsForScope,
  calendarLnScopeIdsForPermission,
  isCalendarLnAllowed,
  normalizeCalendarLn,
} = require('@/lib/calendar/calendarLn')

test('calendar LN normalization includes restaurant aliases and Green Vita', () => {
  assert.equal(normalizeCalendarLn('Restauració'), 'grups restaurants')
  assert.equal(normalizeCalendarLn('GrupsRestaurants'), 'grups restaurants')
  assert.equal(normalizeCalendarLn('GREEN  VITA'), 'green vita')
})

test('project-scoped calendar allows become an LN allowlist', () => {
  const assignment = {
    overrides: [
      {
        permission: CALENDAR_LN_PERMISSION.create,
        effect: 'allow',
        scope: 'project',
        scopeId: 'Grups Restaurants',
      },
      {
        permission: CALENDAR_LN_PERMISSION.create,
        effect: 'allow',
        scope: 'project',
        scopeId: 'Green Vita',
      },
      {
        permission: CALENDAR_LN_PERMISSION.update,
        effect: 'allow',
        scope: 'project',
        scopeId: 'Empresa',
      },
    ],
  }

  assert.deepEqual(
    calendarLnScopeIdsForPermission(assignment, CALENDAR_LN_PERMISSION.create),
    ['grups restaurants', 'green vita']
  )
  assert.equal(isCalendarLnAllowed('Green Vita', ['grups restaurants', 'green vita']), true)
  assert.equal(isCalendarLnAllowed('Empresa', ['grups restaurants', 'green vita']), false)
  assert.deepEqual(
    calendarLnOptionsForScope(['grups restaurants', 'green vita']).map((option) => option.label),
    ['Grups Restaurants', 'Green Vita']
  )
})

test('users without project-scoped allows keep unrestricted calendar access', () => {
  assert.equal(calendarLnScopeIdsForPermission(null, CALENDAR_LN_PERMISSION.create), null)
  assert.equal(isCalendarLnAllowed('Empresa', null), true)
})
