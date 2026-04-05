/**
 * Evita que Radix Dialog es tanqui sol en obrir la **càmera**, la **galeria** o el **selector de fitxers**
 * al mòbil (focus i interaccions “fora” del contingut mentre l’OS mostra el picker).
 * Cal botó explícit Tancar/Cancel·lar (o Esc); el clic al fons ja no tanca el modal.
 */
export const dialogContentPropsMobileCameraSafe = {
  onPointerDownOutside: (e: { preventDefault: () => void }) => e.preventDefault(),
  onInteractOutside: (e: { preventDefault: () => void }) => e.preventDefault(),
  onFocusOutside: (e: { preventDefault: () => void }) => e.preventDefault(),
} as const
