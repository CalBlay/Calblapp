const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

test('the original incident description is read-only in the table and mobile card', () => {
  for (const relativePath of [
    'src/app/menu/incidents/components/IncidentsRow.tsx',
    'src/app/menu/incidents/components/IncidentsMobileCard.tsx',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    assert.doesNotMatch(source, /editValues\.description/)
    assert.doesNotMatch(source, /applyPatch\(inc\.id,\s*\{\s*description/)
  }
})

test('the incident update API does not accept description changes', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/incidents/[id]/route.ts'),
    'utf8'
  )
  const patchableBlock = source.match(/const PATCHABLE = new Set\(\[([\s\S]*?)\]\)/)?.[1] || ''
  assert.doesNotMatch(patchableBlock, /['"]description['"]/) // Immutable after creation.
  assert.doesNotMatch(source, /cleaned\.description\s*=/)
})
