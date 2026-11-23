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
  assert.equal(fs.existsSync(path.join(ROOT, 'src/app/menu/cuina-central/produccio/page.tsx')), false)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/app/menu/cuina-central/decisions/page.tsx')), false)
})

test('Cuina Central data reuses the complete maintenance data page and permissions', () => {
  const page = read('src/app/menu/cuina-central/dades/page.tsx')
  const maintenancePage = read('src/app/menu/manteniment/dades/page.tsx')
  const panel = read('src/app/menu/manteniment/dades/components/MachinesPanel.tsx')
  const auth = read('src/lib/server/maintenanceApiAuth.ts')
  const clientLayout = read('src/app/ClientLayout.tsx')
  const moduleLayout = read('src/app/menu/cuina-central/layout.tsx')

  assert.match(page, /import MaintenanceDataPage from '@\/app\/menu\/manteniment\/dades\/page'/)
  assert.match(page, /return <MaintenanceDataPage \/>/)
  assert.match(maintenancePage, /api\/maintenance\/data\/machines/)
  assert.match(maintenancePage, /<MachinesPanel/)
  assert.match(maintenancePage, /<PreventiusTemplatesContent/)
  assert.match(maintenancePage, /<SuppliersPanel/)
  assert.match(maintenancePage, /<CentersPanel/)
  assert.match(maintenancePage, /<ResolutionCategoriesPanel/)
  assert.match(maintenancePage, /isCuinaCentral \? '\?source=cuina-central' : ''/)
  assert.doesNotMatch(page, /api\/cuina-central\/(articles|shifts|rates)/)
  assert.match(panel, /detailHrefBase/)
  assert.match(panel, /detailHrefSuffix/)
  assert.match(auth, /CUINA_CENTRAL_DATA_PATH = '\/menu\/cuina-central\/dades'/)
  assert.match(auth, /canEditUiPath\(\{ user: auth\.user, path: CUINA_CENTRAL_DATA_PATH \}\)/)
  assert.match(clientLayout, /pathname\.startsWith\('\/menu\/cuina-central\/dades'\)/)
  assert.match(moduleLayout, /isWideWorkspace/)
  assert.match(moduleLayout, /pathname\.startsWith\('\/menu\/cuina-central\/dades'\)/)
})

test('maintenance tickets API supports machine history filtering', () => {
  const route = read('src/app/api/maintenance/tickets/route.ts')

  assert.match(route, /searchParams\.get\('machineCode'\)/)
  assert.match(route, /machine\.startsWith\(`\$\{normalizedMachineCode\}/)
  assert.match(route, /hasMachineCode: Boolean\(machineCode\)/)
})
