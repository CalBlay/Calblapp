/**
 * Generació de codi de treballador (sense I/O). Compartit entre client (previsualització) i servidor.
 */

export function slugifyWorkerCodeBase(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function randWorkerSuffix(len = 4): string {
  return Math.random().toString(36).slice(2, 2 + len)
}

/** Proposta de codi (slug + sufix). El servidor pot assignar-ne un altre si ja existeix. */
export function buildWorkerCodeFromName(name: string): string {
  const base = slugifyWorkerCodeBase(name) || 'persona'
  return `${base}-${randWorkerSuffix(4)}`
}
