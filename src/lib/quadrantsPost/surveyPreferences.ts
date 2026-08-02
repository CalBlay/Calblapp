import { getSurveyPreferredCandidates } from '@/lib/quadrantSurveys'
import { normalizeEventId } from '@/lib/quadrantsPost/utils'
import type { SurveyPreferenceAugmentation } from '@/lib/quadrantsPost/types'

export async function enrichWithSurveyPreferences<T extends Record<string, unknown>>(
  payload: T,
  department: string,
  surveyPreferred?: { yes: string[]; maybe: string[] }
): Promise<T & SurveyPreferenceAugmentation> {
  const eventId = normalizeEventId(String(payload?.eventId || ''))
  const serviceDate = String(payload?.phaseDate || payload?.startDate || '').slice(0, 10)
  if (!eventId || !serviceDate) {
    return {
      ...payload,
      preferredStaffNames: Array.isArray(payload?.preferredStaffNames)
        ? (payload.preferredStaffNames as string[])
        : [],
      preferredDriverNames: Array.isArray(payload?.preferredDriverNames)
        ? (payload.preferredDriverNames as string[])
        : [],
      preferredResponsibleName:
        typeof payload?.preferredResponsibleName === 'string'
          ? payload.preferredResponsibleName
          : null,
    }
  }

  const resolvedSurveyPreferred =
    surveyPreferred ||
    (await getSurveyPreferredCandidates({
      eventId,
      department,
      serviceDate,
    }))

  const mergedPreferredStaffNames = Array.from(
    new Set([
      ...(Array.isArray(payload?.preferredStaffNames) ? payload.preferredStaffNames : []),
      ...resolvedSurveyPreferred.yes,
      ...resolvedSurveyPreferred.maybe,
    ].filter(Boolean))
  )
  const mergedPreferredDriverNames = Array.from(
    new Set([
      ...(Array.isArray(payload?.preferredDriverNames) ? payload.preferredDriverNames : []),
      ...resolvedSurveyPreferred.yes,
      ...resolvedSurveyPreferred.maybe,
    ].filter(Boolean))
  )
  const preferredResponsibleName: string | null =
    (typeof payload?.preferredResponsibleName === 'string'
      ? payload.preferredResponsibleName
      : null) ||
    resolvedSurveyPreferred.yes[0] ||
    resolvedSurveyPreferred.maybe[0] ||
    null

  return {
    ...payload,
    preferredStaffNames: mergedPreferredStaffNames,
    preferredDriverNames: mergedPreferredDriverNames,
    preferredResponsibleName,
  }
}
