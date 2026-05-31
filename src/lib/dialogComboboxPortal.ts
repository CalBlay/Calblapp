/** Portals de cerca (finca, client, servei) dins modals Radix. */
export const DIALOG_COMBOBOX_PORTAL_SELECTOR =
  '[data-finca-dropdown],[data-zoho-client-dropdown],[data-servei-dropdown]'

export const DIALOG_CONTENT_SELECTOR = '[data-slot="dialog-content"]'

export function isDialogComboboxPortalTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest(DIALOG_COMBOBOX_PORTAL_SELECTOR))
  )
}

/**
 * Dins un Dialog modal, Radix marca com a `inert` el contingut fora del portal del diàleg.
 * Si el desplegable es renderitza a `document.body`, els clics no arriben.
 * En modals, el portal ha d'anar dins `DialogContent`; fora, `document.body` n'hi ha prou.
 */
export function getDialogComboboxPortalContainer(
  anchor: HTMLElement | null
): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const dialogContent = anchor?.closest(DIALOG_CONTENT_SELECTOR)
  return (dialogContent as HTMLElement | null) ?? document.body
}
