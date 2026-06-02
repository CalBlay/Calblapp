/**
 * Proves helpers de fitxers Zoho (sense Firebase ni Storage).
 * Executar: npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' scripts/test-zoho-attachments.ts
 */
import {
  canPruneMissingZohoAttachmentSlots,
  extractZohoFieldAttachments,
  listExistingZohoAttachmentBaseKeys,
  shouldImportZohoAttachment,
  zohoAttachmentSlotKeys,
} from '../src/services/zoho/attachments'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(shouldImportZohoAttachment('FT123.pdf'), 'legacy FT prefix without space')
assert(shouldImportZohoAttachment('FT 123.pdf'), 'FT prefix with space')
assert(shouldImportZohoAttachment('fg-contracte.pdf'), 'case-insensitive FG prefix')
assert(shouldImportZohoAttachment(' FE_fulla.pdf '), 'trimmed FE prefix')
assert(shouldImportZohoAttachment('FM.encarrec.pdf'), 'FM prefix with punctuation')
assert(!shouldImportZohoAttachment('contracte FT123.pdf'), 'prefix must be at start')
assert(!shouldImportZohoAttachment(''), 'empty name is ignored')

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

assert(parsed.length === 2, 'extracts object and string attachment ids')
assert(parsed[0]?.id === 'att-1', 'extracts attachment_Id')
assert(parsed[0]?.File_Name === 'FT123.pdf', 'extracts File_Name')
assert(parsed[0]?.Size === 42, 'normalizes numeric Size')
assert(parsed[0]?.Download_Url === '/download/att-1', 'extracts download url')
assert(parsed[1]?.id === 'att-2', 'extracts string attachment id')

const existing = {
  zohoFile1: 'https://storage.example/old',
  zohoFile1Name: 'FT123.pdf',
  zohoFile1Path: 'events/zoho/deal/att-1-FT123.pdf',
  zohoFile2: 'https://storage.example/old-2',
  zohoFile2Name: 'FG999.pdf',
  file1: 'manual-upload.pdf',
}

assert(
  listExistingZohoAttachmentBaseKeys(existing).join(',') ===
    'zohoFile1,zohoFile2',
  'only Zoho attachment base keys are prunable'
)

assert(
  !canPruneMissingZohoAttachmentSlots(new Set()),
  'does not prune existing attachments when Zoho returns no importable slots'
)
assert(
  canPruneMissingZohoAttachmentSlots(new Set(['zohoFile1'])),
  'prunes stale slots only after at least one current Zoho slot is imported'
)

const keys = zohoAttachmentSlotKeys('zohoFile1')
assert(keys.path === 'zohoFile1Path', 'slot path key')
assert(keys.attachmentId === 'zohoFile1AttachmentId', 'slot attachment id key')

console.log('✅ zoho attachment helper tests OK')
