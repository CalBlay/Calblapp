const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  documentacioItemVisibleToViewer,
  canManageDocumentacioContent,
} = require('../src/lib/documentacio-access')

function item(overrides = {}) {
  return {
    status: 'published',
    departments: [],
    roles: [],
    ...overrides,
  }
}

test('admin and direccio see drafts and ignore dept/role lists', () => {
  const draft = item({
    status: 'draft',
    departments: ['logistica'],
    roles: ['cap'],
  })
  assert.equal(
    documentacioItemVisibleToViewer({
      item: draft,
      viewerRole: 'Admin',
      viewerDepartment: 'produccio',
    }),
    true
  )
  assert.equal(
    documentacioItemVisibleToViewer({
      item: draft,
      viewerRole: 'Direcció',
      viewerDepartment: null,
    }),
    true
  )
})

test('non-admin viewers only see published items matching dept and role filters', () => {
  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ status: 'draft' }),
      viewerRole: 'cap',
      viewerDepartment: 'logistica',
    }),
    false
  )

  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: ['Logística'], roles: [] }),
      viewerRole: 'treballador',
      viewerDepartment: 'logistica',
    }),
    true
  )
  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: ['logistica'], roles: [] }),
      viewerRole: 'treballador',
      viewerDepartment: 'cuina',
    }),
    false
  )

  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: [], roles: ['Cap', 'treballador'] }),
      viewerRole: 'cap',
      viewerDepartment: 'anywhere',
    }),
    true
  )
  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: [], roles: ['cap'] }),
      viewerRole: 'usuari',
      viewerDepartment: 'anywhere',
    }),
    false
  )

  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: ['serveis'], roles: ['cap'] }),
      viewerRole: 'cap',
      viewerDepartment: 'serveis',
    }),
    true
  )
  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: ['serveis'], roles: ['cap'] }),
      viewerRole: 'treballador',
      viewerDepartment: 'serveis',
    }),
    false
  )
})

test('empty department and role lists mean unrestricted among published items', () => {
  assert.equal(
    documentacioItemVisibleToViewer({
      item: item({ departments: [], roles: [] }),
      viewerRole: 'observer',
      viewerDepartment: 'whatever',
    }),
    true
  )
})

test('canManageDocumentacioContent is admin/direccio only', () => {
  assert.equal(canManageDocumentacioContent('admin'), true)
  assert.equal(canManageDocumentacioContent('Direcció'), true)
  assert.equal(canManageDocumentacioContent('cap'), false)
  assert.equal(canManageDocumentacioContent('treballador'), false)
  assert.equal(canManageDocumentacioContent(null), false)
})
