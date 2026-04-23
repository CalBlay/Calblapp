import {
  countByStringDateYear,
  countByTimestampYear,
  getDocument,
  listCollection,
  queryCollectionWhere
} from "./firestore.service.js";

const eventsCollection =
  process.env.FIRESTORE_EVENTS_COLLECTION || "stage_verd";

function normalizeDateValue(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof raw?.toDate === "function") {
    return raw.toDate().getTime();
  }
  return null;
}

export async function getEvents({ from, to, limit = 100 }) {
  const events = await listCollection(eventsCollection, {
    limit,
    orderBy: "DataInici",
    orderDirection: "desc"
  });
  const fromTs = from ? new Date(from).getTime() : null;
  const toTs = to ? new Date(to).getTime() : null;

  return events.filter((event) => {
    const eventTs = normalizeDateValue(
      event.DataInici ||
        event.DataFi ||
        event.date ||
        event.event_date ||
        event.startDate ||
        event.data
    );
    if (!eventTs) return true;
    if (fromTs && eventTs < fromTs) return false;
    if (toTs && eventTs > toTs) return false;
    return true;
  });
}

/**
 * Recompte d'esdeveniments per any (agregació Firestore quan hi ha índex).
 * Molt més barat que getEvents amb límit alt.
 */
export async function countEventsInYear(year) {
  try {
    const n = await countByStringDateYear(eventsCollection, "DataInici", year);
    return { year, count: n, method: "aggregate_string_date" };
  } catch {
    try {
      const n = await countByTimestampYear(eventsCollection, "DataInici", year);
      return { year, count: n, method: "aggregate_timestamp" };
    } catch {
      const events = await getEvents({
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        limit: 400
      });
      return {
        year,
        count: events.length,
        method: "sample_cap_400",
        note:
          "Recompte aproximat (falta índex Firestore per agregació sobre DataInici). Crea índex compost o revisa el tipus del camp."
      };
    }
  }
}

function codeMatchesDocFields(code, fields) {
  if (!code) return false;
  const c = String(code).trim();
  return fields.some((v) => String(v ?? "").trim() === c);
}

function linkQuadrantsIncidents(event, quadrants, incidents) {
  const eventId = event.id;
  const code = String(event.code || "").trim();
  const idZoho = String(event.idZoho || "").trim();

  const relatedQuadrants = quadrants.filter(
    (q) =>
      q.event_id === eventId ||
      q.eventId === eventId ||
      q.event === eventId ||
      (code &&
        codeMatchesDocFields(code, [q.code, q.eventCode, q.event_code]))
  );
  const relatedIncidents = incidents.filter(
    (i) =>
      i.event_id === eventId ||
      i.eventId === eventId ||
      i.event === eventId ||
      (code &&
        codeMatchesDocFields(code, [
          i.code,
          i.eventCode,
          i.event_code,
          i.C_digo,
          i.codi
        ])) ||
      (idZoho && String(i.eventId || i.event_id || "").trim() === idZoho)
  );

  return { relatedQuadrants, relatedIncidents };
}

/** Uneix quadrants/incidències enllaçats a qualsevol dels documents `matches` (mateix `code`, ids diferents). */
function mergeQuadrantsIncidentsForMatches(matches, quadrants, incidents) {
  const seenQ = new Set();
  const seenI = new Set();
  const relatedQuadrants = [];
  const relatedIncidents = [];

  for (const eventDoc of matches) {
    const { relatedQuadrants: rq, relatedIncidents: ri } =
      linkQuadrantsIncidents(eventDoc, quadrants, incidents);
    for (const q of rq) {
      const key = q.id ? String(q.id) : null;
      if (key) {
        if (!seenQ.has(key)) {
          seenQ.add(key);
          relatedQuadrants.push(q);
        }
      } else {
        relatedQuadrants.push(q);
      }
    }
    for (const i of ri) {
      const key = i.id ? String(i.id) : null;
      if (key) {
        if (!seenI.has(key)) {
          seenI.add(key);
          relatedIncidents.push(i);
        }
      } else {
        relatedIncidents.push(i);
      }
    }
  }

  return { relatedQuadrants, relatedIncidents };
}

export async function getEventDetail(eventId) {
  let event = await getDocument(eventsCollection, eventId);
  if (!event) {
    const events = await listCollection(eventsCollection, {
      limit: 400,
      orderBy: "DataInici",
      orderDirection: "desc"
    });
    event = events.find(
      (item) =>
        item.id === eventId ||
        item.event_id === eventId ||
        String(item.code || "").trim() === String(eventId || "").trim()
    );
  }
  if (!event) return null;

  const [quadrants, incidents] = await Promise.all([
    listCollection("quadrants", { limit: 500 }),
    listCollection("incidents", { limit: 500 })
  ]);

  const { relatedQuadrants, relatedIncidents } = linkQuadrantsIncidents(
    event,
    quadrants,
    incidents
  );

  return {
    event,
    quadrants: relatedQuadrants,
    incidents: relatedIncidents
  };
}

/**
 * Esdeveniment complet per camp `code` (ex. C2500012). Pot haver-hi més d'un match.
 */
export async function getEventFullByCode(code) {
  const raw = String(code || "").trim();
  if (!raw) return null;

  const matches = await queryCollectionWhere(
    eventsCollection,
    "code",
    "==",
    raw,
    { limit: 8 }
  );
  if (!matches.length) return null;

  const primary = matches[0];
  const [quadrants, incidents] = await Promise.all([
    listCollection("quadrants", { limit: 500 }),
    listCollection("incidents", { limit: 500 })
  ]);

  const { relatedQuadrants, relatedIncidents } = mergeQuadrantsIncidentsForMatches(
    matches,
    quadrants,
    incidents
  );

  return {
    code: raw,
    matchCount: matches.length,
    alternateMatches: matches.slice(1).map((m) => ({
      id: m.id,
      NomEvent: m.NomEvent,
      DataInici: m.DataInici
    })),
    event: primary,
    quadrants: relatedQuadrants,
    incidents: relatedIncidents
  };
}

export async function buildEventSummary(eventId) {
  const detail = await getEventDetail(eventId);
  if (!detail) return null;

  const workersAssigned = detail.quadrants.reduce((acc, quadrant) => {
    if (Array.isArray(quadrant.workers)) return acc + quadrant.workers.length;
    if (Array.isArray(quadrant.assignments)) return acc + quadrant.assignments.length;
    return acc;
  }, 0);

  return {
    event_id: eventId,
    event_name:
      detail.event.NomEvent ||
      detail.event.name ||
      detail.event.event_name ||
      detail.event.title ||
      null,
    workers_assigned: workersAssigned,
    incidents_count: detail.incidents.length,
    status: detail.event.status || null
  };
}
