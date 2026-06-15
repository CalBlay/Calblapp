const unaccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const slugifyServeiCodi = (t: string) =>
  unaccent(t)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const buildServeiSearchable = (nom: string, codi: string) =>
  `${nom} ${codi}`.toLowerCase().trim()
