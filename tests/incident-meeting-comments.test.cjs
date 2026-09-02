const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  INCIDENT_MEETING_COMMENT_MAX_LENGTH,
  serializeIncidentMeetingComments,
} = require('../src/lib/incidentMeetingSession')

test('meeting comments are serialized per incident and malformed rows are ignored', () => {
  const comments = serializeIncidentMeetingComments({
    'inc-1': {
      incidentId: 'inc-1',
      text: 'Acord de la reunió',
      updatedAt: '2026-09-02T10:00:00.000Z',
      updatedByName: 'Usuari',
    },
    empty: { incidentId: 'empty', text: '   ' },
    malformed: null,
  })

  assert.deepEqual(Object.keys(comments), ['inc-1'])
  assert.equal(comments['inc-1'].text, 'Acord de la reunió')
  assert.equal(comments['inc-1'].updatedByName, 'Usuari')
})

test('meeting comments are capped to the editor limit', () => {
  const comments = serializeIncidentMeetingComments({
    'inc-1': { text: 'x'.repeat(INCIDENT_MEETING_COMMENT_MAX_LENGTH + 20) },
  })
  assert.equal(comments['inc-1'].text.length, INCIDENT_MEETING_COMMENT_MAX_LENGTH)
})
