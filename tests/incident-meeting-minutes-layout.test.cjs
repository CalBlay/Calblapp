const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildIncidentsMeetingMinutesHtml,
} = require('../src/lib/incidentsMeetingMinutes')

test('incident meeting minutes place attendance first and notes last', () => {
  const html = buildIncidentsMeetingMinutesHtml({
    incidents: [],
    filters: { from: '2026-09-01', to: '2026-09-02' },
    meetingNotes: 'Notes finals',
    generatedAtIso: '2026-09-02T10:00:00.000Z',
    attendance: [
      { name: 'Persona assistent', attendance: 'in_person' },
    ],
  })

  const attendancePosition = html.indexOf('<section class="attendance">')
  const incidentsPosition = html.indexOf('Cap incidència')
  const notesPosition = html.indexOf('<section class="notes">')

  assert.ok(attendancePosition >= 0)
  assert.ok(incidentsPosition > attendancePosition)
  assert.ok(notesPosition > incidentsPosition)
  assert.match(html, /0 incidències/)
  assert.match(html, /Període: 01\/09\/2026 – 02\/09\/2026/)
  assert.match(html, /class="attendance-row"/)
  assert.doesNotMatch(html, /<section class="attendance">[\s\S]*?<ul>/)
})

test('meeting comment uses a full-width row below the incident', () => {
  const html = buildIncidentsMeetingMinutesHtml({
    incidents: [{
      id: 'inc-1',
      createdAt: '2026-09-02T09:00:00.000Z',
      department: 'Serveis',
      description: 'Descripció original',
      incidentNumber: 'INC0001',
      eventId: 'event-1',
      eventTitle: 'Casament',
      eventDate: '2026-09-02',
      importance: 'normal',
      status: 'obert',
      meetingComment: 'Comentari ampli\nSegona línia',
    }],
    filters: { from: '2026-09-01', to: '2026-09-02' },
    meetingNotes: '',
    generatedAtIso: '2026-09-02T10:00:00.000Z',
    attendance: [],
  })

  const descriptionPosition = html.indexOf('Descripció original')
  const commentPosition = html.indexOf('Comentari ampli<br/>Segona línia')
  assert.ok(descriptionPosition >= 0)
  assert.ok(commentPosition > descriptionPosition)
  assert.match(html, /<tr class="meeting-comment-row"><td colspan="7">/)
  assert.doesNotMatch(html, /<th>Comentari de la reunió<\/th>/)
})
