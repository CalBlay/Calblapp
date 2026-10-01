const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')
const ROUTES = [
  'src/app/api/reports/rrhh/overview/route.ts',
  'src/app/api/reports/rrhh/filter-options/route.ts',
  'src/app/api/reports/transports/overview/route.ts',
  'src/app/api/reports/transports/filter-options/route.ts',
  'src/app/api/reports/maintenance/overview/route.ts',
  'src/app/api/reports/maintenance/filter-options/route.ts',
  'src/app/api/reports/events-workers/overview/route.ts',
  'src/app/api/reports/events-workers/filter-options/route.ts',
]

test('cada API d informes exigeix el permis especific de la seva pestanya', () => {
  for (const relativePath of ROUTES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    assert.match(source, /await requireAuth\(\)/, `${relativePath} ha d'exigir sessio`)
    assert.match(
      source,
      /canViewReportsDomain\(auth\.user, '(rrhh|transports|maintenance|events)'\)/,
      `${relativePath} ha d'exigir el permis de la pestanya d'informes`
    )
    assert.doesNotMatch(
      source,
      /requireRoles\(auth, \['admin', 'direccio'\]\)/,
      `${relativePath} no ha de limitar RRHH als rols globals`
    )
  }
})
