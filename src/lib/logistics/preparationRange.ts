const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function getPreparationPlanningDate(
  preparationDate: string | null | undefined,
  eventOrServiceDate: string | null | undefined
) {
  const normalizedPreparationDate = String(preparationDate ?? '').trim()
  if (ISO_DATE_PATTERN.test(normalizedPreparationDate)) {
    return normalizedPreparationDate
  }

  const normalizedEventDate = String(eventOrServiceDate ?? '').trim()
  return ISO_DATE_PATTERN.test(normalizedEventDate) ? normalizedEventDate : ''
}

export function isPreparationPlanningDateInRange(
  preparationDate: string | null | undefined,
  eventOrServiceDate: string | null | undefined,
  start: string,
  end: string
) {
  const planningDate = getPreparationPlanningDate(preparationDate, eventOrServiceDate)
  return Boolean(planningDate) && planningDate >= start && planningDate <= end
}
