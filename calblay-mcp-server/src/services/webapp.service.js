import {
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

function linkQuadrantsIncidents(event, quadrants, incidents) {
  const eventId = event.id;
  const code = String(event.code || "").trim();
  const idZoho = String(event.idZoho || "").trim();

  const relatedQuadrants = quadrants.filter(
    (q) =>
      q.event_id === eventId ||
      q.eventId === eventId ||
      q.event === eventId ||
      (code && String(q.code || "").trim() === code)
  );
  const relatedIncidents = incidents.filter(
    (i) =>
      i.event_id === eventId ||
      i.eventId === eventId ||
      i.event === eventId ||
      (code && String(i.code || "").trim() === code) ||
      (idZoho && String(i.eventId || i.event_id || "").trim() === idZoho)
  );

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

  const { relatedQuadrants, relatedIncidents } = linkQuadrantsIncidents(
    primary,
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
