const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  canPruneMissingZohoAttachmentSlots,
  deletedZohoAttachmentIdsFromDocument,
  extractZohoFieldAttachments,
  listExistingZohoAttachmentBaseKeys,
  mergeZohoFieldAttachments,
  shouldImportZohoAttachment,
  shouldRefetchZohoAttachmentField,
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES,
  zohoAttachmentSlotKeys,
} = require('../src/services/zoho/attachments')

test('shouldImportZohoAttachment accepts legacy and spaced/underscored prefixes only', () => {
  assert.equal(shouldImportZohoAttachment('FT 123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FT_123.pdf'), true)
  assert.equal(shouldImportZohoAttachment('fg_contracte.pdf'), true)
  assert.equal(shouldImportZohoAttachment(' FE_fulla.pdf '), true)
  assert.equal(shouldImportZohoAttachment('FM encarrec.pdf'), true)
  assert.equal(shouldImportZohoAttachment('FC 07022024_AURA.pptx'), true)
  assert.equal(shouldImportZohoAttachment('fc_07022024.pptx'), true)
  assert.equal(shouldImportZohoAttachment('FT123.pdf'), false)
  assert.equal(shouldImportZohoAttachment('FM.encarrec.pdf'), false)
  assert.equal(shouldImportZohoAttachment('contracte FT 123.pdf'), false)
  assert.equal(shouldImportZohoAttachment(''), false)
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

  const merged = mergeZohoFieldAttachments([
    [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
    [{ attachment_Id: 'att-2', File_Name: 'FG222.pdf' }],
    [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
  ])
  assert.equal(merged.length, 2)
  assert.deepEqual(ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES, [
    'Fulla_d_enc_rrec',
    'Full_de_Tast',
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
  ])
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

  assert.match(routeSource, /const forceFullSync = url\.searchParams\.get\('full'\) === '1'/)
  assert.doesNotMatch(routeSource, /forceFullSync:\s*true/)
  assert.match(syncSource, /const ZOHO_SYNC_CONCURRENCY = 4/)
  assert.match(syncSource, /slice\(offset, offset \+ ZOHO_SYNC_CONCURRENCY\)/)
})
