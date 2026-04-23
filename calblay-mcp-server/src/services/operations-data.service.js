import { getDb, listCollection, listCollectionOrderByDesc } from "./firestore.service.js";
import { getEventFullByCode, getEvents } from "./webapp.service.js";

function normTxt(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function takePersonShallow(p) {
  if (!p || typeof p !== "object") return p;
  return {
    id: p.id,
    name: p.name,
    nom: p.nom,
    plate: p.plate,
    vehicleType: p.vehicleType,
    type: p.type,
    startDate: p.startDate,
    endDate: p.endDate,
    startTime: p.startTime,
    endTime: p.endTime,
    arrivalTime: p.arrivalTime
  };
}

/**
 * Redueix un document de quadrant a camps útils per al xat (evita pujar JSON enormes).
 */
function trimQuadrantDoc(q) {
  if (!q || typeof q !== "object") return q;
  const treb = Array.isArray(q.treballadors) ? q.treballadors.slice(0, 20) : [];
  const cond = Array.isArray(q.conductors) ? q.conductors.slice(0, 20) : [];
  const grps = Array.isArray(q.groups) ? q.groups.slice(0, 10) : [];
  return {
    id: q.id,
    code: q.code,
    eventId: q.eventId,
    eventName: q.eventName,
    department: q.department,
    startDate: q.startDate,
    endDate: q.endDate,
    startTime: q.startTime,
    endTime: q.endTime,
    arrivalTime: q.arrivalTime,
    service: q.service || q.Servei || null,
    location: q.location,
    totalWorkers: q.totalWorkers,
    numDrivers: q.numDrivers,
    responsableName: q.responsableName,
    treballadors: treb.map(takePersonShallow),
    conductors: cond.map(takePersonShallow),
    groups: grps.map((g) => ({
      serviceDate: g.serviceDate,
      dateLabel: g.dateLabel,
      meetingPoint: g.meetingPoint,
      workers: g.workers,
      drivers: g.drivers
    }))
  };
}

function trimIncidentDoc(i) {
  if (!i || typeof i !== "object") return i;
  return {
    id: i.id,
    code: i.code,
    eventId: i.eventId,
    event_id: i.event_id,
    status: i.status,
    title: i.title,
    tiquet: i.tiquet
  };
}

function trimEventFullData(data) {
  if (!data) return null;
  const ev = data.event && typeof data.event === "object" ? { ...data.event } : null;
  if (ev) {
    for (const k of Object.keys(ev)) {
      if (typeof ev[k] === "string" && ev[k].length > 4000) {
        ev[k] = `${String(ev[k]).slice(0, 4000)}…`;
      }
    }
  }
  const quads = Array.isArray(data.quadrants) ? data.quadrants : [];
  const incs = Array.isArray(data.incidents) ? data.incidents : [];
  return {
    code: data.code,
    matchCount: data.matchCount,
    alternateMatches: data.alternateMatches,
    event: ev,
    quadrants: quads.slice(0, 30).map(trimQuadrantDoc),
    incidents: incs.slice(0, 25).map(trimIncidentDoc),
    _truncated: quads.length > 30 || incs.length > 25,
    _quadrantsTotal: quads.length,
    _incidentsTotal: incs.length
  };
}

/**
 * Context complet d’esdeveniment per `code` (C…): esdeveniment, quadrants vinculats, incidències.
 * Les llistes internes de getEventFullByCode ja són limitades a 500; aquí es resumeixen per al model.
 */
export async function getEventContextByCodeForChat(code) {
  const c = String(code || "").trim();
  if (!c) {
    return { ok: false, error: "Codi d’esdeveniment buit" };
  }
  const data = await getEventFullByCode(c);
  if (!data) {
    return { ok: false, notFound: true, code: c };
  }
  return { ok: true, ...trimEventFullData(data) };
}

function trimPersonnelRow(d) {
  return {
    id: d.id,
    name: d.name,
    nom: d.nom,
    cognoms: d.cognoms,
    email: d.email,
    phone: d.phone,
    telefon: d.telefon,
    department: d.department,
    departament: d.departament,
    actiu: d.actiu,
    role: d.role
  };
}

/**
 * Llista de personal; opcionalment filtrat per nom (contains, sense accents).
 */
export async function searchPersonnelForChat({ nameContains, roleContains, limit = 40 }) {
  const cap = Math.min(100, Math.max(5, Number(limit) || 40));
  const all = await listCollection("personnel", { limit: 500 });
  const needle = normTxt(nameContains || "");
  const roleNeedle = normTxt(roleContains || "");
  let rows = all;
  if (needle) {
    rows = rows.filter((d) => {
      const n = normTxt(d.name || d.nom || "");
      const em = normTxt(d.email || "");
      return n.includes(needle) || em.includes(needle) || String(d.id || "").includes(needle);
    });
  }
  if (roleNeedle) {
    rows = rows.filter((d) => normTxt(d.role || "").includes(roleNeedle));
  }
  return {
    kind: "personnel",
    count: rows.length,
    cap,
    personnel: rows.slice(0, cap).map(trimPersonnelRow)
  };
}

/**
 * Vehicles (col·lecció `transports` a l’app).
 */
export async function listTransportsForChat({ limit = 60 }) {
  const cap = Math.min(120, Math.max(5, Number(limit) || 60));
  const rows = await listCollection("transports", { limit: cap });
  return {
    kind: "transports",
    count: rows.length,
    vehicles: rows.map((t) => ({
      id: t.id,
      plate: t.plate,
      type: t.type,
      conductorId: t.conductorId
    }))
  };
}

/**
 * Finques (espais) — cerca en memòria d’un subconjunt (fins 500 documents).
 */
export async function searchFinquesForChat({ query, limit = 15 }) {
  const cap = Math.min(40, Math.max(1, Number(limit) || 15));
  const qn = String(query || "").trim();
  if (qn.length < 2) {
    return { kind: "finques", error: "Cal un text de cerca d’almenys 2 caràcters", finques: [] };
  }
  const needle = normTxt(qn);
  const all = await listCollection("finques", { limit: 500 });
  const filtered = all
    .filter((f) => {
      const nom = normTxt(f.nom);
      const codi = normTxt(f.codi);
      const s = normTxt(f.searchable);
      return nom.includes(needle) || codi.includes(needle) || s.includes(needle);
    })
    .slice(0, cap)
    .map((f) => ({
      id: f.id,
      nom: f.nom,
      codi: f.codi,
      ubicacio: f.ubicacio
    }));
  return {
    kind: "finques",
    count: filtered.length,
    finques: filtered
  };
}

/**
 * Darrers esdeveniments (col·lecció configurada per FIRESTORE_EVENTS_COLLECTION).
 */
export async function listRecentEventsForChat({ limit = 30 }) {
  const cap = Math.min(100, Math.max(5, Number(limit) || 30));
  const events = await getEvents({ limit: cap });
  return {
    kind: "events",
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      code: e.code,
      NomEvent: e.NomEvent,
      name: e.name,
      DataInici: e.DataInici,
      DataFi: e.DataFi,
      LN: e.LN
    }))
  };
}

