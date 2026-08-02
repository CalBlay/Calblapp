const assert = require('node:assert/strict')
const { test } = require('node:test')

const { pickVisibleAuditTemplate } = require('../src/lib/auditVisibleTemplate')
const {
  formatTornNotificationBody,
  formatTornNotificationLabel,
} = require('../src/lib/date-format')

test('pickVisibleAuditTemplate matches normalized department values', () => {
  const rows = [
    {
      id: 'tpl-1',
      name: 'Auditoria Logistica',
      department: 'Logística',
      status: 'active',
      isVisible: true,
      blocks: [{ id: 'b1' }],
    },
    {
      id: 'tpl-2',
      name: 'Other',
      department: 'cuina',
      status: 'active',
      isVisible: true,
      blocks: [],
    },
  ]

  const picked = pickVisibleAuditTemplate(rows, 'logistica')
  assert.equal(picked?.id, 'tpl-1')
  assert.equal(picked?.name, 'Auditoria Logistica')
  assert.equal(picked?.blocks.length, 1)
})

test('pickVisibleAuditTemplate ignores non-visible or draft templates', () => {
  const rows = [
    {
      id: 'draft',
      department: 'logistica',
      status: 'draft',
      isVisible: true,
      blocks: [],
    },
    {
      id: 'hidden',
      department: 'logistica',
      status: 'active',
      isVisible: false,
      blocks: [],
    },
  ]

  assert.equal(pickVisibleAuditTemplate(rows, 'logistica'), null)
})

test('formatTornNotificationLabel uses torns day date format', () => {
  assert.equal(
    formatTornNotificationLabel('Nou esdeveniment', '2026-06-09'),
    'Nou esdeveniment 09/06/26'
  )
})

test('formatTornNotificationBody normalizes legacy ISO bodies', () => {
  assert.equal(
    formatTornNotificationBody('Nou esdeveniment 2026-06-09', '2026-06-09'),
    'Nou esdeveniment 09/06/26'
  )
  assert.equal(
    formatTornNotificationBody('Nou esdeveniment 2026-06-03'),
    'Nou esdeveniment 03/06/26'
  )
})

test('formatTornNotificationBody is idempotent when body is already formatted', () => {
  assert.equal(
    formatTornNotificationBody('Nou esdeveniment 09/06/26', '2026-06-09'),
    'Nou esdeveniment 09/06/26'
  )
})
