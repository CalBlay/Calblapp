const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  getQuadrantEventGroupMeta,
  getQuadrantEventBlockVisualStyle,
} = require('../src/lib/quadrantEventGroupMeta')

function phase(overrides = {}) {
  return {
    id: 'E1',
    summary: 'Event',
    start: '2026-08-01',
    end: '2026-08-01',
    quadrantStatus: 'pending',
    ...overrides,
  }
}

test('getQuadrantEventGroupMeta counts pending/draft/confirmed phases', () => {
  const meta = getQuadrantEventGroupMeta([
    phase({ quadrantStatus: 'confirmed' }),
    phase({ quadrantStatus: 'draft' }),
    phase({ quadrantStatus: 'draft' }),
    phase({ quadrantStatus: undefined }),
  ])

  assert.deepEqual(meta, {
    pendingCount: 1,
    draftCount: 2,
    confirmedCount: 1,
    phaseCount: 4,
    hasOverlapWarning: false,
    hasSurvey: false,
  })
})

test('getQuadrantEventGroupMeta flags overlap from attention notes or violations', () => {
  const fromAttention = getQuadrantEventGroupMeta([
    phase({
      quadrantStatus: 'draft',
      draft: {
        attentionNotes: ['Anna ja està assignat a un altre quadrant'],
      },
    }),
  ])
  assert.equal(fromAttention.hasOverlapWarning, true)

  const fromViolation = getQuadrantEventGroupMeta([
    phase({
      quadrantStatus: 'confirmed',
      draft: { violations: ['person_double_booked'] },
    }),
  ])
  assert.equal(fromViolation.hasOverlapWarning, true)

  const clean = getQuadrantEventGroupMeta([
    phase({
      quadrantStatus: 'draft',
      draft: {
        attentionNotes: ['Falta conductor'],
        violations: ['missing_driver'],
      },
    }),
  ])
  assert.equal(clean.hasOverlapWarning, false)
})

test('getQuadrantEventGroupMeta passes through survey flag', () => {
  const meta = getQuadrantEventGroupMeta([phase()], { hasSurvey: true })
  assert.equal(meta.hasSurvey, true)
})

test('getQuadrantEventBlockVisualStyle prioritizes pending then draft then confirmed', () => {
  const pending = getQuadrantEventBlockVisualStyle(
    {
      pendingCount: 2,
      draftCount: 1,
      confirmedCount: 0,
      phaseCount: 3,
      hasOverlapWarning: false,
      hasSurvey: false,
    },
    false
  )
  assert.equal(pending.statusLabel, '2 fases pendents')
  assert.match(pending.accent, /yellow/)

  const draft = getQuadrantEventBlockVisualStyle(
    {
      pendingCount: 0,
      draftCount: 1,
      confirmedCount: 2,
      phaseCount: 3,
      hasOverlapWarning: false,
      hasSurvey: false,
    },
    true
  )
  assert.equal(draft.statusLabel, '1 esborrany')
  assert.match(draft.accent, /blue/)

  const confirmed = getQuadrantEventBlockVisualStyle(
    {
      pendingCount: 0,
      draftCount: 0,
      confirmedCount: 2,
      phaseCount: 2,
      hasOverlapWarning: false,
      hasSurvey: false,
    },
    false
  )
  assert.equal(confirmed.statusLabel, 'Tot confirmat')
  assert.match(confirmed.accent, /green/)
})
