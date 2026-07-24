const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  classifyStage,
  collectUntrackedZohoDealIds,
} = require('../src/services/zoho/sync-normalization')

test('classifyStage maps confirmed / budget / warm stages', () => {
  assert.equal(classifyStage('Cerrada ganada'), 'verd')
  assert.equal(classifyStage('Pressupost enviat'), 'groc')
  assert.equal(classifyStage('Calentet'), 'taronja')
})

test('classifyStage returns null for cancelled / lost stages', () => {
  assert.equal(classifyStage('Cerrada perdida'), null)
  assert.equal(classifyStage('Cancelado'), null)
  assert.equal(classifyStage(''), null)
})

test('collectUntrackedZohoDealIds returns only deals that left tracked stages', () => {
  const ids = collectUntrackedZohoDealIds([
    { id: 'keep-verd', Stage: 'Cerrada ganada' },
    { id: 'keep-groc', Stage: 'Proposta enviada' },
    { id: 'drop-lost', Stage: 'Cerrada perdida' },
    { id: 'drop-cancel', Stage: 'Cancelado' },
    { id: 'drop-lost', Stage: 'Cerrada perdida' },
    { id: '', Stage: 'Cancelado' },
    { id: 'no-stage', Stage: null },
  ])

  assert.deepEqual(ids, ['drop-lost', 'drop-cancel', 'no-stage'])
})

test('collectUntrackedZohoDealIds accepts a custom classifier', () => {
  const ids = collectUntrackedZohoDealIds(
    [
      { id: 'a', Stage: 'tracked' },
      { id: 'b', Stage: 'gone' },
    ],
    (stage) => (stage === 'tracked' ? 'verd' : null)
  )

  assert.deepEqual(ids, ['b'])
})
