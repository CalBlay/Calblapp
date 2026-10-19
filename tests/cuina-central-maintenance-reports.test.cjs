const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('Cuina Central embeds maintenance reports with a fixed scoped query', () => {
  const page = read('src/app/menu/cuina-central/informes/page.tsx')
  const panel = read('src/components/informes/domains/MaintenanceInformesPanel.tsx')

  assert.match(page, /MaintenanceInformesPanel scope="cuina_central"/)
  assert.doesNotMatch(page, /api\/cuina-central\/reports/)
  assert.doesNotMatch(page, />\s*Producció\s*</)
  assert.match(panel, /params\.set\('scope', scope\)/)
})

test('maintenance report APIs allow the Cuina Central reports path only for the scoped query', () => {
  for (const relativePath of [
    'src/app/api/reports/maintenance/overview/route.ts',
    'src/app/api/reports/maintenance/filter-options/route.ts',
  ]) {
    const source = read(relativePath)
    assert.match(source, /scope.*=== 'cuina_central'/)
    assert.match(source, /path: '\/menu\/cuina-central\/informes'/)
    assert.match(source, /!canViewGeneralReports && !canViewCuinaCentralReports/)
  }
})

test('the Cuina Central scope excludes other tickets and preventive maintenance', () => {
  const builder = read('src/lib/informes/buildMaintenanceOverview.ts')

  assert.match(builder, /!isCuinaCentralMaintenanceTicket\(data\)/)
  assert.match(builder, /params\.scope === 'cuina_central' \? \[\] : preventiusRaw/)
})

test('unused production and daily decisions pages are removed from Cuina Central', () => {
  const subnav = read('src/app/menu/cuina-central/components/CuinaCentralSubnav.tsx')
  const accessControl = read('src/lib/accessControl.ts')

  assert.doesNotMatch(subnav, /cuina-central\/(produccio|decisions)/)
  assert.doesNotMatch(accessControl, /cuina-central\/(produccio|decisions)/)
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src/app/menu/cuina-central/produccio/page.tsx')),
    false
  )
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src/app/menu/cuina-central/decisions/page.tsx')),
    false
  )
})

test('Cuina Central data only exposes and loads machines', () => {
  const page = read('src/app/menu/cuina-central/dades/page.tsx')

  assert.match(page, /api\/cuina-central\/machines/)
  assert.match(page, /entity="machines"/)
  assert.doesNotMatch(page, /api\/cuina-central\/(articles|shifts|rates)/)
  assert.doesNotMatch(page, /Articles \(Bases\)|Torns producció|Rendiment teòric/)
  assert.match(page, /onClick=\{\(\) => openMachine\(machine\)\}/)
  assert.match(page, /<Dialog open=/)
  assert.match(page, /Desar canvis/)
  assert.match(page, /void deleteMachine\(\)/)
  assert.doesNotMatch(page, /<EditableDataTable/)
  assert.match(page, /machineCode: selectedMachine\.code/)
  assert.match(page, /Historial de tiquets/)
  assert.match(page, /Veure historial/)
  assert.match(page, /if \(!historyVisible \|\| !selectedMachine\?\.code\) return/)
  assert.match(page, /onClick=\{\(\) => setHistoryVisible\(true\)\}/)
  assert.match(page, /manteniment\/tickets\?ticketId=/)
  assert.match(page, /Cerca per codi, nom, zona o ubicació/)
  assert.match(page, /normalize\('NFD'\)/)
  assert.match(page, /tokens\.every\(\(token\) => searchable\.includes\(token\)\)/)
  assert.match(page, /filteredMachines\.map/)
})

test('maintenance tickets API supports machine history filtering', () => {
  const route = read('src/app/api/maintenance/tickets/route.ts')

  assert.match(route, /searchParams\.get\('machineCode'\)/)
  assert.match(route, /machine\.startsWith\(`\$\{normalizedMachineCode\}/)
  assert.match(route, /hasMachineCode: Boolean\(machineCode\)/)
})
