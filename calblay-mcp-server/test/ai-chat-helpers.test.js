import test from "node:test";
import assert from "node:assert/strict";
import {
  canExtractCostDepartmentPeriodSlots,
  extractCostDepartmentPeriodSlots,
  extractDateYmdFromQuestion,
  extractDepartmentFromQuestion,
  extractPlateFromQuestion,
  extractWorkerNameFromQuestion,
  extractYearMonthFromQuestion,
  shouldForceAuditsCount,
  shouldForceEventsCountByDay,
  normalizeCostDepartmentContains,
  shouldForcePersonnelSearch,
  shouldForceVehicleAssignmentsByPlate,
  shouldForceWorkerServicesCount,
  shouldForceFinanceResultByLnMonth,
  shouldForceCostDepartmentPeriod,
  shouldForceFinquesCount
} from "../src/services/ai-chat/helpers.js";

test("canExtractCostDepartmentPeriodSlots: true with dept + natural quarter", () => {
  assert.equal(
    canExtractCostDepartmentPeriodSlots("Cost de marketing el primer trimestre de 2026"),
    true
  );
});

test("canExtractCostDepartmentPeriodSlots: true with dept + YYYY-Tn", () => {
  assert.equal(canExtractCostDepartmentPeriodSlots("Cost de logística al 2026-T1"), true);
});

test("canExtractCostDepartmentPeriodSlots: false without department", () => {
  assert.equal(canExtractCostDepartmentPeriodSlots("Cost total al 2026-T1"), false);
});

test("extractCostDepartmentPeriodSlots: quarter natural language", () => {
  const out = extractCostDepartmentPeriodSlots("Cost de marketing el primer trimestre de 2026");
  assert.ok(out);
  assert.equal(out.departmentContains, "marketing");
  assert.equal(out.period, "primer trimestre de 2026");
});

test("extractCostDepartmentPeriodSlots: month expression", () => {
  const out = extractCostDepartmentPeriodSlots("Cost de logística al gener de 2026");
  assert.ok(out);
  assert.equal(out.departmentContains, "logistica");
  assert.equal(out.period, "gener de 2026");
});

test("extractCostDepartmentPeriodSlots: MM-YY normalized to YYYY-MM", () => {
  const out = extractCostDepartmentPeriodSlots("Quin cost en subministraments hem tingut el 03-26?");
  assert.ok(out);
  assert.equal(out.period, "2026-03");
});

test("shouldForceCostDepartmentPeriod: true for subministraments + MM-YY", () => {
  assert.equal(
    shouldForceCostDepartmentPeriod("Quin cost en subministraments hem tingut el 03-26?"),
    true
  );
});

test("shouldForceCostDepartmentPeriod: true for total compres + month (c.explotació / P&L)", () => {
  assert.equal(
    shouldForceCostDepartmentPeriod("Quin és el total de compres al gener de 2026?"),
    true
  );
});

test("shouldForceCostDepartmentPeriod: false when supplier invoice context", () => {
  assert.equal(
    shouldForceCostDepartmentPeriod("Total compres del proveïdor P003004 al gener de 2026"),
    false
  );
});

test("canExtractCostDepartmentPeriodSlots: true for subministraments + MM-YY", () => {
  assert.equal(
    canExtractCostDepartmentPeriodSlots("Quin cost en subministraments hem tingut el 03-26?"),
    true
  );
});

test("shouldForceFinanceResultByLnMonth: true for financer+ln+month", () => {
  assert.equal(
    shouldForceFinanceResultByLnMonth("Resultat financer del gener 2026 de l'empresa per línia de negoci"),
    true
  );
});

test("extractYearMonthFromQuestion: month name", () => {
  assert.equal(extractYearMonthFromQuestion("Resultat financer del gener 2026"), "2026-01");
});

test("shouldForceFinquesCount: true with how many finques", () => {
  assert.equal(shouldForceFinquesCount("quantes finques propies tenim?"), true);
});

test("shouldForceFinquesCount: true with finques classification", () => {
  assert.equal(shouldForceFinquesCount("com classifiquem les finques?"), true);
});

