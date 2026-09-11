const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

test('Serveis auto-assign treats totalWorkers as staff slots', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/services/autoAssign.ts'),
    'utf8'
  )
  assert.match(src, /serveisRequestedStaffSlots\(/)
  assert.doesNotMatch(src, /calculateServeisStaffSlots\(/)
})

test('Serveis compact headcount adds responsable because workers are staff-only', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/lib/quadrantsPost/buildServeisPhaseRequests.ts'),
    'utf8'
  )
  assert.match(src, /Number\(g\.workers \|\| 0\) \+ Number\(g\.drivers \|\| 0\) \+ \(wantsResp \? 1 : 0\)/)
})

test('collapsing a Serveis editor marks dirty on role-line patches', () => {
  const editor = fs.readFileSync(
    path.join(__dirname, '../src/app/menu/quadrants/[id]/components/QuadrantModal.tsx'),
    'utf8'
  )
  const panel = fs.readFileSync(
    path.join(__dirname, '../src/app/menu/quadrants/[id]/components/ServicePhasePanel.tsx'),
    'utf8'
  )
  assert.match(editor, /updateServiceGroupAndMarkDirty/)
  assert.match(editor, /dirtyRef\.current = true/)
  assert.match(editor, /updateGroup=\{updateServiceGroupAndMarkDirty\}/)
  assert.match(panel, /parseServiceWorkerSlotInput/)
})
