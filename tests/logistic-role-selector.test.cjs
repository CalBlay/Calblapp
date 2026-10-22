const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/app/menu/quadrants/[id]/components/LogisticRoleLineRow.tsx'
  ),
  'utf8'
)

test('the logistics role selector commits with Radix onValueChange', () => {
  assert.match(source, /onValueChange=\{\(value\) => handleRoleChange/)
  assert.match(source, /<SelectItem value="conductor">Conductor<\/SelectItem>/)
  assert.doesNotMatch(
    source,
    /<select\s+value=\{line\.role\}[\s\S]*?aria-label="Rol"/
  )
})

test('the logistics editor hydrates each opened draft version only once', () => {
  const hookSource = fs.readFileSync(
    path.join(
      process.cwd(),
      'src/app/menu/quadrants/[id]/hooks/useLogisticsPhasesState.ts'
    ),
    'utf8'
  )

  assert.match(hookSource, /if \(hydratedKeyRef\.current === hydrationKey\) return/)
  assert.match(hookSource, /hydratedKeyRef\.current = hydrationKey/)
  assert.match(hookSource, /const hydratedKeyRef = useRef\(hydrationKey\)/)
  assert.match(hookSource, /hydrateLogisticPhaseFromDraft\([\s\S]*existingDraft/)
})
