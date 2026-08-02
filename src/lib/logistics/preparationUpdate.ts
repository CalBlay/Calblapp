export type PreparationUpdateInput = {
  preparacioData?: unknown
  preparacioHora?: unknown
}

const isIsoDate = (value?: string | null) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())

const isTime = (value?: string | null) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim())

export function buildPreparationUpdateFields(
  input: PreparationUpdateInput
): { ok: true; fields: Record<string, string> } | { ok: false; error: string } {
  const fields: Record<string, string> = {}

  if (input.preparacioData !== undefined) {
    const value = String(input.preparacioData || '').trim()
    if (!isIsoDate(value)) return { ok: false, error: 'PreparacioData invalida' }
    fields.PreparacioData = value
  }

  if (input.preparacioHora !== undefined) {
    const value = String(input.preparacioHora || '').trim()
    if (!isTime(value)) return { ok: false, error: 'PreparacioHora invalida' }
    fields.PreparacioHora = value
  }

  if (!Object.keys(fields).length) {
    return { ok: false, error: 'No fields to update' }
  }

  return { ok: true, fields }
}
