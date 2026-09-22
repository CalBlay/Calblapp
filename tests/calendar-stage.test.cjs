const assert = require('node:assert/strict')
const { test } = require('node:test')

require('./register.cjs')

const {
  calendarStageDotClass,
  calendarStageFilterForCollection,
  calendarStagePresentation,
} = require('../src/lib/calendar/calendarStage')
const { COLORS_STAGE } = require('../src/lib/colors')

test('stage_groc is Pressupost/Pendent with a yellow dot', () => {
  assert.equal(calendarStageFilterForCollection('stage_groc'), 'pressupost')
  assert.equal(calendarStagePresentation('stage_groc').label, 'Pressupost / Pendent')
  assert.equal(calendarStageDotClass('stage_groc'), COLORS_STAGE.pendent)
})

test('stage_taronja is Prereserva/Calentet with an orange dot', () => {
  assert.equal(calendarStageFilterForCollection('stage_taronja'), 'calentet')
  assert.equal(calendarStagePresentation('stage_taronja').label, 'Prereserva / Calentet')
  assert.equal(calendarStageDotClass('stage_taronja'), COLORS_STAGE.prereserva)
})

test('legend palette keeps yellow and orange clearly distinct', () => {
  assert.equal(COLORS_STAGE.pendent, 'bg-yellow-300')
  assert.equal(COLORS_STAGE.prereserva, 'bg-orange-500')
  assert.notEqual(COLORS_STAGE.pendent, COLORS_STAGE.prereserva)
})

test('stage_verd remains Confirmat with a green dot', () => {
  assert.equal(calendarStageFilterForCollection('stage_verd'), 'confirmat')
  assert.equal(calendarStageDotClass('stage_verd'), COLORS_STAGE.confirmat)
})
