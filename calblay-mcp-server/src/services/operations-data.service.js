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
export async function searchPersonnelForChat({ nameContains, roleContains, departmentContains, limit = 40 }) {
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
  const deptNeedle = normTxt(departmentContains || "");
  if (deptNeedle) {
    rows = rows.filter((d) => {
      const dep = normTxt(d.department || d.departament || "");
      return dep.includes(deptNeedle);
    });
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
 * Recompte de finques a Firestore (col·lecció finques).
 * Útil per preguntes tipus "quantes finques tenim?" sense text de cerca.
 */
export async function countFinquesForChat({ limit = 2000 } = {}) {
  const cap = Math.min(5000, Math.max(100, Number(limit) || 2000));
  const all = await listCollection("finques", { limit: cap });
  const normalized = all.map((f) => ({
    id: f.id,
    nom: f.nom || null,
    codi: f.codi || null,
    propietat:
      f.propietat != null
        ? String(f.propietat)
        : f.esPropia != null
          ? String(f.esPropia)
          : f.tipusPropietat != null
            ? String(f.tipusPropietat)
            : null
  }));
  const byTypeMap = new Map();
  for (const f of all) {
    const t = String(f.tipus || f.type || "sense_tipus").trim() || "sense_tipus";
    byTypeMap.set(t, (byTypeMap.get(t) || 0) + 1);
  }
  const byType = [...byTypeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const ownLike = (v) => {
    const n = normTxt(v);
    return n === "si" || n === "sí" || n === "true" || n === "1" || n.includes("prop");
  };
  const ownCount = normalized.filter((f) => ownLike(f.propietat)).length;
  return {
    kind: "finques_count",
    totalCount: normalized.length,
    ownCount,
    byType,
    cap,
    capped: normalized.length >= cap,
    sample: normalized.slice(0, 20)
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

function toIsoDateLike(v) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  return "";
}

function normalizeAuditStatus(v) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (!s) return "";
  if (s.includes("complet")) return "completed";
  if (s.includes("incomplet")) return "incomplete";
  if (s.includes("draft") || s.includes("esborr")) return "draft";
  if (s.includes("pending") || s.includes("pendent")) return "pending";
  return s;
}

function parseAuditYearMonth(raw) {
  const s = String(raw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  const mIso = s.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (mIso) return `${mIso[1]}-${mIso[2]}`;
  const monthMap = {
    gener: "01",
    enero: "01",
    febrer: "02",
    febrero: "02",
    marc: "03",
    marzo: "03",
    abril: "04",
    maig: "05",
    mayo: "05",
    juny: "06",
    junio: "06",
    juliol: "07",
    julio: "07",
    agost: "08",
    agosto: "08",
    setembre: "09",
    septiembre: "09",
    octubre: "10",
    novembre: "11",
    noviembre: "11",
    desembre: "12",
    diciembre: "12"
  };
  const mName = s.match(
    /\b(gener|enero|febrer|febrero|marc|marzo|abril|maig|mayo|juny|junio|juliol|julio|agost|agosto|setembre|septiembre|octubre|novembre|noviembre|desembre|diciembre)\b.*\b(20\d{2})\b/
  );
  if (!mName) return "";
  const mm = monthMap[mName[1]] || "";
  return mm ? `${mName[2]}-${mm}` : "";
}

export async function countAuditsForChat({ yearMonth, year, department, status, limit = 5000 } = {}) {
  const cap = Math.min(10000, Math.max(200, Number(limit) || 5000));
  const rows = await listCollection("audit_runs", { limit: cap });
  const ym = parseAuditYearMonth(yearMonth);
  const y = Number(year);
  const depNeedle = normTxt(department || "");
  const statusNeedle = normalizeAuditStatus(status || "");

  const filtered = rows.filter((r) => {
    const date = toIsoDateLike(r.completedAt || r.savedAt || r.createdAt || "");
    if (ym && !date.startsWith(ym)) return false;
    if (!ym && Number.isFinite(y) && y >= 2000 && y <= 2100 && !date.startsWith(String(y))) return false;
    if (depNeedle && !normTxt(r.department || "").includes(depNeedle)) return false;
    if (statusNeedle && normalizeAuditStatus(r.status || "") !== statusNeedle) return false;
    return true;
  });

  const byDepartmentMap = new Map();
  const byStatusMap = new Map();
  for (const r of filtered) {
    const d = String(r.department || "sense_departament").trim() || "sense_departament";
    const s = normalizeAuditStatus(r.status || "") || "sense_status";
    byDepartmentMap.set(d, (byDepartmentMap.get(d) || 0) + 1);
    byStatusMap.set(s, (byStatusMap.get(s) || 0) + 1);
  }

  return {
    kind: "audits_count",
    totalCount: filtered.length,
    cap,
    capped: rows.length >= cap,
    yearMonth: ym || null,
    year: !ym && Number.isFinite(y) ? y : null,
    department: department || null,
    status: statusNeedle || null,
    byDepartment: [...byDepartmentMap.entries()]
      .map(([departmentName, count]) => ({ department: departmentName, count }))
      .sort((a, b) => b.count - a.count),
    byStatus: [...byStatusMap.entries()]
      .map(([statusName, count]) => ({ status: statusName, count }))
      .sort((a, b) => b.count - a.count),
    sample: filtered.slice(0, 20).map((r) => ({
      id: r.id,
      status: r.status || null,
      department: r.department || null,
      completedAt: toIsoDateLike(r.completedAt),
      eventCode: r.eventCode || null
    }))
  };
}

const PREVENTIUS_PLANNED_COLLECTION =
  String(process.env.FIRESTORE_PREVENTIUS_PLANNED_COLLECTION || "maintenancePreventiusPlanned").trim() ||
  "maintenancePreventiusPlanned";
const PREVENTIUS_PLANNED_DATE_FIELD =
  String(process.env.FIRESTORE_PREVENTIUS_PLANNED_DATE_FIELD || "date").trim() || "date";

function toYmd(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const s = value.trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  }
  return "";
}

export async function countPlannedPreventiusForChat({ date, limit = 10000 } = {}) {
  const ymd = String(date || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return {
      ok: false,
      kind: "preventius_planned_count_by_day",
      error: "Cal date en format YYYY-MM-DD."
    };
  }
  const cap = Math.min(10000, Math.max(200, Number(limit) || 10000));
  const rows = await listCollection(PREVENTIUS_PLANNED_COLLECTION, { limit: cap });

  const filtered = rows.filter((r) => {
    const dateCandidates = [
      r[PREVENTIUS_PLANNED_DATE_FIELD],
      r.date,
      r.startDate,
      r.DataInici,
      r.createdAt
    ];
    return dateCandidates.some((v) => toYmd(v) === ymd);
  });

  const byPriorityMap = new Map();
  for (const r of filtered) {
    const p = String(r.priority || "sense_prioritat").trim() || "sense_prioritat";
    byPriorityMap.set(p, (byPriorityMap.get(p) || 0) + 1);
  }

  return {
    ok: true,
    kind: "preventius_planned_count_by_day",
    date: ymd,
    total: filtered.length,
    collection: PREVENTIUS_PLANNED_COLLECTION,
    dateField: PREVENTIUS_PLANNED_DATE_FIELD,
    scopeNote: "Recompte de manteniment preventiu planificat (planned), no calendari d'esdeveniments.",
    capped: rows.length >= cap,
    byPriority: [...byPriorityMap.entries()]
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => b.count - a.count),
    sample: filtered.slice(0, 20).map((r) => ({
      id: r.id,
      date: toYmd(r[PREVENTIUS_PLANNED_DATE_FIELD] || r.date || r.startDate || r.DataInici),
      startTime: r.startTime || null,
      endTime: r.endTime || null,
      title: r.title || null,
      location: r.location || null,
      priority: r.priority || null,
      updatedByName: r.updatedByName || null
    }))
  };
}

function parseIncidentYear(rawYear) {
  const y = Number(rawYear);
  if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y;
  return new Date().getFullYear();
}

function incidentDateYmd(row) {
  const candidates = [row?.date, row?.createdAt, row?.updatedAt, row?.closedAt, row?.openedAt];
  for (const c of candidates) {
    const ymd = toYmd(c);
    if (ymd) return ymd;
  }
  return "";
}

export async function countIncidentsForChat({ year, limit = 10000 } = {}) {
  const targetYear = parseIncidentYear(year);
  const cap = Math.min(10000, Math.max(200, Number(limit) || 10000));
  const rows = await listCollection("incidents", { limit: cap });
  const filtered = rows.filter((r) => incidentDateYmd(r).startsWith(String(targetYear)));

  const byStatusMap = new Map();
  for (const r of filtered) {
    const s = String(r.status || "sense_status").trim() || "sense_status";
    byStatusMap.set(s, (byStatusMap.get(s) || 0) + 1);
  }

  return {
    ok: true,
    kind: "incidents_count_by_year",
    year: targetYear,
    total: filtered.length,
    sourceCollection: "incidents",
    byStatus: [...byStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    capped: rows.length >= cap,
    sample: filtered.slice(0, 20).map((r) => ({
      id: r.id,
      code: r.code || null,
      eventId: r.eventId || r.event_id || null,
      status: r.status || null,
      date: incidentDateYmd(r)
    }))
  };
}

function normalizePlate(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[\s_]/g, "")
    .trim();
}

export async function countVehicleAssignmentsByPlateForChat({
  plate,
  start,
  end,
  limitPerCollection = 5000
} = {}) {
  const plateRaw = String(plate || "").trim();
  const plateNorm = normalizePlate(plateRaw);
  if (!plateNorm) {
    return {
      ok: false,
      kind: "vehicle_assignments_count_by_plate",
      error: "Cal una matrícula (plate)."
    };
  }

  const startYmd = start ? String(start).trim().slice(0, 10) : "";
  const endYmd = end ? String(end).trim().slice(0, 10) : "";
  const hasRange =
    (!!startYmd && /^\d{4}-\d{2}-\d{2}$/.test(startYmd)) ||
    (!!endYmd && /^\d{4}-\d{2}-\d{2}$/.test(endYmd));
  const cap = Math.min(10000, Math.max(300, Number(limitPerCollection) || 5000));

  const db = getDb();
  const allCols = await db.listCollections();
  const targetCols = allCols
    .map((c) => c.id)
    .filter((id) => /^quadrants/i.test(id) && id.toLowerCase() !== "quadrants");

  let total = 0;
  const byCollection = [];
  const samples = [];

  for (const col of targetCols) {
    let rows = await listCollection(col, { limit: cap });
    if (hasRange) {
      rows = rows.filter((r) => {
        const d = String(r.startDate || r.DataInici || "").trim().slice(0, 10);
        if (!d) return false;
        if (startYmd && /^\d{4}-\d{2}-\d{2}$/.test(startYmd) && d < startYmd) return false;
        if (endYmd && /^\d{4}-\d{2}-\d{2}$/.test(endYmd) && d > endYmd) return false;
        return true;
      });
    }

    let inCol = 0;
    for (const r of rows) {
      const conductors = Array.isArray(r.conductors) ? r.conductors : [];
      const matches = conductors.filter((c) => normalizePlate(c?.plate) === plateNorm);
      if (!matches.length) continue;
      inCol += matches.length;
      total += matches.length;
      if (samples.length < 30) {
        samples.push({
          collection: col,
          code: r.code || null,
          eventId: r.eventId || r.event_id || null,
          startDate: r.startDate || r.DataInici || null,
          startTime: r.startTime || null,
          conductorMatches: matches.length
        });
      }
    }
    byCollection.push({ collection: col, count: inCol });
  }

  return {
    ok: true,
    kind: "vehicle_assignments_count_by_plate",
    plate: plateRaw,
    normalizedPlate: plateNorm,
    totalAssignments: total,
    range: hasRange ? { start: startYmd || null, end: endYmd || null } : null,
    scannedCollections: targetCols,
    byCollection: byCollection.filter((x) => x.count > 0).sort((a, b) => b.count - a.count),
    sample: samples,
    scopeNote:
      "Recompte d'assignacions de la matrícula a conductors[] dels quadrants de transport (logística/cuina/serveis)."
  };
}

function collectNamesFromUnknown(value) {
  const out = [];
  if (value == null) return out;
  if (typeof value === "string") {
    const s = value.trim();
    if (s) out.push(s);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) out.push(...collectNamesFromUnknown(item));
    return out;
  }
  if (typeof value === "object") {
    const maybeName = String(value.name || value.nom || value.workerName || value.driverName || "").trim();
    if (maybeName) out.push(maybeName);
    return out;
  }
  return out;
}

function countPersonInQuadrantDoc(doc, personNeedle) {
  const names = [];
  names.push(...collectNamesFromUnknown(doc.treballadors));
  names.push(...collectNamesFromUnknown(doc.conductors));
  if (Array.isArray(doc.groups)) {
    for (const g of doc.groups) {
      names.push(...collectNamesFromUnknown(g?.workers));
      names.push(...collectNamesFromUnknown(g?.drivers));
      names.push(...collectNamesFromUnknown(g?.driverName));
    }
  }
  const normalizedNames = names.map((n) => normTxt(n)).filter(Boolean);
  return normalizedNames.some((n) => n.includes(personNeedle));
}

export async function countWorkerServicesForChat({
  workerName,
  start,
  end,
  departments,
  limitPerCollection = 5000
} = {}) {
  const rawName = String(workerName || "").trim();
  const needle = normTxt(rawName);
  if (needle.length < 2) {
    return {
      ok: false,
      kind: "worker_services_count",
      error: "Cal workerName (mínim 2 caràcters)."
    };
  }
  const startYmd = start ? String(start).trim().slice(0, 10) : "";
  const endYmd = end ? String(end).trim().slice(0, 10) : "";
  const hasRange =
    (!!startYmd && /^\d{4}-\d{2}-\d{2}$/.test(startYmd)) ||
    (!!endYmd && /^\d{4}-\d{2}-\d{2}$/.test(endYmd));
  const cap = Math.min(10000, Math.max(300, Number(limitPerCollection) || 5000));

  const db = getDb();
  const allCols = await db.listCollections();
  const requestedDepts = Array.isArray(departments)
    ? departments.map((d) => normTxt(d)).filter(Boolean)
    : [];
  const targetCols = allCols
    .map((c) => c.id)
    .filter((id) => /^quadrants/i.test(id) && id.toLowerCase() !== "quadrants")
    .filter((id) => {
      if (!requestedDepts.length) return true;
      const rest = normTxt(id.replace(/^quadrants/i, ""));
      return requestedDepts.some((d) => rest.includes(d));
    });

  let total = 0;
  const byCollection = [];
  const sample = [];
  for (const col of targetCols) {
    let rows = await listCollection(col, { limit: cap });
    if (hasRange) {
      rows = rows.filter((r) => {
        const d = String(r.startDate || r.DataInici || "").trim().slice(0, 10);
        if (!d) return false;
        if (startYmd && /^\d{4}-\d{2}-\d{2}$/.test(startYmd) && d < startYmd) return false;
        if (endYmd && /^\d{4}-\d{2}-\d{2}$/.test(endYmd) && d > endYmd) return false;
        return true;
      });
    }
    let inCol = 0;
    for (const r of rows) {
      const matched = countPersonInQuadrantDoc(r, needle);
      if (!matched) continue;
      inCol += 1;
      total += 1;
      if (sample.length < 30) {
        sample.push({
          collection: col,
          code: r.code || null,
          eventId: r.eventId || r.event_id || null,
          startDate: r.startDate || r.DataInici || null,
          startTime: r.startTime || null,
          department: r.department || null
        });
      }
    }
    byCollection.push({ collection: col, count: inCol });
  }

  return {
    ok: true,
    kind: "worker_services_count",
    workerName: rawName,
    totalServices: total,
    range: hasRange ? { start: startYmd || null, end: endYmd || null } : null,
    scannedCollections: targetCols,
    byCollection: byCollection.filter((x) => x.count > 0).sort((a, b) => b.count - a.count),
    sample,
    scopeNote: "Recompte de serveis on la persona apareix a treballadors/conductors/groups dels quadrants."
  };
}
