import { createHash } from "node:crypto";
import axios from "axios";
import { countEventsByLnInMonth, countEventsInYear } from "./webapp.service.js";
import { buildCostImputationReportCalblay } from "./cost-imputation-report.js";
import { getCostImputationOverview, searchCostImputation } from "./cost-imputation.service.js";
import {
  aggregatePurchasesByBusinessLineAndCentre,
  comparePurchasesSupplierQuarters,
  getPurchasesArticleMonthSummary,
  getPurchasesByArticle,
  getPurchasesBySupplier,
  getPurchasesSupplierArticlePeriodSummary,
  getPurchasesSupplierYearSummary,
  listFinanceCsvFilesForKind,
  normalizeFinanceKind,
  previewFinanceCsv,
  searchPurchases
} from "./finances.service.js";

/** Model econòmic per defecte (pots sobreescriure amb OPENAI_MODEL). */
function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return { apiKey, model };
}

const TOOL_RESULT_MAX_CHARS = Number(process.env.OPENAI_TOOL_RESULT_MAX_CHARS || 9000);
const CHAT_CACHE_TTL_MS = Number(process.env.OPENAI_CHAT_CACHE_TTL_MS || 120_000);
const CHAT_CACHE_MAX_KEYS = Number(process.env.OPENAI_CHAT_CACHE_MAX_KEYS || 200);
const MAX_TOOL_STEPS = Number(process.env.OPENAI_MAX_TOOL_STEPS || 8);

const responseCache = new Map();

function cacheKey(model, language, question, rich) {
  const q = question.trim().toLowerCase();
  return createHash("sha256")
    .update(`${model}|${language}|${rich ? "1" : "0"}|${q}`)
    .digest("hex");
}

const CALBLAY_JSON_MARKER = "```calblay-json";

/**
 * Detecta preguntes d’informe de cost intern / sou / P&L / departaments.
 * El primer pas del bucle pot forçar `costs_imputation_overview` (tool_choice) per evitar una sola eina mal triada.
 */
function shouldForceCostImputationOverview(question) {
  const raw = String(question || "");
  const s = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const costLike =
    /\b(cost|imputaci|salar|nomina|n[oó]mina|departament|recursos\s+humans|personal)\b/i.test(s) ||
    /\bp\s*&\s*l\b/i.test(raw);
  const reportLike =
    /\b(informe|informacio|variacion|compar|trimestre|per[ií]ode)\b/i.test(s) ||
    /\b20[2-3]\d\b/.test(s) ||
    /\bt\s*[1-4]\b/i.test(s) ||
    /\b(1er|primer|1r)\b/i.test(s);
  return costLike && reportLike;
}

function normalizeReport(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tables = Array.isArray(raw.tables) ? raw.tables : [];
  const safeTables = tables.slice(0, 5).map((t) => ({
    title: String(t.title || "Taula"),
    columns: Array.isArray(t.columns) ? t.columns.map(String) : [],
    rows: Array.isArray(t.rows)
      ? t.rows.slice(0, 80).map((r) => (Array.isArray(r) ? r.map((c) => String(c)) : []))
      : []
  }));
  let chart = null;
  if (
    raw.chart &&
    typeof raw.chart === "object" &&
    Array.isArray(raw.chart.data) &&
    raw.chart.data.length
  ) {
    const rows = raw.chart.data
      .slice(0, 24)
      .map((row) => (typeof row === "object" && row !== null ? row : { value: row }));
    chart = {
      type: raw.chart.type === "line" ? "line" : "bar",
      title: String(raw.chart.title || ""),
      xKey: String(raw.chart.xKey || "label"),
      series: Array.isArray(raw.chart.series)
        ? raw.chart.series.slice(0, 4).map((s) => ({
            name: String(s.name || ""),
            dataKey: String(s.dataKey || "value"),
            color: typeof s.color === "string" ? s.color : undefined
          }))
        : [{ name: "Valor", dataKey: "value" }],
      data: rows
    };
  }
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights.slice(0, 10).map(String)
    : [];
  const kpis = Array.isArray(raw.kpis)
    ? raw.kpis.slice(0, 12).map((k, i) => {
        const fmt = String(k?.format || "text").toLowerCase();
        const format =
          fmt === "eur" || fmt === "qty" || fmt === "count" || fmt === "text" ? fmt : "text";
        return {
          id: String(k?.id || `kpi_${i}`).slice(0, 64),
          label: String(k?.label || "").slice(0, 140),
          periodALabel: String(k?.periodALabel || "").slice(0, 36),
          periodBLabel: String(k?.periodBLabel || "").slice(0, 36),
          valueA: String(k?.valueA ?? "—").slice(0, 72),
          valueB: String(k?.valueB ?? "—").slice(0, 72),
          delta:
            k?.delta !== undefined && k?.delta !== null ? String(k.delta).slice(0, 72) : undefined,
          deltaPct:
            k?.deltaPct !== undefined && k?.deltaPct !== null
              ? String(k.deltaPct).slice(0, 36)
              : undefined,
          format
        };
      })
    : [];
  return { tables: safeTables, chart, highlights, kpis };
}

