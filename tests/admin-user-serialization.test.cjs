const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  resolveAdminVisiblePassword,
  serializeAdminUserResponse,
  stripPassword,
} = require('../src/lib/server/userApiSerialization')

const BCRYPT_SAMPLE = '$2b$10$abcdefghijklmnopqrstuv'

test('resolveAdminVisiblePassword shows plaintext and hides bcrypt hashes', () => {
  assert.equal(resolveAdminVisiblePassword({ password: 'secret-plain' }), 'secret-plain')
  assert.equal(resolveAdminVisiblePassword({ password: '  secret-plain  ' }), 'secret-plain')
  assert.equal(resolveAdminVisiblePassword({ password: BCRYPT_SAMPLE }), '')
  assert.equal(resolveAdminVisiblePassword({ password: ` ${BCRYPT_SAMPLE} ` }), '')
  assert.equal(resolveAdminVisiblePassword({ password: '' }), '')
  assert.equal(resolveAdminVisiblePassword({}), '')
  assert.equal(resolveAdminVisiblePassword({ password: null }), '')
})

test('serializeAdminUserResponse strips adminPassword and never returns hashes', () => {
  assert.deepEqual(
    serializeAdminUserResponse('u-1', {
      name: 'Ada',
      email: 'ada@example.test',
      password: 'visible-plain',
      adminPassword: 'must-not-leak',
      role: 'admin',
    }),
    {
      id: 'u-1',
      name: 'Ada',
      email: 'ada@example.test',
      role: 'admin',
      password: 'visible-plain',
    }
  )

  assert.deepEqual(
    serializeAdminUserResponse('u-2', {
      name: 'Hashed',
      password: BCRYPT_SAMPLE,
      adminPassword: 'also-hidden',
    }),
    {
      id: 'u-2',
      name: 'Hashed',
      password: '',
    }
  )
})

test('serializeAdminUserResponse password comes from stored data, not extras', () => {
  const extras = { department: 'Ops', password: 'extra-plain', adminPassword: 'extra-admin' }
  assert.deepEqual(
    serializeAdminUserResponse('u-3', { name: 'Ada', password: BCRYPT_SAMPLE }, extras),
    {
      id: 'u-3',
      name: 'Ada',
      department: 'Ops',
      password: '',
    }
  )
  assert.deepEqual(
    serializeAdminUserResponse('u-4', { name: 'Ada', password: 'stored-plain' }, extras),
    {
      id: 'u-4',
      name: 'Ada',
      department: 'Ops',
      password: 'stored-plain',
    }
  )
})

test('stripPassword still drops both password fields from generic payloads', () => {
  assert.deepEqual(
    stripPassword({ name: 'Ada', password: 'x', adminPassword: 'y', role: 'cap' }),
    { name: 'Ada', role: 'cap' }
  )
})
