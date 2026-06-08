import { normalizeAuditDepartment, type AuditApiDepartment } from '@/lib/auditDepartment'

export type AuditTemplateRow = {
  id?: string
  name?: unknown
  department?: unknown
  status?: unknown
  isVisible?: unknown
  blocks?: unknown
}

export function pickVisibleAuditTemplate(
  rows: AuditTemplateRow[],
  department: AuditApiDepartment
): { id?: string; name: string; blocks: unknown[] } | null {
  for (const row of rows) {
    const docDept = normalizeAuditDepartment(String(row.department || ''))
    if (docDept !== department) continue
    if (row.isVisible !== true) continue
    if (String(row.status || '').toLowerCase() !== 'active') continue

    return {
      id: row.id,
      name: String(row.name || 'Plantilla'),
      blocks: Array.isArray(row.blocks) ? row.blocks : [],
    }
  }
  return null
}
