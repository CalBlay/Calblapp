import { buildBootstrapAssignmentUpdate } from '../src/lib/permissions/bootstrapAssignments'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const update = buildBootstrapAssignmentUpdate(
  { id: 'user-1', role: 'CAP', department: ' manteniment ' },
  'admin-1',
  '2026-06-06T11:00:00.000Z'
)

assert(update !== null, 'builds an update for a valid user id')
assert(update?.userId === 'user-1', 'preserves user id')
assert(update?.base.role === 'cap', 'normalizes role')
assert(update?.base.department === 'manteniment', 'trims department')
assert(update?.updatedBy === 'admin-1', 'sets updatedBy')

const keys = Object.keys(update || {})
assert(!keys.includes('overrides'), 'bootstrap update must not overwrite overrides')
assert(!keys.includes('permissionSets'), 'bootstrap update must not overwrite permissionSets')

assert(
  buildBootstrapAssignmentUpdate({ id: '   ' }, 'admin-1', '2026-06-06T11:00:00.000Z') === null,
  'blank user ids are skipped'
)

console.log('permissions bootstrap helper tests passed')
