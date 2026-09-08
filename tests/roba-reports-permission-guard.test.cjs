const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')
const ROUTES = [
  'src/app/api/reports/rrhh/overview/route.ts',
  'src/app/api/reports/rrhh/filter-options/route.ts',
]

test('els informes RRHH de roba fan servir el permis especific de la pestanya', () => {
  for (const relativePath of ROUTES) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    assert.match(source, /await requireAuth\(\)/, `${relativePath} ha d'exigir sessio`)
    assert.match(
      source,
      /requireRobaTabView\(auth, ROBA_SUBMODULE_PATHS\.informes\)/,
      `${relativePath} ha d'exigir el permis de Roba personal - Informes`
    )
    assert.doesNotMatch(
      source,
      /requireRoles\(auth, \['admin', 'direccio'\]\)/,
      `${relativePath} no ha de limitar RRHH als rols globals`
    )
  }
})
