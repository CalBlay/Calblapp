const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  canPruneMissingZohoAttachmentSlots,
  deletedZohoAttachmentIdsFromDocument,
  documentHasInvalidZohoAttachments,
  extractZohoFieldAttachments,
  listExistingZohoAttachmentBaseKeys,
  mergeZohoFieldAttachments,
  shouldImportZohoAttachment,
  shouldRefetchZohoAttachmentField,
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES,
  ZOHO_FIELD_ATTACHMENT_SOURCE_V8,
  zohoAttachmentValidationStatus,
  zohoAttachmentSlotKeys,
} = require('../src/services/zoho/attachments')

test('shouldImportZohoAttachment accepts configured prefixes and valid separators', () => {
  assert.equal(shouldImportZohoAttachment('FT 123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FT_123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('fg_contracte.pdf'), true)
  assert.equal(shouldImportZohoAttachment(' FE_fulla.pdf '), true)
  assert.equal(shouldImportZohoAttachment('FM encarrec.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FC 07022024_AURA.pptx'), true)
  assert.equal(shouldImportZohoAttachment('fc_07022024.pptx'), true)
  assert.equal(shouldImportZohoAttachment('FT123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FM.encarrec.pdf'), false)
  assert.equal(shouldImportZohoAttachment('contracte FT 123.pdf'), false)
  assert.equal(shouldImportZohoAttachment(''), false)
})

test('shouldImportZohoAttachment applies the filename prefixes to every archive field', () => {
  assert.equal(shouldImportZohoAttachment('PM proposta.pdf', 'Arxiu_PM'), true)
  assert.equal(shouldImportZohoAttachment('PM1 proposta.pdf', 'Arxiu_TM'), true)
  assert.equal(shouldImportZohoAttachment('PM2 proposta.pdf', 'Arxiu_TM2'), true)
  assert.equal(shouldImportZohoAttachment('PMS proposta.pdf', 'Arxiu_PM'), true)
  assert.equal(shouldImportZohoAttachment('TM tast.pdf', 'Arxiu_PM'), true)
  assert.equal(shouldImportZohoAttachment('TM tast.pdf', 'Arxiu_TM'), true)
  assert.equal(shouldImportZohoAttachment('TM2 tast.pdf', 'Arxiu_TM2'), true)
})

test('extract and merge Zoho field attachments normalize ids and dedupe across fields', () => {
  const parsed = extractZohoFieldAttachments([
    {
      attachment_Id: 'att-1',
      File_Name: 'FT123.pdf',
      Size: '42',
      Modified_Time: '2026-06-02T10:00:00Z',
      download_Url: '/download/att-1',
    },
    'att-2',
    { file_id: '' },
  ])

  assert.equal(parsed.length, 2)
  assert.equal(parsed[0]?.id, 'att-1')
  assert.equal(parsed[0]?.File_Name, 'FT123.pdf')
  assert.equal(parsed[0]?.Size, 42)
  assert.equal(parsed[0]?.Download_Url, '/download/att-1')
  assert.equal(parsed[1]?.id, 'att-2')

  const v8Parsed = extractZohoFieldAttachments([{
    id: '739896000046430182',
    File_Id__s: 'q9bihd6902c58a8f04467916462799bca6d2a',
    File_Name__s: 'FE document.pdf',
    Size__s: 756390,
    Modified_Time__s: '2026-09-29T14:49:00+02:00',
  }])
  assert.deepEqual(v8Parsed, [{
    id: '739896000046430182',
    File_Name: 'FE document.pdf',
    Size: 756390,
    Modified_Time: '2026-09-29T14:49:00+02:00',
    Download_Url: undefined,
  }])

  const merged = mergeZohoFieldAttachments([
    [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
    [{ attachment_Id: 'att-2', File_Name: 'FG222.pdf' }],
    [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
  ])
  assert.equal(merged.length, 2)
  assert.deepEqual(ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES, [
    'Fulla_d_enc_rrec',
    'Full_de_Tast',
    'Full_de_modificacions',
    'Full_modificacions',
    'Arxiu_PM',
    'Arxiu_TM',
    'Arxiu_TM2',
  ])
})

test('empty Zoho file fields do not trigger per-record refetches', () => {
  assert.equal(shouldRefetchZohoAttachmentField(undefined), false)
  assert.equal(shouldRefetchZohoAttachmentField(null), false)
  assert.equal(shouldRefetchZohoAttachmentField(''), false)
  assert.equal(shouldRefetchZohoAttachmentField([]), false)
  assert.equal(
    shouldRefetchZohoAttachmentField([{ attachment_Id: 'att-1' }]),
    false
  )
  assert.equal(shouldRefetchZohoAttachmentField({ pending: true }), true)
})

test('attachment slot helpers protect against destructive empty-sync cleanup', () => {
  const existing = {
    zohoFile1: 'https://storage.example/old',
    zohoFile1Name: 'FT123.pdf',
    zohoFile1Path: 'events/zoho/deal/att-1-FT123.pdf',
    zohoFile2: 'https://storage.example/old-2',
    zohoFile2Name: 'FG999.pdf',
    file1: 'manual-upload.pdf',
  }

  assert.deepEqual(listExistingZohoAttachmentBaseKeys(existing), [
    'zohoFile1',
    'zohoFile2',
  ])
  assert.equal(canPruneMissingZohoAttachmentSlots(new Set()), false)
  assert.equal(canPruneMissingZohoAttachmentSlots(new Set(['zohoFile1'])), true)

  assert.deepEqual(zohoAttachmentSlotKeys('zohoFile3'), {
    url: 'zohoFile3',
    name: 'zohoFile3Name',
    mimeType: 'zohoFile3MimeType',
    attachmentId: 'zohoFile3AttachmentId',
    modifiedTime: 'zohoFile3ModifiedTime',
    size: 'zohoFile3Size',
    path: 'zohoFile3Path',
    source: 'zohoFile3Source',
    validationStatus: 'zohoFile3ValidationStatus',
  })
})

test('deleted Zoho attachment ids are normalized for sync suppression', () => {
  assert.deepEqual(
    [...deletedZohoAttachmentIdsFromDocument({
      calendarDeletedZohoAttachmentIds: [' att-1 ', '', null, 'att-2'],
    })],
    ['att-1', 'att-2']
  )
  assert.deepEqual([...deletedZohoAttachmentIdsFromDocument({})], [])
})

test('Zoho attachment validation status marks only explicit errors as invalid', () => {
  assert.equal(
    zohoAttachmentValidationStatus('zohoFile1', {
      zohoFile1Source: ZOHO_FIELD_ATTACHMENT_SOURCE_V8,
    }),
    'validated'
  )
  assert.equal(
    zohoAttachmentValidationStatus('zohoFile1', {
      zohoFile1Source: 'zoho-field-attachment',
    }),
    undefined
  )
  assert.equal(
    zohoAttachmentValidationStatus('zohoFile1', {
      zohoFile1ValidationStatus: 'invalid',
    }),
    'invalid'
  )
  assert.equal(zohoAttachmentValidationStatus('file1', {}), undefined)

  assert.equal(
    documentHasInvalidZohoAttachments({
      zohoFile1: 'https://storage.example/file.pdf',
      zohoFile1Source: 'zoho-field-attachment',
    }),
    false
  )
  assert.equal(
    documentHasInvalidZohoAttachments({
      zohoFile1: 'https://storage.example/file.pdf',
      zohoFile1ValidationStatus: 'invalid',
    }),
    true
  )
  assert.equal(documentHasInvalidZohoAttachments({ file1: '/manual.pdf' }), false)
})

test('Zoho sync discovers attachments only from the configured file fields', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/zoho/sync-attachments.ts'),
    'utf8'
  )
  assert.doesNotMatch(source, /function\s+listZohoRecordAttachments/)
  assert.doesNotMatch(source, /const\s+legacy\s*=\s*await/)
  assert.deepEqual(ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES, [
    'Fulla_d_enc_rrec',
    'Full_de_Tast',
    'Full_de_modificacions',
    'Full_modificacions',
    'Arxiu_PM',
    'Arxiu_TM',
    'Arxiu_TM2',
  ])
  assert.equal(ZOHO_FIELD_ATTACHMENT_SOURCE_V8, 'zoho-field-attachment-v8')
  assert.match(
    source,
    /existing\?\.\[keys\.source\][\s\S]*ZOHO_FIELD_ATTACHMENT_SOURCE_V8/
  )
  assert.match(source, /out\[keys\.validationStatus\] = 'invalid'/)
  assert.match(source, /out\[keys\.validationStatus\] = 'validated'/)
})

test('manual Zoho sync is incremental and uses bounded deal concurrency', () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, '../src/app/api/sync/zoho-to-firestore/route.ts'),
    'utf8'
  )
  const syncSource = fs.readFileSync(
    path.join(__dirname, '../src/services/zoho/sync.ts'),
    'utf8'
  )
  const normalizationSource = fs.readFileSync(
    path.join(__dirname, '../src/services/zoho/sync-normalization.ts'),
    'utf8'
  )

  assert.match(routeSource, /const forceFullSync = url\.searchParams\.get\('full'\) === '1'/)
  assert.doesNotMatch(routeSource, /forceFullSync:\s*true/)
  assert.match(syncSource, /const ZOHO_SYNC_CONCURRENCY = 4/)
  assert.match(syncSource, /page_token=\$\{encodeURIComponent\(pageToken\)\}/)
  assert.match(syncSource, /next_page_token\?: string \| null/)
  assert.match(syncSource, /usedPageTokens\.has\(nextPageToken\)/)
  assert.doesNotMatch(syncSource, /for \(let page = 1; ; page\+\+\)/)
  assert.match(syncSource, /slice\(offset, offset \+ ZOHO_SYNC_CONCURRENCY\)/)
  const baseFieldsMatch = syncSource.match(/const baseFields =\s*'([^']+)'/)
  assert.ok(baseFieldsMatch)
  const requestedFields = baseFieldsMatch[1].split(',')
  assert.equal(requestedFields.length, 49)
  for (const removedField of [
    'confirmar_prova',
    'Otros',
    'Formulari_Enviat',
    'Formulari_Respost1',
    'Al_l_rgies',
    'Otros_2a_Part',
    'Enviament_Forms',
    'Forms_Enviat',
    'Al_l_rgies_2a_Part',
    'Deco',
    'Postres',
    'Celler_Vi_Blanc',
    'Celler_Vi_Negre',
    'Celler_Cava',
    'Celler_Extra',
  ]) {
    assert.equal(requestedFields.includes(removedField), false)
  }
  for (const field of [
    'Tipo_de_lead',
    'Pipeline',
    'Ubicaci',
    'Ubicaci_1a_Part',
    'Ubicaci_2a_part',
    'Hora_Fi_Boda',
    'Hora_Fi_Evento',
    'Data_1_Prova_Men',
    'Auto_data_1a_part',
    'Data_enviament_Forms',
    'Comensals',
    'Data_2a_Part_Tast',
    'Auto_Data_2a_Part',
    'Hora',
    'Observacions_2a_Part',
    'Comensals_2a',
    'Full_de_modificacions',
    'Full_modificacions',
    'Arxiu_PM',
    'Arxiu_TM',
    'Arxiu_TM2',
  ]) {
    assert.match(syncSource, new RegExp(`baseFields[\\s\\S]*${field}`))
  }

  for (const field of [
    'Data_1_Prova_Men',
    'Auto_data_1a_part',
    'Data_enviament_Forms',
    'Comensals',
    'Data_2a_Part_Tast',
    'Auto_Data_2a_Part',
    'Hora',
    'Observacions_2a_Part',
    'Comensals_2a',
  ]) {
    assert.match(
      normalizationSource,
      new RegExp(`${field}:\\s*deal\\.${field}`)
    )
  }
})