function splitNarrativeAndReport(fullContent, rich) {
  const text = fullContent || "";
  if (!rich) {
    return { narrative: text.trim(), report: null };
  }
  const idx = text.lastIndexOf(CALBLAY_JSON_MARKER);
  if (idx === -1) {
    return { narrative: text.trim(), report: null };
  }
  const narrative = text.slice(0, idx).trim();
  const after = text.slice(idx + CALBLAY_JSON_MARKER.length);
  const endFence = after.indexOf("```");
  if (endFence === -1) {
    return { narrative: text.trim(), report: null };
  }
  try {
    const parsed = JSON.parse(after.slice(0, endFence).trim());
    return {
      narrative: (narrative || parsed.summary || "").trim(),
      report: normalizeReport(parsed)
    };
  } catch {
    return { narrative: text.trim(), report: null };
  }
}

function cacheGet(key) {
  if (CHAT_CACHE_TTL_MS <= 0) return null;
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    responseCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload) {
  if (CHAT_CACHE_TTL_MS <= 0) return;
  while (responseCache.size >= CHAT_CACHE_MAX_KEYS) {
    const first = responseCache.keys().next().value;
    responseCache.delete(first);
  }
  responseCache.set(key, { exp: Date.now() + CHAT_CACHE_TTL_MS, payload });
}

