const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canAccessIncidentsModule,
  canPostIncident,
  canManageIncidentCategories,
  canDeleteIncident,
  normalizeIncidentStatus,
  normalizeIncidentActionStatus,
} = require('../src/lib/incidentPolicy')

test('canAccessIncidentsModule allows production workers and allowed dept roles', () => {
  assert.equal(
    canAccessIncidentsModule({ role: 'treballador', department: 'produccio' }),
    true
  )
  assert.equal(
    canAccessIncidentsModule({ role: 'cap', department: 'logistica' }),
    true
  )
  assert.equal(
    canAccessIncidentsModule({ role: 'admin', department: 'serveis' }),
    true
  )
  assert.equal(
    canAccessIncidentsModule({ role: 'treballador', department: 'serveis' }),
    false
  )
  assert.equal(
    canAccessIncidentsModule({ role: 'cap', department: 'manteniment' }),
    false
  )
})

test('canPostIncident allows workers and caps; canManageIncidentCategories is production-cap gated', () => {
  assert.equal(canPostIncident({ role: 'treballador', department: 'cuina' }), true)
  assert.equal(canPostIncident({ role: 'cap', department: 'logistica' }), true)
  assert.equal(canPostIncident({ role: 'usuari', department: 'produccio' }), false)

  assert.equal(
    canManageIncidentCategories({ role: 'cap', department: 'produccio' }),
    true
  )
  assert.equal(
    canManageIncidentCategories({ role: 'cap', department: 'serveis' }),
    false
  )
  assert.equal(
    canManageIncidentCategories({ role: 'direccio', department: 'serveis' }),
    true
  )
})

test('canDeleteIncident denies production workers and allows creator/admin/cap-produccio', () => {
  assert.equal(
    canDeleteIncident(
      { id: 'u1', role: 'treballador', department: 'produccio', name: 'Anna' },
      { createdById: 'u1', createdBy: 'Anna' }
    ),
    false
  )

  assert.equal(
    canDeleteIncident(
      { id: 'admin-1', role: 'admin', department: 'serveis' },
      { createdById: 'other', createdBy: 'Other' }
    ),
    true
  )

  assert.equal(
    canDeleteIncident(
      { id: 'cap-1', role: 'cap', department: 'produccio' },
      { createdById: 'other', createdBy: 'Other' }
    ),
    true
  )

  assert.equal(
    canDeleteIncident(
      { id: 'cap-2', role: 'cap', department: 'logistica' },
      { createdById: 'other', createdBy: 'Other' }
    ),
    false
  )

  assert.equal(
    canDeleteIncident(
      { id: 'creator-1', role: 'usuari', department: 'logistica' },
      { createdById: 'creator-1', createdBy: 'Creator' }
    ),
    true
  )

  // Legacy accent-insensitive createdBy alias when createdById is missing.
  assert.equal(
    canDeleteIncident(
      {
        id: 'legacy-1',
        role: 'usuari',
        department: 'logistica',
        name: 'Josép Garcia',
        email: 'josep@example.com',
      },
      { createdBy: 'Josep Garcia' }
    ),
    true
  )

  assert.equal(
    canDeleteIncident(
      {
        id: 'legacy-2',
        role: 'usuari',
        department: 'logistica',
        name: 'Other Person',
        email: 'other@example.com',
      },
      { createdBy: 'Josep Garcia' }
    ),
    false
  )
})

test('normalizeIncidentStatus and normalizeIncidentActionStatus map aliases', () => {
  assert.equal(normalizeIncidentStatus('en_curs'), 'en_curs')
  assert.equal(normalizeIncidentStatus('EnCurs'), 'en_curs')
  assert.equal(normalizeIncidentStatus('resolta'), 'resolt')
  assert.equal(normalizeIncidentStatus('tancada'), 'tancat')
  assert.equal(normalizeIncidentStatus('unknown'), 'obert')

  assert.equal(normalizeIncidentActionStatus('en_curs'), 'in_progress')
  assert.equal(normalizeIncidentActionStatus('fet'), 'done')
  assert.equal(normalizeIncidentActionStatus('cancelada'), 'cancelled')
  assert.equal(normalizeIncidentActionStatus('weird'), 'open')
})
