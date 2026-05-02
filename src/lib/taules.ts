/**
 * Classes compartides per taules de dades als mòduls (Roba personal, Quadrants, logística, etc.).
 * Envoltar <Table> amb {@link taulaContentidorScroll}; el cos de la taula usa tokens de tema
 * amb el component `Table` de `components/ui/table`.
 */
export const taulaContentidorScroll =
  'rounded-xl border border-border bg-card overflow-x-auto w-full'

/** Opcional: afegir a <TableHeader> per reforçar fons/vora quan calgui. */
export const taulaTheadClass = 'bg-muted/40 border-b border-border'

/** Text habitual a <TableHead>. */
export const taulaThText = 'text-xs sm:text-sm'
