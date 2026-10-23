const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildSupplierMessage,
} = require('../src/app/menu/manteniment/tickets/components/assign-ticket-modal/helpers')
const {
  resolveMaintenanceTicketCreatorExplanation,
} = require('../src/lib/maintenanceSupplierEmail')

test('externalization resolves the original description before the editable title', () => {
  assert.equal(
    resolveMaintenanceTicketCreatorExplanation({
      description: 'Perd aigua per sota.',
      sourceMessageText: 'Text original del canal.',
      operatorTitle: 'Rentaplats industrial',
    }),
    'Perd aigua per sota.'
  )
})

test('externalization supports legacy tickets with only source text or title', () => {
  assert.equal(
    resolveMaintenanceTicketCreatorExplanation({
      description: '',
      sourceMessageText: 'La pantalla mostra error E14.',
      operatorTitle: 'Revisar equip',
    }),
    'La pantalla mostra error E14.'
  )
  assert.equal(
    resolveMaintenanceTicketCreatorExplanation({ operatorTitle: 'Revisar equip' }),
    'Revisar equip'
  )
})

test('buildSupplierMessage includes the creator original explanation', () => {
  const message = buildSupplierMessage({
    operatorTitle: 'Rentaplats industrial',
    description: 'Perd aigua per sota quan inicia el programa.',
    machine: 'Rentaplats 02',
  })

  assert.match(message, /Descripcio de la feina: Rentaplats industrial/)
  assert.match(
    message,
    /Explicacio original del creador: Perd aigua per sota quan inicia el programa\./
  )
})

test('buildSupplierMessage falls back to the source message for legacy tickets', () => {
  const message = buildSupplierMessage({
    operatorTitle: 'Revisar equip',
    description: '',
    sourceMessageText: 'La pantalla mostra error E14.',
    machine: '',
  })

  assert.match(message, /Explicacio original del creador: La pantalla mostra error E14\./)
})

test('buildSupplierMessage avoids duplicating the explanation when it is also the title', () => {
  const message = buildSupplierMessage({
    operatorTitle: 'No arrenca',
    description: 'No arrenca',
    machine: '',
  })

  assert.equal((message.match(/No arrenca/g) || []).length, 1)
})
