/**
 * Proves helpers de fitxers Zoho (sense Firebase ni Storage).
 * Executar: npx ts-node --transpile-only --compiler-options '{"module":"commonjs"}' scripts/test-zoho-attachments.ts
 */
import {
  canPruneMissingZohoAttachmentSlots,
  extractZohoFieldAttachments,
  listExistingZohoAttachmentBaseKeys,
  mergeZohoFieldAttachments,
  shouldImportZohoAttachment,
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES,
  zohoAttachmentSlotKeys,
} from '../src/services/zoho/attachments'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(shouldImportZohoAttachment('FT 123.pdf'), 'FT prefix with space')
assert(shouldImportZohoAttachment('FT_123.pdf'), 'FT prefix with underscore')
assert(shouldImportZohoAttachment('fg_contracte.pdf'), 'case-insensitive FG prefix')
assert(shouldImportZohoAttachment(' FE_fulla.pdf '), 'trimmed FE prefix with underscore')
assert(shouldImportZohoAttachment('FM encarrec.pdf'), 'FM prefix with space')
assert(shouldImportZohoAttachment('FC 07022024_AURA.pptx'), 'FC prefix with space')
assert(shouldImportZohoAttachment('fc_07022024.pptx'), 'FC prefix with underscore')
assert(!shouldImportZohoAttachment('FT123.pdf'), 'FT must be followed by space or underscore')
assert(!shouldImportZohoAttachment('FM.encarrec.pdf'), 'FM must be followed by space or underscore')
assert(!shouldImportZohoAttachment('contracte FT 123.pdf'), 'prefix must be at start')
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

const merged = mergeZohoFieldAttachments([
  [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
  [{ attachment_Id: 'att-2', File_Name: 'FG222.pdf' }],
  [{ attachment_Id: 'att-1', File_Name: 'FT111.pdf' }],
])
assert(merged.length === 2, 'merges attachments from multiple Zoho file fields')
assert(
  ZOHO_DEAL_ATTACHMENT_FIELD_API_NAMES.join(',') ===
    'Fulla_d_enc_rrec,Full_de_Tast',
  'sync reads both Zoho file attachment fields'
)

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
