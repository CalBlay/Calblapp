import { CALBLAY_JSON_MARKER } from "./config.js";
import {
  shouldForceCostDepartmentPeriod,
  shouldForceCostImputationOverview,
  shouldForceFinanceResultByLnMonth,
  shouldForceEventsCountByDay,
  shouldForceIncidentsCountYear,
  shouldForcePersonnelSearch,
  shouldForceVehicleAssignmentsByPlate,
  shouldForceWorkerServicesCount,
  shouldForceAuditsCount,
  shouldForceFinquesCount,
  shouldForceFirestoreCatalog
} from "./helpers.js";

/**
 * @param {{ qNorm: string, rich: boolean, currentYear: number }} p
 * @returns {{
 *   systemContent: string,
 *   forceCostOverview: boolean,
 *   forceCostDepartmentPeriod: boolean,
 *   forceFinanceResultByLnMonth: boolean,
 *   forceEventsCountByDay: boolean,
 *   forceIncidentsCountYear: boolean,
 *   forcePersonnelSearch: boolean,
 *   forceVehicleAssignmentsByPlate: boolean,
 *   forceWorkerServicesCount: boolean,
 *   forceAuditsCount: boolean,
 *   forceFinquesCount: boolean,
 *   forceFirestoreCatalog: boolean
 * }}
 */
