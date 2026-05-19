export function openPreventiuFitxa(id: string, recordId?: string | null) {
  const url = recordId
    ? `/menu/manteniment/preventius/fulls/${id}?recordId=${encodeURIComponent(recordId)}`
    : `/menu/manteniment/preventius/fulls/${id}`
  const win = window.open(url, '_blank', 'noopener')
  if (win) win.opener = null
}