const EVENTS_COL = process.env.FIRESTORE_EVENTS_COLLECTION || "stage_verd";
const EVENTS_DATE_FIELD = String(process.env.FIRESTORE_EVENTS_DATE_FIELD || "DataInici").trim() || "DataInici";
const EVENTS_LN_FIELD = String(process.env.FIRESTORE_EVENTS_LN_FIELD || "LN").trim() || "LN";

/**
 * Noms de comercial (camps comercial/Comercial als esdeveniments) la línia de negoci (LN) del qual conté el text donat.
 * No és la llista de personal de Firestore: es deriva d’un mostreig d’esdeveniments recents.
 */
export async function comercialsForBusinessLineForChat({ lineContains, eventScanLimit = 2500 }) {
  const needle = normTxt(lineContains || "");
  if (needle.length < 2) {
    return {
      ok: false,
      error: "Cal lineContains (mín. 2 caràcters; ex. empresa, casaments, food, grups).",
      kind: "comercials_by_ln"
    };
  }

  const cap = Math.min(5000, Math.max(200, Number(eventScanLimit) || 2500));
  let events = [];
  try {
    events = await listCollectionOrderByDesc(EVENTS_COL, EVENTS_DATE_FIELD, { limit: cap, max: 5000 });
  } catch {
    try {
      events = await listCollection(EVENTS_COL, {
        limit: 500,
        orderBy: EVENTS_DATE_FIELD,
        orderDirection: "desc"
      });
    } catch {
      return {
        ok: false,
        error: "No s'han pogut llegir esdeveniments (revisa camp de data o índexs Firestore).",
        kind: "comercials_by_ln"
      };
    }
  }

  const byName = new Map();
  for (const e of events) {
    const ln = String(
      e[EVENTS_LN_FIELD] != null && String(e[EVENTS_LN_FIELD]).trim() !== ""
        ? e[EVENTS_LN_FIELD]
        : e.ln != null
          ? e.ln
          : e.lineaNegoci != null
            ? e.lineaNegoci
            : ""
    ).trim();
    if (!ln || !normTxt(ln).includes(needle)) continue;
    const raw = String(e.comercial || e.Comercial || "").trim();
    if (!raw) continue;
    const key = normTxt(raw);
    if (!key) continue;
    const code = String(e.code || "").trim();
    if (!byName.has(key)) {
      byName.set(key, { name: raw, eventCount: 0, sampleCodes: [] });
    }
    const row = byName.get(key);
    row.eventCount += 1;
    if (code && row.sampleCodes.length < 3 && !row.sampleCodes.includes(code)) {
      row.sampleCodes.push(code);
    }
  }

  const comercials = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ca", { sensitivity: "base" })
  );

  return {
    ok: true,
    kind: "comercials_by_ln",
    source: "events_comercial_LN",
    lineContains: String(lineContains || "").trim(),
    eventsScanned: events.length,
    eventsCollection: EVENTS_COL,
    lnField: EVENTS_LN_FIELD,
    uniqueCount: comercials.length,
    comercials,
    ...(comercials.length === 0
      ? {
          note: "En aquest mostreig no hi ha comercials amb el camp comercial/Comercial informat o cap LN que coincideixi. Prova un altre tros de text a LN (ex. 'empres' per Empreses/Empresa) o fes pujar eventScanLimit."
        }
      : {})
  };
}