export function buildChatSystemContent({ qNorm, rich, currentYear }) {
  const systemBase =
    "Cal Blay. Tools = facts only. " +
    "Quadrants d'operació (planificació de serveis, confirmats/esborranys per departament com logística o cuina): quadrants_dept_summary. No usar costs_imputation_* per això (aquestes són dades de cost salarial a CSV, no les col·leccions quadrants* de l'app). " +
    "Cost salarial / imputació / P&L intern (fitxers finances, c.explotació; NO Firestore): per import exacte de departament/categoria+període usa costs_by_department_period; per informes que creuen períodes (ex. T1 2025 vs T1 2026) o variació global per centre, crida PRIMER costs_imputation_overview; després costs_imputation_search amb contains si cal. " +
    "Per preguntes de P&L mensual per línia de negoci (ex. resultat financer del gener 2026 per LN), usa finance_result_by_ln_month amb yearMonth. " +
    "Interpreta imports amb rows.valuesByColumn i amountColumns.label (cada columna pot ser un període diferent al mateix CSV). Llegeix metaLines per dates o títol. No demanis a l'usuari les dades si pots obtenir-les amb aquestes eines; si el CSV no té la columna esperada, explica-ho amb el que sí retornen amountColumns. " +
    "Total compres / import compres com a part del P&L o imputació (c.explotació, carpeta costos): costs_by_department_period amb departmentContains compres (o costs_imputation_search contains compres), NO purchases_*. " +
    "Compres a nivell de factures proveïdor SAP: purchases_search; dimensió 1 = LN, dimensió 2 = centre. purchases_analytics_ln_centre = agregat per LN+centre (no cost salarial / imputació). " +
    "Per «article més comprat», «top articles», «més comprat per valor/import» en COMPRES: purchases_top_articles_by_amount (yearMonth YYYY-MM o dateFrom/dateTo); mai endevinis el guanyador amb un mostreig de purchases_search. " +
    "Proveïdor P###### preu mig per article i comparació trimestres: purchases_supplier_quarter_article_compare. " +
    "Per un interval de dates arbitrari: purchases_supplier_article_period_summary. purchases_by_supplier és només mostreig; purchases_by_article / purchases_article_month_summary per article M######. " +
    `Esdeveniments: events_count_by_year (total anual); si l'usuari no indica any, omet year o usa ${currentYear}. ` +
    "Per recompte per línia de negoci (LN) i un mes concret: events_count_by_ln_month amb yearMonth=YYYY-MM (ex. febrer 2026 → 2026-02). No usar només events_count_by_year per aquestes preguntes. " +
    "Per recompte de preventius planificats en un dia concret, usa preventius_planned_count_by_day amb date=YYYY-MM-DD: interpretació europea DD-MM; si hi ha any de 2 xifres (ex. 04-05-26) expandeix-lo (26→2026); sense any explícit usa l'any natural actual del servidor. Cita collection/dateField/scopeNote a la resposta. " +
    "Producció / operació (mateixa base Firestore que l'app, enllaç principal: code d'esdeveniment): " +
    "event_context_by_code quan l'usuari dóna un codi (C… o id) i vol detall, quadrants, treballadors/conductors per grups, incidències. " +
    "quadrants_dept_summary per recomptes o llistats de quadrants per departament (sense codi C…) en un interval de dates (per defecte setmana actual). " +
    "comercials_for_business_line per llistar noms de comercial segons la línia de negoci (LN) als esdeveniments (ex. 'empresa'); no és personnel_search. " +
    "events_list_recent per llistar darrers events sense codi. personnel_search per llista de personal (nom/correu, roleContains o departmentContains). " +
    "Per «quants cops s'ha assignat una matrícula/furgoneta», usa vehicle_assignments_count_by_plate amb plate (i opcionalment rang dates). " +
    "Per «quants serveis ha anat X», usa worker_services_count amb workerName (i opcionalment rang/departaments). " +
    "vehicles_list per vehicle/matrícula a la flota. Per «quantes finques tenim» o «com classifiquem finques per tipus» usa finques_count; per cercar per nom/codi usa finques_search (>=2 lletres). " +
    "Per preguntes de plats aptes per celíacs o intoleràncies, usa food_safety_celiac_dishes abans de respondre. " +
    "Per qualsevol mòdul/col·lecció Firestore no cobert amb eina específica (ex. al·lèrgens, projectes o col·leccions noves): primer firestore_collections_catalog i després firestore_query_collection amb collection+filters. " +
    "Per governança i creixement futur del mapping (què falta documentar, cobertura i revisió manual), usa firestore_mapping_status. " +
    "No inventis noms de col·lecció: descobreix-los amb firestore_collections_catalog si hi ha dubte. " +
    "Quan el codi d'event C… apareix a la pregunta, crida event_context_by_code abans d'inferir. " +
    "finances_preview per capçaleres. " +
    "Vendes / facturació (fitxers a carpeta vendes, no SAP compres): imports per centre i mes → sales_by_centre_month; " +
    "si la pregunta és d'un article concret (ex. aigua) en un centre i mes, usa sales_by_article_centre_month; " +
    "article més venut / top al centre → sales_top_articles_by_establishment amb centreContains. finances_list_files kind=vendes si cal el nom del fitxer. " +
    "If tools return aggregated figures (avgUnitPrice, comparison, totals), report them in the answer at once; do not ask the user whether to calculate. " +
    "Reply in user language; use EUR for money.";

  const supplierCodeHint = (() => {
    const m = qNorm.match(/\b(P\d{4,})\b/i);
    if (!m) return "";
    const code = m[1].toUpperCase();
    const y = new Date().getFullYear();
    return (
      ` Hint: the question mentions supplier code ${code}. Use supplierCode="${code}" in purchase tools; do not put this code in supplierName. ` +
      `If you need a year for summaries and none is stated, use ${y}. ` +
      "If the user asks average unit price per article and comparing quarters (e.g. Q1 vs Q1), call purchases_supplier_quarter_article_compare—do not rely only on purchases_by_supplier line samples or ask permission to compute; the server returns aggregated avgUnitPrice and deltas."
    );
  })();

  const articleCodeHint = (() => {
    const m = qNorm.match(/\b(M\d{6,})\b/i);
    if (!m) return "";
    const code = m[1].toUpperCase();
    return ` Hint: article SAP code ${code}: use articleCode="${code}" in purchases_by_article or purchases_article_month_summary.`;
  })();

  const eventCodeHint = (() => {
    const m = qNorm.match(/\b(C\d+)\b/i);
    if (!m) return "";
    const code = m[1].toUpperCase();
    return ` Hint: l'usuari indica un codi d'esdeveniment (code) ${code}: per defecte crida event_context_by_code amb code="${code}" per obtenir quadrants, treballadors, conductors, incidències.`;
  })();

  const systemRich =
    systemBase +
    " For informe / resum financer / taula / gràfic / comparativa, or when tool data benefits a visual: " +
    "first a short executive narrative (max 6 sentences), then ONE fenced block " +
    CALBLAY_JSON_MARKER +
    " ... ``` containing ONE JSON object: { tables: [{title, columns, rows}], chart: null OR {type, title, xKey, series, data}, highlights: string[] }. " +
    "chart.type is bar or line; series items have name and dataKey; data rows are objects (e.g. {mes, import}). " +
    "Use ONLY numbers from tools; chart.data max 24 points; highlights 3-6 bullets; strictly valid JSON. " +
    "If you called purchases_supplier_quarter_article_compare: do NOT hand-type the main tables in calblay-json (the app merges server-built tables). " +
    "If you called costs_imputation_overview or costs_imputation_search in report mode: the app merges server-built tables, KPIs and chart from CSV data—do NOT invent numbers; narrative = conclusions only; you may still output minimal calblay-json placeholders if needed. " +
    "Still output valid calblay-json if required—e.g. duplicate structure with placeholder tables: [] and highlights: []—or a minimal valid object; prefer a short narrative focused on facts, neutral controller tone (no hype adjectives). " +
    "When the tool purchases_supplier_quarter_article_compare returns reportTable and reportTotalsTable: set tables[0] = reportTable and tables[1] = reportTotalsTable (title, columns, rows as string arrays). " +
    "highlights must cite key % changes (preu mig i volum). Optional chart: bar comparing totalAmount or avgUnitPrice top articles (max 12 bars).";

  const forceCostOverview =
    String(process.env.OPENAI_FORCE_COST_OVERVIEW || "1").toLowerCase() !== "0" &&
    shouldForceCostImputationOverview(qNorm);
  const forceCostDepartmentPeriod =
    String(process.env.OPENAI_FORCE_COST_DEPT_PERIOD || "1").toLowerCase() !== "0" &&
    shouldForceCostDepartmentPeriod(qNorm);
  const forceFinanceResultByLnMonth =
    String(process.env.OPENAI_FORCE_FINANCE_RESULT_LN_MONTH || "1").toLowerCase() !== "0" &&
    shouldForceFinanceResultByLnMonth(qNorm);
  const forceEventsCountByDay =
    String(process.env.OPENAI_FORCE_EVENTS_DAY || "1").toLowerCase() !== "0" &&
    shouldForceEventsCountByDay(qNorm);
  const forceIncidentsCountYear =
    String(process.env.OPENAI_FORCE_INCIDENTS_YEAR || "1").toLowerCase() !== "0" &&
    shouldForceIncidentsCountYear(qNorm);
  const forcePersonnelSearch =
    String(process.env.OPENAI_FORCE_PERSONNEL_SEARCH || "1").toLowerCase() !== "0" &&
    shouldForcePersonnelSearch(qNorm);
  const forceVehicleAssignmentsByPlate =
    String(process.env.OPENAI_FORCE_VEHICLE_ASSIGNMENTS || "1").toLowerCase() !== "0" &&
    shouldForceVehicleAssignmentsByPlate(qNorm);
  const forceWorkerServicesCount =
    String(process.env.OPENAI_FORCE_WORKER_SERVICES || "1").toLowerCase() !== "0" &&
    shouldForceWorkerServicesCount(qNorm);
  const forceAuditsCount =
    String(process.env.OPENAI_FORCE_AUDITS_COUNT || "1").toLowerCase() !== "0" &&
    shouldForceAuditsCount(qNorm);
  const forceFinquesCount =
    String(process.env.OPENAI_FORCE_FINQUES_COUNT || "1").toLowerCase() !== "0" &&
    shouldForceFinquesCount(qNorm);
  const forceFirestoreCatalog =
    String(process.env.OPENAI_FORCE_FIRESTORE_CATALOG || "1").toLowerCase() !== "0" &&
    shouldForceFirestoreCatalog(qNorm);

  const systemContent =
    (rich ? systemRich : systemBase + " Max 4 short sentences.") +
    supplierCodeHint +
    articleCodeHint +
    eventCodeHint +
    (forceFinanceResultByLnMonth
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser finance_result_by_ln_month amb yearMonth."
      : "") +
    (forceEventsCountByDay
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser preventius_planned_count_by_day amb date YYYY-MM-DD (04-05 = DD-MM; 04-05-26 = DD-MM-YY). Cita scopeNote i collection a la resposta."
      : "") +
    (forceIncidentsCountYear
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser incidents_count_by_year (incidències) amb year si l'usuari l'indica."
      : "") +
    (forcePersonnelSearch
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser personnel_search. Si es menciona departament, omple departmentContains."
      : "") +
    (forceVehicleAssignmentsByPlate
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser vehicle_assignments_count_by_plate amb plate."
      : "") +
    (forceWorkerServicesCount
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser worker_services_count amb workerName."
      : "") +
    (forceAuditsCount
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser audits_count."
      : "") +
    (forceFinquesCount
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser finques_count."
      : "") +
    (forceCostDepartmentPeriod
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser costs_by_department_period (departmentContains + period) abans de qualsevol altra eina de costos."
      : "") +
    (forceCostOverview
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser costs_imputation_overview (sense omplir contains); després interpreta amountColumns i rows. No diguis que no hi ha dades sense haver rebut el resultat d’aquesta eina."
      : "");

  return {
    systemContent,
    forceCostOverview,
    forceCostDepartmentPeriod,
    forceFinanceResultByLnMonth,
    forceEventsCountByDay,
    forceIncidentsCountYear,
    forcePersonnelSearch,
    forceVehicleAssignmentsByPlate,
    forceWorkerServicesCount,
    forceAuditsCount,
    forceFinquesCount,
    forceFirestoreCatalog
  };
}
