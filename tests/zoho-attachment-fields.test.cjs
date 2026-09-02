const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canPruneMissingZohoAttachmentSlots,
  extractZohoFieldAttachments,
  listExistingZohoAttachmentBaseKeys,
  mergeZohoFieldAttachments,
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES,
  zohoAttachmentSlotKeys,
} = require('../src/services/zoho/attachments')

test('extractZohoFieldAttachments reads Zoho file-field and legacy attachment id aliases', () => {
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
    { File_Id__s: 'att-3', file_Name: 'FG 1.pdf', original_Size_Byte: 9 },
    { $file_id: 'att-4', name: 'FC-2.pdf' },
    null,
    12,
  ])

  assert.equal(parsed.length, 4)
  assert.equal(parsed[0].id, 'att-1')
  assert.equal(parsed[0].File_Name, 'FT123.pdf')
  assert.equal(parsed[0].Size, 42)
  assert.equal(parsed[0].Download_Url, '/download/att-1')
  assert.equal(parsed[1].id, 'att-2')
  assert.equal(parsed[2].id, 'att-3')
  assert.equal(parsed[2].Size, 9)
  assert.equal(parsed[3].id, 'att-4')
  assert.equal(parsed[3].File_Name, 'FC-2.pdf')
})

test('extractZohoFieldAttachments wraps a single object and drops blank / non-finite payloads', () => {
  assert.deepEqual(extractZohoFieldAttachments(null), [])
  assert.deepEqual(extractZohoFieldAttachments(''), [])
  assert.deepEqual(extractZohoFieldAttachments('  att-9  '), [{ id: 'att-9' }])

  const fromObject = extractZohoFieldAttachments({
    Attachment_Id: 'att-obj',
    Size: 'nope',
    file_name: '  ',
  })
  assert.equal(fromObject.length, 1)
  assert.equal(fromObject[0].id, 'att-obj')
  assert.equal(fromObject[0].File_Name, undefined)
  assert.equal(fromObject[0].Size, undefined)
})

test('mergeZohoFieldAttachments dedupes by id across Fulla and Tast fields', () => {
  const merged = mergeZohoFieldAttachments([
    [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
    [{ attachment_Id: 'att-2', File_Name: 'FG222.pdf' }],
    [{ attachment_Id: 'att-1', File_Name: 'FT111-dup.pdf' }],
    { id: 'att-3', File_Name: 'FG333.pdf' },
  ])

  assert.deepEqual(
    merged.map((row) => row.id),
    ['att-1', 'att-2', 'att-3']
  )
  assert.equal(merged[0].File_Name, 'FT111.pdf')
  assert.deepEqual(ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES, [
    'Fulla_d_enc_rrec',
    'Full_de_Tast',
  ])
})

test('listExistingZohoAttachmentBaseKeys only matches zohoFileN slots', () => {
  assert.deepEqual(listExistingZohoAttachmentBaseKeys(undefined), [])
  assert.deepEqual(
    listExistingZohoAttachmentBaseKeys({
      zohoFile1: 'https://storage.example/old',
      zohoFile1Name: 'FT123.pdf',
      zohoFile1Path: 'events/zoho/deal/att-1-FT123.pdf',
      zohoFile2: 'https://storage.example/old-2',
      zohoFile10: 'https://storage.example/old-10',
      file1: 'manual-upload.pdf',
      zohoFile: 'not-a-slot',
    }),
    ['zohoFile1', 'zohoFile2', 'zohoFile10']
  )
})

test('canPruneMissingZohoAttachmentSlots refuses to wipe slots when Zoho returned none', () => {
  assert.equal(canPruneMissingZohoAttachmentSlots(new Set()), false)
  assert.equal(canPruneMissingZohoAttachmentSlots(new Set(['zohoFile1'])), true)
})

test('zohoAttachmentSlotKeys names every persisted metadata field from the slot base', () => {
  assert.deepEqual(zohoAttachmentSlotKeys('zohoFile1'), {
    url: 'zohoFile1',
    name: 'zohoFile1Name',
    mimeType: 'zohoFile1MimeType',
    attachmentId: 'zohoFile1AttachmentId',
    modifiedTime: 'zohoFile1ModifiedTime',
    size: 'zohoFile1Size',
    path: 'zohoFile1Path',
    source: 'zohoFile1Source',
  })
})