/* ── Quadrants d’operació: col·leccions `quadrants*` (mateixa idea que /api/quadrants/list) ── */

const QUADRANT_COLS_MAP = Object.create(null);
let quadrantColsLoaded = false;

function normalizeQuadrantColId(id) {
  const rest = String(id || "")
    .replace(/^quadrants?/i, "")
    .replace(/[_\-\s]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return rest;
}

function normalizeQuadrantDeptKey(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ymdFromDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentWeekRangeYmd() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: ymdFromDate(monday), end: ymdFromDate(sunday) };
}

async function loadQuadrantCollectionNames() {
  if (quadrantColsLoaded) return;
  const cols = await getDb().listCollections();
  for (const c of cols) {
    const key = normalizeQuadrantColId(c.id);
    if (key) QUADRANT_COLS_MAP[key] = c.id;
  }
  quadrantColsLoaded = true;
}

/**
 * Llista i recompte de quadrants (planificació) per departament, d’una col·lecció com quadrantsLogistica.
 */
export async function quadrantsDeptSummaryForChat({
  department,
  start: startIn,
  end: endIn,
  status: statusIn = "all"
}) {
  const deptKey = normalizeQuadrantDeptKey(department);
  if (!deptKey) {
    return { ok: false, error: "Cal un department (ex. logistica).", kind: "quadrants_dept" };
  }

  await loadQuadrantCollectionNames();
  const collectionName = QUADRANT_COLS_MAP[deptKey];
  if (!collectionName) {
    return {
      ok: false,
      notFound: true,
      kind: "quadrants_dept",
      department: deptKey,
      availableDepartmentKeys: Object.keys(QUADRANT_COLS_MAP)
    };
  }

  const week = currentWeekRangeYmd();
  const start = String(startIn || week.start).trim().slice(0, 10) || week.start;
  const end = String(endIn || week.end).trim().slice(0, 10) || week.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { ok: false, error: "start i end han de ser YYYY-MM-DD.", kind: "quadrants_dept" };
  }

  const st = String(statusIn || "all").toLowerCase();
  const statusFilter = st === "confirmed" || st === "draft" ? st : "all";

  const db = getDb();
  let ref = db.collection(collectionName);
  ref = ref.where("startDate", ">=", start);
  ref = ref.where("startDate", "<=", end);
  ref = ref.orderBy("startDate", "asc").orderBy("startTime", "asc");
  const snap = await ref.get();

  const items = snap.docs.map((doc) => {
    const d = doc.data() || {};
    const statusRaw = String(d?.status ?? "").toLowerCase();
    const qStatus = statusRaw === "confirmed" ? "confirmed" : "draft";
    const confirmedAtVal = d?.confirmedAt;
    const confirmedAt =
      typeof confirmedAtVal === "object" && confirmedAtVal && typeof confirmedAtVal.toDate === "function"
        ? confirmedAtVal.toDate().toISOString()
        : typeof confirmedAtVal === "string"
          ? confirmedAtVal
          : null;
    const confirmed =
      qStatus === "confirmed" || !!confirmedAt || !!d?.confirmada || !!d?.confirmed;
    const startDate = d.startDate || d.DataInici || "";
    return {
      id: doc.id,
      code: d.code || "",
      eventName: d.eventName || "",
      department: normalizeQuadrantDeptKey(d.department || deptKey),
      startDate,
      startTime: d.startTime || d.HoraInici || d.horaInici || "",
      endDate: d.endDate || d.DataFi || "",
      status: qStatus,
      confirmed
    };
  });

  let rows = items;
  if (statusFilter !== "all") {
    rows = items.filter((x) => x.status === statusFilter);
  }

  const nConf = items.filter((x) => x.status === "confirmed").length;
  const nDraft = items.length - nConf;

  return {
    ok: true,
    kind: "quadrants_dept",
    source: "firestore_quadrants_collection",
    collection: collectionName,
    department: deptKey,
    range: { start, end },
    totalInRange: items.length,
    confirmedCount: nConf,
    draftCount: nDraft,
    statusFilter,
    /** Files retornades (si statusFilter ≠ all, només les que coincideixen). */
    items: rows,
    listCount: rows.length
  };
}
