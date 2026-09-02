const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

test('desktop and mobile incidents show an indicator when a meeting comment exists', () => {
  for (const relativePath of [
    'src/app/menu/incidents/components/IncidentsRow.tsx',
    'src/app/menu/incidents/components/IncidentsMobileCard.tsx',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    assert.match(source, /Boolean\(initialMeetingComment\?\.trim\(\)\)/)
    assert.match(source, /MessageSquareText/)
    assert.match(source, /Té comentari de reunió/)
  }
})
