import test from "node:test";
import assert from "node:assert/strict";
import { parseCostImputationCsv } from "../src/services/cost-imputation.service.js";

test("cost imputation parser detects semicolon delimiter", () => {
  const raw = [
    "Del 01/01/2026 al 31/03/2026;;;;",
    "Empresa: 38 - CATERING CAL BLAY S.L.U.;;;;",
    ";;;;",
    "Centre;Imputación;Importe bruto;Provisión pagas extras",
    "00 - SERVEIS CENTRALS - 00103005 - MARKETING;58.086,23;5.437,08;18.527,58"
  ].join("\n");

  const out = parseCostImputationCsv(raw);
  assert.ok(Array.isArray(out.rows));
  assert.equal(out.rows.length, 1);
  assert.match(out.rows[0].label.toLowerCase(), /marketing/);
});
