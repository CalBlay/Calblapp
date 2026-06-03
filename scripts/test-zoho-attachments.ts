/**
 * Proves de les regles d'adjunts Zoho (sense Firebase).
 * Executar: npx ts-node --transpile-only scripts/test-zoho-attachments.ts
 */
const {
  extractZohoFieldAttachments,
  shouldCleanupMissingZohoAttachmentSlots,
  shouldImportZohoAttachment,
} = require('../src/services/zoho/attachments')

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(shouldImportZohoAttachment('FT 123.pdf'), 'accepts spaced FT prefix')
assert(shouldImportZohoAttachment('FT123.pdf'), 'accepts legacy FT prefix')
assert(shouldImportZohoAttachment('FT_123.pdf'), 'accepts underscore FT prefix')
assert(shouldImportZohoAttachment('FE-123.pdf'), 'accepts hyphen FE prefix')
assert(shouldImportZohoAttachment('fm.client.pdf'), 'accepts lowercase FM prefix')
assert(!shouldImportZohoAttachment('OF 123.pdf'), 'rejects non-allowed prefix')
assert(!shouldImportZohoAttachment(''), 'rejects empty filename')

const extracted = extractZohoFieldAttachments([
  {
    attachment_Id: 'a1',
    File_Name: 'FT123.pdf',
    Size: '42',
    Modified_Time: '2026-06-03T10:00:00Z',
    download_Url: '/download/a1',
  },
  'a2',
  { file_id: '' },
])

assert(extracted.length === 2, 'extracts object and string attachment ids')
assert(extracted[0]?.id === 'a1', 'extracts attachment_Id')
assert(extracted[0]?.File_Name === 'FT123.pdf', 'extracts file name')
assert(extracted[0]?.Size === 42, 'normalizes size')
assert(extracted[1]?.id === 'a2', 'extracts string attachment id')

assert(
  !shouldCleanupMissingZohoAttachmentSlots(0),
  'does not cleanup existing slots when Zoho yields no importable attachments'
)
assert(
  shouldCleanupMissingZohoAttachmentSlots(1),
  'cleanup is allowed after at least one current slot was imported'
)

console.log('✅ Zoho attachment tests passed')
