const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  readAppJwt,
  jwtUserId,
  jwtUserName,
  jwtRoleFields,
  jwtDepartmentFields,
  jwtSessionEmail,
} = require('../src/lib/appJwtPayload')

test('readAppJwt returns empty object for non-objects', () => {
  assert.deepEqual(readAppJwt(null), {})
  assert.deepEqual(readAppJwt(undefined), {})
  assert.deepEqual(readAppJwt('token'), {})
  assert.deepEqual(readAppJwt(12), {})
  assert.equal(readAppJwt({ id: 'u1' }).id, 'u1')
})

test('jwtUserId prefers id over sub and trims', () => {
  assert.equal(jwtUserId({ id: ' user-1 ', sub: 'ignored' }), 'user-1')
  assert.equal(jwtUserId({ sub: ' from-sub ' }), 'from-sub')
  assert.equal(jwtUserId({}), '')
  assert.equal(jwtUserId(null), '')
})

test('jwtUserName prefers top-level name over nested user.name', () => {
  assert.equal(jwtUserName({ name: ' Anna ', user: { name: 'Other' } }), 'Anna')
  assert.equal(jwtUserName({ user: { name: '  Pau ' } }), 'Pau')
  assert.equal(jwtUserName({}), '')
})

test('jwtRoleFields prefers userRole over role', () => {
  assert.equal(jwtRoleFields({ userRole: 'cap', role: 'treballador' }), 'cap')
  assert.equal(jwtRoleFields({ role: 'admin' }), 'admin')
  assert.equal(jwtRoleFields({}), '')
})

test('jwtDepartmentFields walks department aliases in order', () => {
  assert.equal(
    jwtDepartmentFields({
      department: 'Serveis',
      userDepartment: 'ignored',
      dept: 'ignored',
      departmentName: 'ignored',
    }),
    'Serveis'
  )
  assert.equal(
    jwtDepartmentFields({
      userDepartment: 'Cuina',
      dept: 'ignored',
      departmentName: 'ignored',
    }),
    'Cuina'
  )
  assert.equal(jwtDepartmentFields({ dept: 'Logistica' }), 'Logistica')
  assert.equal(jwtDepartmentFields({ departmentName: 'Qualitat' }), 'Qualitat')
  assert.equal(jwtDepartmentFields({}), '')
})

test('jwtSessionEmail prefers nested user.email over top-level email', () => {
  assert.equal(
    jwtSessionEmail({ user: { email: 'a@calblay.com' }, email: 'b@calblay.com' }),
    'a@calblay.com'
  )
  assert.equal(jwtSessionEmail({ email: 'solo@calblay.com' }), 'solo@calblay.com')
  assert.equal(jwtSessionEmail({ user: {} }), '')
})