function shrinkToolPayload(result) {
  if (result == null) return result;
  const clone =
    typeof structuredClone === "function"
      ? structuredClone(result)
      : JSON.parse(JSON.stringify(result));

  if (clone.files && Array.isArray(clone.files) && clone.files.length > 40) {
    const total = clone.files.length;
    clone.files = clone.files.slice(0, 40);
    clone._truncatedFiles = total - 40;
  }
  if (clone.rows && Array.isArray(clone.rows) && clone.rows.length > 30) {
    const total = clone.rows.length;
    clone.rows = clone.rows.slice(0, 30);
    clone._truncatedRows = total - 30;
  }
  if (clone.byLn && Array.isArray(clone.byLn) && clone.byLn.length > 45) {
    const total = clone.byLn.length;
    clone.byLn = clone.byLn.slice(0, 45);
    clone._truncatedByLn = total - 45;
  }
  if (clone.comparison && Array.isArray(clone.comparison) && clone.comparison.length > 50) {
    const total = clone.comparison.length;
    clone.comparison = clone.comparison.slice(0, 50);
    clone._truncatedComparison = total - 50;
  }
  if (clone.reportTable && Array.isArray(clone.reportTable.rows)) {
    const nComp = clone.comparison ? clone.comparison.length : null;
    const cap = nComp != null ? Math.min(50, nComp) : 50;
    if (clone.reportTable.rows.length > cap) {
      const total = clone.reportTable.rows.length;
      clone.reportTable = { ...clone.reportTable, rows: clone.reportTable.rows.slice(0, cap) };
      clone._truncatedReportTableRows = total - cap;
    }
  }
  if (clone.articles && Array.isArray(clone.articles) && clone.articles.length > 45) {
    const total = clone.articles.length;
    clone.articles = clone.articles.slice(0, 45);
    clone._truncatedArticles = total - 45;
  }
  if (clone.byLnCentre && Array.isArray(clone.byLnCentre) && clone.byLnCentre.length > 45) {
    const total = clone.byLnCentre.length;
    clone.byLnCentre = clone.byLnCentre.slice(0, 45);
    clone._truncatedByLnCentre = total - 45;
  }

  let s = JSON.stringify(clone);
  if (s.length > TOOL_RESULT_MAX_CHARS) {
    return {
      _truncated: true,
      preview: s.slice(0, TOOL_RESULT_MAX_CHARS),
      note: "Resultat tallat per reduir cost de tokens."
    };
  }
  return clone;
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "events_count_by_year",
        description:
          "Recompte d'esdeveniments del calendari (agregació barata) per any natural. " +
          "Si l'usuari no diu l'any, omet year: el servidor usarà l'any natural actual (data del servidor), no suposis 2024.",
        parameters: {
          type: "object",
          properties: {
            year: {
              type: "integer",
              minimum: 2000,
              maximum: 2100,
              description: "Opcional. Si falta, s'usa l'any natural actual del servidor."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "events_count_by_ln_month",
        description:
          "Esdeveniments del calendari agrupats per LN (línia de negoci, camp LN a Firestore) dins UN mes natural. " +
          "Ús obligatori quan l'usuari demana recompte per LN / línia de negoci i un mes (ex. febrer 2026 → yearMonth \"2026-02\"). " +
          "No substitueix events_count_by_year (total anual sense LN).",
        parameters: {
          type: "object",
          properties: {
            yearMonth: {
              type: "string",
              description: 'Mes calendari YYYY-MM (ex. "2026-02" per febrer 2026).'
            }
          },
          required: ["yearMonth"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "finances_list_files",
        description:
          "List finance CSV file names in one category folder (compres, costos, vendes, rh). " +
          "Use kind=costos for imputació/P&L CSVs, kind=compres for purchases.",
        parameters: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["compres", "costos", "vendes", "rh"],
              description: "Which FINANCE_SUBFOLDERS segment to list (default compres)."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "finances_preview_file",
        description:
          "Preview top rows of one CSV in a category folder. Keep rows small (<=12). Match kind to the folder where the file lives.",
        parameters: {
          type: "object",
          properties: {
            file: { type: "string" },
            rows: { type: "integer", minimum: 1, maximum: 15 },
            kind: {
              type: "string",
              enum: ["compres", "costos", "vendes", "rh"],
              description: "Subfolder when FINANCE_SUBFOLDERS=true (default compres)."
            }
          },
          required: ["file"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "costs_imputation_overview",
        description:
          "Vista del CSV d'IMPUTACIÓ DE COSTOS (cost salarial / P&L per centre o departament, NO compres). " +
          "Retorna metaLines (períodes al PDF/Excel), amountColumns (cada label sol ser un període o concepte d'import) i les primeres N files amb tots els departaments/centres trobats. " +
          "CRIDA AQUESTA EINA PRIMER quan l'usuari demana variació de cost salarial per departament, comparativa entre trimestres (ex. T1 2025 vs T1 2026), P&L creuat, o no especifica cap departament. " +
          "Després pots usar costs_imputation_search amb contains per afinar un departament. No usar purchases_* per cost intern.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 10,
              maximum: 80,
              description: "Màxim de files (centres) a retornar; per defecte el servidor n'usa ~40."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "costs_imputation_search",
        description:
          "Costos / imputació salarial filtrats per mot clau de centre o departament (mateix CSV que costs_imputation_overview). " +
          "Cerca amb contains (ex. marketing, logistica, rh). La resposta inclou amountColumns i rows[].valuesByColumn: usa label de capçalera per saber quin import és de quin període. " +
          "Per preguntes globals o comparatives sense departament concret, cridar abans costs_imputation_overview. No confonguis amb purchases_search.",
        parameters: {
          type: "object",
          properties: {
            contains: {
              type: "string",
              description:
                "Mot clau del centre/departament (ex. marketing). Es toleren faltes d'ortografia lleus; preferible una paraula clau neta."
            },
            limit: { type: "integer", minimum: 1, maximum: 80 }
          },
          required: ["contains"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_search",
        description:
          "PRIMARY for purchase CSV: filter by column (normalized keys: nom_article, codi_proveidor, import, data_comptable…). Dimensions SAP: column may be dimensio_1 / ln / dim1 (línia de negoci), dimensio_2 / dim2 / centre (centre). Each condition: column + value; mode contains (default), equals, starts_with, gte, lte. Optional dateFrom/dateTo on dateField. Use finances_preview if a column is missing. " +
          "Text conditions ignore case; contains / starts_with / equals also treat runs of letters the same with or without spaces (e.g. coca cola matches COCA COLA LLAUNA). Does not fix typos (coacola ≠ cocacola).",
        parameters: {
          type: "object",
          properties: {
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  column: { type: "string" },
                  value: { type: "string" },
                  mode: {
                    type: "string",
                    enum: ["contains", "equals", "starts_with", "gte", "lte"]
                  }
                },
                required: ["column", "value"]
              }
            },
            dateFrom: { type: "string", description: "YYYY-MM-DD" },
            dateTo: { type: "string", description: "YYYY-MM-DD" },
            dateField: { type: "string", description: "Default data_comptable" },
            limit: { type: "integer", minimum: 1, maximum: 120 }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_analytics_ln_centre",
        description:
          "Analítica de compres agregada per Dimensió 1 (línia de negoci / LN) i Dimensió 2 (centre) en un interval de dates. " +
          "Retorna per cada parell LN+centre: línies de factura, quantitat, import i preu mig ponderat. Opcional supplierCode (P######) o supplierName. " +
          "Útil per a controllers: desglossament per centre i línia de negoci sense exportar a Excel.",
        parameters: {
          type: "object",
          properties: {
            dateFrom: { type: "string", description: "YYYY-MM-DD inclòs" },
            dateTo: { type: "string", description: "YYYY-MM-DD inclòs" },
            supplierCode: { type: "string", description: "Opcional, codi SAP" },
            supplierName: { type: "string" }
          },
          required: ["dateFrom", "dateTo"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_by_supplier",
        description:
          "Sample invoice lines. For SAP vendor codes like P003004 use supplierCode (exact match on code column). For name fragments use supplierName. Max ~20 lines.",
        parameters: {
          type: "object",
          properties: {
            supplierCode: {
              type: "string",
              description: "Codi proveïdor SAP (ex. P003004). Prefer this when the user gives P+digits."
            },
            supplierName: {
              type: "string",
              description: "Nom o part del nom del proveïdor (no el codi P######)."
            },
            limit: { type: "integer", minimum: 1, maximum: 25 }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_supplier_year_summary",
        description:
          "Totals anuals (import i quantitat) per proveïdor en una passada. Si l’usuari dóna codi P######, posa supplierCode (no supplierName). Si no indica any, omet year i el servidor usarà l’any natural actual.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "integer", minimum: 2000, maximum: 2100 },
            supplierCode: {
              type: "string",
              description: "Codi proveïdor SAP (ex. P003004)."
            },
            supplierName: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_supplier_article_period_summary",
        description:
          "Per un proveïdor (codi P###### o nom): agrega TOTES les línies de compra entre dateFrom i dateTo (YYYY-MM-DD) per article amb totalQuantity, totalAmount i avgUnitPrice (preu mig ponderat). " +
          "Ús: un sol període o quan els trimestres no són estàndard. Per comparar T1 vs T1 entre dos anys, preferir purchases_supplier_quarter_article_compare.",
        parameters: {
          type: "object",
          properties: {
            supplierCode: { type: "string", description: "Codi SAP (ex. P003004)" },
            supplierName: { type: "string" },
            dateFrom: { type: "string", description: "YYYY-MM-DD inclòs" },
            dateTo: { type: "string", description: "YYYY-MM-DD inclòs" }
          },
          required: ["dateFrom", "dateTo"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_supplier_quarter_article_compare",
        description:
          "COMPARACIÓ de compres per article entre dos trimestres (1–4) i mateix proveïdor. Retorna: comparison (detall), reportTable (taula llesta amb unitats, preus mig, imports, Δ i % per fila), consolidated (totals agregats Δ quantitat i Δ import). " +
          "Ús obligatori per informes de variació (ex. T1 2025 vs T1 2026) amb P######. En mode informe, omple el JSON principal amb reportTable (title, columns, rows).",
        parameters: {
          type: "object",
          properties: {
            supplierCode: { type: "string", description: "Codi SAP (ex. P003004). Preferit si l’usuari el dóna." },
            supplierName: { type: "string" },
            yearA: { type: "integer", minimum: 2000, maximum: 2100, description: "Any del primer trimestre" },
            quarterA: { type: "integer", minimum: 1, maximum: 4 },
            yearB: { type: "integer", minimum: 2000, maximum: 2100, description: "Any del segon trimestre" },
            quarterB: { type: "integer", minimum: 1, maximum: 4 }
          },
          required: ["yearA", "quarterA", "yearB", "quarterB"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_by_article",
        description:
          "Línies de factura de compra filtrades per article (codi M… o nom, p.ex. SALMO LLOMS). Opcional yearMonth=YYYY-MM. Per comparar dos mesos, crida dues vegades purchases_article_month_summary o aquesta eina amb yearMonth diferent.",
        parameters: {
          type: "object",
          properties: {
            articleCode: {
              type: "string",
              description: "Codi article SAP (ex. M0320025029)."
            },
            articleName: {
              type: "string",
              description: "Nom o part del nom (no cal majúscules ni accents)."
            },
            yearMonth: { type: "string", description: "Opcional filtre mes YYYY-MM" },
            limit: { type: "integer", minimum: 1, maximum: 80 }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "purchases_article_month_summary",
        description:
          "Resum d’un mes per article: quantitat total, import, preu mig ponderat. Per comparació de preus entre mesos, crida l’eina dues vegades (un yearMonth cada vegada). Preferir articleCode si el coneixes.",
        parameters: {
          type: "object",
          properties: {
            yearMonth: { type: "string", description: "YYYY-MM obligatori" },
            articleCode: { type: "string" },
            articleName: { type: "string" }
          }
        }
      }
    }
  ];
}

async function runTool(toolName, args) {
  if (toolName === "events_count_by_year") {
    const yRaw = args?.year;
    const y = Number(yRaw);
    const year =
      yRaw !== undefined && yRaw !== null && Number.isFinite(y) && y >= 2000 && y <= 2100
        ? y
        : new Date().getFullYear();
    return countEventsInYear(year);
  }
  if (toolName === "events_count_by_ln_month") {
    return countEventsByLnInMonth(String(args?.yearMonth || ""));
  }
  if (toolName === "finances_list_files") {
    const kind = normalizeFinanceKind(args?.kind);
    const files = await listFinanceCsvFilesForKind(kind);
    return { kind, count: files.length, files };
  }
  if (toolName === "finances_preview_file") {
    const kind = normalizeFinanceKind(args?.kind);
    const rows = Math.min(15, Math.max(1, Number(args?.rows || 8)));
    return previewFinanceCsv(String(args?.file || ""), rows, kind);
  }
  if (toolName === "costs_imputation_overview") {
    const lim = Math.min(80, Math.max(10, Number(args?.limit || 40)));
    return getCostImputationOverview({ limit: lim });
  }
  if (toolName === "costs_imputation_search") {
    const lim = Math.min(80, Math.max(1, Number(args?.limit || 25)));
    return searchCostImputation({
      contains: String(args?.contains || ""),
      limit: lim
    });
  }
  if (toolName === "purchases_search") {
    const lim = Math.min(120, Math.max(1, Number(args?.limit || 40)));
    return searchPurchases({
      conditions: Array.isArray(args?.conditions) ? args.conditions : [],
      dateFrom: args?.dateFrom ? String(args.dateFrom) : undefined,
      dateTo: args?.dateTo ? String(args.dateTo) : undefined,
      dateField: args?.dateField ? String(args.dateField) : "data_comptable",
      limit: lim
    });
  }
  if (toolName === "purchases_by_supplier") {
    const lim = Math.min(25, Math.max(1, Number(args?.limit || 15)));
    const code = args?.supplierCode != null ? String(args.supplierCode).trim() : "";
    const name = args?.supplierName != null ? String(args.supplierName).trim() : "";
    const term = code || name;
    if (!term) {
      throw new Error("Cal supplierCode (ex. P003004) o supplierName per purchases_by_supplier");
    }
    return getPurchasesBySupplier(term, lim);
  }
  if (toolName === "purchases_supplier_year_summary") {
    const yRaw = args?.year;
    const y = Number(yRaw);
    const year =
      yRaw !== undefined && yRaw !== null && Number.isFinite(y) && y >= 2000 && y <= 2100
        ? y
        : new Date().getFullYear();
    return getPurchasesSupplierYearSummary({
      year,
      supplierCode: args?.supplierCode ? String(args.supplierCode) : undefined,
      supplierName: args?.supplierName ? String(args.supplierName) : undefined
    });
  }
  if (toolName === "purchases_supplier_article_period_summary") {
    const code = args?.supplierCode != null ? String(args.supplierCode).trim() : "";
    const name = args?.supplierName != null ? String(args.supplierName).trim() : "";
    if (!code && !name) {
      throw new Error("Cal supplierCode o supplierName per purchases_supplier_article_period_summary");
    }
    return getPurchasesSupplierArticlePeriodSummary({
      supplierCode: code || undefined,
      supplierName: name || undefined,
      dateFrom: String(args?.dateFrom || ""),
      dateTo: String(args?.dateTo || "")
    });
  }
  if (toolName === "purchases_supplier_quarter_article_compare") {
    const code = args?.supplierCode != null ? String(args.supplierCode).trim() : "";
    const name = args?.supplierName != null ? String(args.supplierName).trim() : "";
    if (!code && !name) {
      throw new Error("Cal supplierCode o supplierName per purchases_supplier_quarter_article_compare");
    }
    return comparePurchasesSupplierQuarters({
      supplierCode: code || undefined,
      supplierName: name || undefined,
      yearA: Number(args?.yearA),
      quarterA: Number(args?.quarterA),
      yearB: Number(args?.yearB),
      quarterB: Number(args?.quarterB)
    });
  }
  if (toolName === "purchases_by_article") {
    const lim = Math.min(80, Math.max(1, Number(args?.limit || 25)));
    return getPurchasesByArticle({
      articleCode: args?.articleCode ? String(args.articleCode) : undefined,
      articleName: args?.articleName ? String(args.articleName) : undefined,
      yearMonth: args?.yearMonth ? String(args.yearMonth) : undefined,
      limit: lim
    });
  }
  if (toolName === "purchases_article_month_summary") {
    return getPurchasesArticleMonthSummary({
      yearMonth: String(args?.yearMonth || ""),
      articleCode: args?.articleCode ? String(args.articleCode) : undefined,
      articleName: args?.articleName ? String(args.articleName) : undefined
    });
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

export async function chatWithTools({ question, language = "ca", rich = false }) {
  const { apiKey, model } = getOpenAiConfig();
  const tools = buildTools();
  const baseMax = Math.min(800, Math.max(64, Number(process.env.OPENAI_MAX_TOKENS || 320)));
  const maxTokens = rich ? Math.min(900, baseMax + 320) : baseMax;

  const qNorm = question.trim();
  const ck = cacheKey(model, language, qNorm, rich);
  const cached = cacheGet(ck);
  if (cached) {
    return { ...cached, cached: true };
  }

  const currentYear = new Date().getFullYear();
  const systemBase =
    "Cal Blay. Tools = facts only. " +
    "Cost salarial / imputació / departaments / P&L intern: per informes que creuen períodes (ex. T1 2025 vs T1 2026) o 'per departament' sense nom concret, crida PRIMER costs_imputation_overview; després costs_imputation_search amb contains si cal un departament. " +
    "Interpreta imports amb rows.valuesByColumn i amountColumns.label (cada columna pot ser un període diferent al mateix CSV). Llegeix metaLines per dates o títol. No demanis a l'usuari les dades si pots obtenir-les amb aquestes eines; si el CSV no té la columna esperada, explica-ho amb el que sí retornen amountColumns. " +
    "Compres (factures proveïdor): purchases_search; dimensió 1 = LN, dimensió 2 = centre. purchases_analytics_ln_centre és COMPRES agregades, no cost salarial: no ho barregis amb imputació de costos. " +
    "Proveïdor P###### preu mig per article i comparació trimestres: purchases_supplier_quarter_article_compare. " +
    "Per un interval de dates arbitrari: purchases_supplier_article_period_summary. purchases_by_supplier és només mostreig; purchases_by_article / purchases_article_month_summary per article M######. " +
    `Esdeveniments: events_count_by_year (total anual); si l'usuari no indica any, omet year o usa ${currentYear}. ` +
    "Per recompte per línia de negoci (LN) i un mes concret: events_count_by_ln_month amb yearMonth=YYYY-MM (ex. febrer 2026 → 2026-02). No usar només events_count_by_year per aquestes preguntes. " +
    "finances_preview per capçaleres. " +
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

  const systemContent =
    (rich ? systemRich : systemBase + " Max 4 short sentences.") +
    supplierCodeHint +
    articleCodeHint +
    (forceCostOverview
      ? " OBLIGATORI per aquesta pregunta: la PRIMERA eina ha de ser costs_imputation_overview (sense omplir contains); després interpreta amountColumns i rows. No diguis que no hi ha dades sense haver rebut el resultat d’aquesta eina."
      : "");

  const messages = [
    {
      role: "system",
      content: systemContent
    },
    {
      role: "user",
      content: `language=${language}\nquestion=${qNorm}`
    }
  ];

  /** Informe estructurat generat al servidor (evita JSON mal format al mode informe). */
  let serverReportCalblay = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const anyToolMessageYet = messages.some((m) => m.role === "tool");
    const toolChoice =
      forceCostOverview && !anyToolMessageYet
        ? { type: "function", function: { name: "costs_imputation_overview" } }
        : "auto";

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model,
        messages,
        tools,
        tool_choice: toolChoice,
        temperature: 0,
        max_tokens: maxTokens
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 90000
      }
    );

    const choice = response.data?.choices?.[0]?.message;
    if (!choice) throw new Error("No response from OpenAI");

    messages.push(choice);

    const toolCalls = choice.tool_calls || [];
    if (!toolCalls.length) {
      const rawContent = choice.content || "";
      let { narrative, report } = splitNarrativeAndReport(rawContent, rich);
      if (rich && serverReportCalblay) {
        report = normalizeReport(serverReportCalblay);
      }
      const out = {
        model,
        answer: narrative,
        report,
        toolCallsUsed: messages.filter((m) => m.role === "tool").length,
        cached: false
      };
      cacheSet(ck, {
        model: out.model,
        answer: out.answer,
        report: out.report,
        toolCallsUsed: out.toolCallsUsed
      });
      return out;
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const name = tc.function?.name;
        let args = {};
        try {
          args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        const raw = await runTool(name, args);
        if (name === "purchases_supplier_quarter_article_compare" && raw?.reportCalblay) {
          serverReportCalblay = raw.reportCalblay;
        }
        if (
          rich &&
          (name === "costs_imputation_overview" || name === "costs_imputation_search")
        ) {
          const built = buildCostImputationReportCalblay(raw);
          if (built) serverReportCalblay = built;
        }
        const result = shrinkToolPayload(raw);
        if (result && typeof result === "object" && result.reportCalblay) {
          delete result.reportCalblay;
        }
        return { tc, result };
      })
    );
    for (const { tc, result } of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function?.name,
        content: JSON.stringify(result)
      });
    }
  }

  throw new Error("Tool loop exceeded maximum steps");
}