test("shouldForceAuditsCount: true with audit count query", () => {
  assert.equal(shouldForceAuditsCount("quantes auditories hem fet?"), true);
});

test("shouldForceEventsCountByDay: true for preventius planificats + DD-MM shorthand", () => {
  assert.equal(
    shouldForceEventsCountByDay("quants preventius planificats tenim el 04-05?"),
    true
  );
});

test("shouldForceEventsCountByDay: true with common typo prevenitus", () => {
  assert.equal(
    shouldForceEventsCountByDay("quants prevenitus planificats tenim el 04-05?"),
    true
  );
});

test("shouldForceEventsCountByDay: true for planificat + slash date", () => {
  assert.equal(shouldForceEventsCountByDay("preventius planificats el 4/5"), true);
});

test("shouldForceEventsCountByDay: true for DD-MM-YY shorthand", () => {
  assert.equal(
    shouldForceEventsCountByDay("quants preventius planificats tenim el 04-05-26?"),
    true
  );
});

test("shouldForceEventsCountByDay: false without preventive wording", () => {
  assert.equal(shouldForceEventsCountByDay("quants esdeveniments el 04-05?"), false);
});

test("extractDateYmdFromQuestion: DD-MM shorthand uses fallback year", () => {
  assert.equal(
    extractDateYmdFromQuestion("quants preventius planificats tenim el 04-05?", 2026),
    "2026-05-04"
  );
});

test("extractDateYmdFromQuestion: D/M/YYYY keeps explicit year", () => {
  assert.equal(extractDateYmdFromQuestion("preventius el 4/5/2027", 2026), "2027-05-04");
});

test("extractDateYmdFromQuestion: ISO YYYY-MM-DD wins over other tokens", () => {
  assert.equal(
    extractDateYmdFromQuestion("recompte preventius planificats 2026-05-04", 2025),
    "2026-05-04"
  );
});

test("extractDateYmdFromQuestion: day + month name in Catalan", () => {
  assert.equal(
    extractDateYmdFromQuestion("preventius planificats el 4 de maig de 2026", 2025),
    "2026-05-04"
  );
});

test("extractDateYmdFromQuestion: DD-MM-YY expands two-digit year", () => {
  assert.equal(
    extractDateYmdFromQuestion("quants preventius planificats tenim el 04-05-26?", 2023),
    "2026-05-04"
  );
});

test("extractDateYmdFromQuestion: month name + two-digit year", () => {
  assert.equal(extractDateYmdFromQuestion("preventius el 4 de maig 26", 2020), "2026-05-04");
});

test("extractDateYmdFromQuestion: two-digit year pivot 70+", () => {
  assert.equal(extractDateYmdFromQuestion("preventius el 04-05-99", 2026), "1999-05-04");
});

test("shouldForcePersonnelSearch: true for headcount by department", () => {
  assert.equal(shouldForcePersonnelSearch("Quant de personal te el departament de logistica?"), true);
});

test("extractDepartmentFromQuestion: logistics", () => {
  assert.equal(extractDepartmentFromQuestion("Quant de personal te el departament de logistica?"), "logistica");
});

test("shouldForceVehicleAssignmentsByPlate: true for van assignment question", () => {
  assert.equal(
    shouldForceVehicleAssignmentsByPlate("Quants cops em assignat la furgoneta 4259-FWD?"),
    true
  );
});

test("extractPlateFromQuestion: extracts normalized plate", () => {
  assert.equal(extractPlateFromQuestion("Quants cops em assignat la furgoneta 4259 fwd?"), "4259-FWD");
});

test("shouldForceWorkerServicesCount: true for worker services count question", () => {
  assert.equal(shouldForceWorkerServicesCount("Quants serveis ha anat el Marc Gomez?"), true);
});

test("extractWorkerNameFromQuestion: extracts person name", () => {
  assert.equal(extractWorkerNameFromQuestion("Quants serveis ha anat el Marc Gomez?"), "Marc Gomez");
});

test("normalizeCostDepartmentContains: maps subministraments typo", () => {
  assert.equal(normalizeCostDepartmentContains("subminstramtnets"), "subministr");
});
