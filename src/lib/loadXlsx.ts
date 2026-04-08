/**
 * Carrega SheetJS només quan cal (export Excel), per no incloure el paquet al chunk inicial de la pàgina.
 */
type XlsxModule = typeof import('xlsx')

export async function loadXlsx(): Promise<XlsxModule> {
  const mod = await import('xlsx')
  const d = (mod as { default?: XlsxModule }).default
  if (d && typeof d.utils !== 'undefined') return d
  return mod as XlsxModule
}
