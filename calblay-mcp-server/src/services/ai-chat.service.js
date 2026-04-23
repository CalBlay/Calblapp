import { createHash } from "node:crypto";
import axios from "axios";
import { countEventsByLnInMonth, countEventsInYear } from "./webapp.service.js";
import {
  comercialsForBusinessLineForChat,
  getEventContextByCodeForChat,
  listRecentEventsForChat,
  listTransportsForChat,
  quadrantsDeptSummaryForChat,
  searchFinquesForChat,
  searchPersonnelForChat
} from "./operations-data.service.js";
import { buildCostImputationReportCalblay } from "./cost-imputation-report.js";
import { getCostImputationOverview, searchCostImputation } from "./cost-imputation.service.js";
import {
  aggregatePurchasesByBusinessLineAndCentre,
  aggregateSalesByCentreMonth,
  aggregateVendesTopArticlesByEstablishment,
  comparePurchasesSupplierQuarters,
  getPurchasesArticleMonthSummary,
  getPurchasesByArticle,
  getPurchasesBySupplier,
  getPurchasesSupplierArticlePeriodSummary,
  getPurchasesSupplierYearSummary,
  getPurchasesTopArticlesByAmount,
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
  // Quadrants d'operació (planificació per departament a Firestore), no CSV d'imputació: no forçar cost.
  if (/\bquadrants?\b/.test(s)) {
    const financialContext =
      /\b(imputaci|imputacion|cost\s*salar|n[oó]mina|sou|p\s*[\&\u0026]\s*l|p&l|trimestre|imput\w*.*(cost|salar)|variaci\w*.*(cost|sou))\b/i.test(
        s
      ) || /\b20[2-3]\d\b.*\b(cost|salar|nomina|imput)\b/i.test(s);
    if (!financialContext) return false;
  }
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
  if (clone.rows && Array.isArray(clone.rows) && clone.kind === "vendes" && clone.rows.length > 80) {
    const total = clone.rows.length;
    clone.rows = clone.rows.slice(0, 80);
    clone._truncatedSalesRows = total - 80;
  }
  if (
    clone.kind === "vendes" &&
    clone.byCentre &&
    Array.isArray(clone.byCentre) &&
    clone.byCentre.length > 40
  ) {
    const total = clone.byCentre.length;
    clone.byCentre = clone.byCentre.slice(0, 40);
    clone._truncatedByCentre = total - 40;
  }
  if (
    clone.kind === "vendes" &&
    clone.byMonth &&
    Array.isArray(clone.byMonth) &&
    clone.byMonth.length > 36
  ) {
    const total = clone.byMonth.length;
    clone.byMonth = clone.byMonth.slice(0, 36);
    clone._truncatedByMonth = total - 36;
  }
  if (
    clone.kind === "vendes" &&
    clone.fileErrors &&
    Array.isArray(clone.fileErrors) &&
    clone.fileErrors.length > 8
  ) {
    const total = clone.fileErrors.length;
    clone.fileErrors = clone.fileErrors.slice(0, 8);
    clone._truncatedFileErrors = total - 8;
  }
  if (
    clone.kind === "vendes" &&
    clone.ranking === "top_articles_by_establishment" &&
    Array.isArray(clone.top) &&
    clone.top.length > 35
  ) {
    const total = clone.top.length;
    clone.top = clone.top.slice(0, 35);
    clone._truncatedTopArticles = total - 35;
  }
  if (clone.personnel && Array.isArray(clone.personnel) && clone.personnel.length > 50) {
    const total = clone.personnel.length;
    clone.personnel = clone.personnel.slice(0, 50);
    clone._truncatedPersonnel = total - 50;
  }
  if (clone.finques && Array.isArray(clone.finques) && clone.finques.length > 30) {
    const total = clone.finques.length;
    clone.finques = clone.finques.slice(0, 30);
    clone._truncatedFinques = total - 30;
  }
  if (clone.events && Array.isArray(clone.events) && clone.events.length > 40) {
    const total = clone.events.length;
    clone.events = clone.events.slice(0, 40);
    clone._truncatedEvents = total - 40;
  }
  if (clone.kind === "quadrants_dept" && Array.isArray(clone.items) && clone.items.length > 35) {
    const total = clone.items.length;
    clone.items = clone.items.slice(0, 35);
    clone._truncatedQuadrantItems = total - 35;
  }
  if (clone.kind === "comercials_by_ln" && Array.isArray(clone.comercials) && clone.comercials.length > 80) {
    const total = clone.comercials.length;
    clone.comercials = clone.comercials.slice(0, 80);
    clone._truncatedComercials = total - 80;
  }
  if (clone.vehicles && Array.isArray(clone.vehicles) && clone.vehicles.length > 80) {
    const total = clone.vehicles.length;
    clone.vehicles = clone.vehicles.slice(0, 80);
    clone._truncatedVehicles = total - 80;
  }
  if (clone.quadrants && Array.isArray(clone.quadrants) && clone.quadrants.length > 25) {
    const total = clone.quadrants.length;
    clone.quadrants = clone.quadrants.slice(0, 25);
    clone._truncatedQuadrants = total - 25;
  }
  if (clone.incidents && Array.isArray(clone.incidents) && clone.incidents.length > 25) {
    const total = clone.incidents.length;
    clone.incidents = clone.incidents.slice(0, 25);
    clone._truncatedIncidents = total - 25;
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
        name: "event_context_by_code",
        description:
          "Dades d’operació d’UN esdeveniment a partir del codi d’esdeveniment (ex. C2500012 com a la webapp). " +
          "Retorna l’esdeveniment a Firestore, els quadrants vinculats (treballadors, grups de servei, conductors) i incidències enllaçades. " +
          "Ús obligatori quan l'usuari demana detall, personal, serveis, vehicles/conductors o incidències d’un event concret per code.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Codi d’esdeveniment (mateix que a l’app / stage_verd)."
            }
          },
          required: ["code"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "events_list_recent",
        description:
          "Els darrers esdeveniments del calendari (ordre per data) amb id, code, nom i dates. " +
          "Quan l'usuari vol veure llista o context sense un codi concret.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 5,
              maximum: 100,
              description: "Opcional, per defecte ~30."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "personnel_search",
        description:
          "Personal (treballadors) a la col·lecció Firestore `personnel`. Filtre opcional per nom/correu i per text al camp `role`. " +
          "Això NO llista comercials assignats per línia de negoci (LN) als esdeveniments: per això usar comercials_for_business_line. " +
          "Per dades d’un event concret (qui treballa un dia) prioritzar event_context_by_code (quadrants).",
        parameters: {
          type: "object",
          properties: {
            nameContains: {
              type: "string",
              description: "Opcional. Part del nom o text a cercar (tolerància sense accents)."
            },
            roleContains: {
              type: "string",
              description: "Opcional. Subcadena al rol en minúscules/variant (ex. comercial) si consta al document de personnel."
            },
            limit: { type: "integer", minimum: 5, maximum: 100 }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "comercials_for_business_line",
        description:
          "Llista noms de comercial la línia de negoci (LN) del qual coincideix amb el text (ex. «empresa» pot coincidir amb «Empreses» o «Empresa» als esdeveniments). " +
          "Dades extretes del camp comercial/Comercial dels esdeveniments (calendari), no del CSV d’imputació. " +
          "Ús obligatori per «comercials de la línia…», «qui ven a empresa/casaments…» sense codi d’event; retorna noms i recompte aproximat al mostreig d’esdeveniments recents. " +
          "Si l’usuari dóna un codi C…, preferir event_context_by_code per detall d’un event.",
        parameters: {
          type: "object",
          properties: {
            lineContains: {
              type: "string",
              description:
                "Text que ha d’aparèixer a LN (línia de negoci) en minúscules/sense accents, ex. empresa, casament, food, nautic."
            },
            eventScanLimit: {
              type: "integer",
              minimum: 200,
              maximum: 5000,
              description: "Opcional. Fins a quants esdeveniments recents escanejar (per defecte ~2500). Ampliar si el resultat ve buit però hauria d’haver dades."
            }
          },
          required: ["lineContains"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "vehicles_list",
        description:
          "Llista de vehicles (col·lecció transports: matrícula, tipus). " +
          "No és el mateix que conductors assignats a un event; per assignacions d’event usar event_context_by_code.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 5, maximum: 120 }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "finques_search",
        description:
          "Cerca finques o espais (col·lecció finques: nom, codi). Mínim 2 caràcters de cerca. " +
          "Per a tot el detall d’on és un event concret, combinar amb event_context_by_code.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Text a cercar a nom, codi o camp searchable (>= 2 caràcters)."
            },
            limit: { type: "integer", minimum: 1, maximum: 40 }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "quadrants_dept_summary",
        description:
          "Quadrants d'OPERACIÓ / planificació de serveis a Firestore (col·leccions com quadrantsLogistica, quadrantsCuina): esborranys i confirmats, codi d'event, dates. " +
          "Ús obligatori per «quants quadrants», «quadrants confirmats», llistat per departament (logística, cuina, serveis…) dins un període. " +
          "Això NO és el CSV d'imputació de costos salarials: per costos / nòmina / T1 P&L usar costs_imputation_*, no aquesta eina. " +
          "Per un sol esdeveniment concret amb codi C… usar event_context_by_code.",
        parameters: {
          type: "object",
          properties: {
            department: {
              type: "string",
              description:
                "Departament com a l'app: logistica, cuina, serveis, bar, sala… (tolerància d'accents; ha de coincidir amb el sufix de la col·lecció quadrants* del projecte)."
            },
            start: {
              type: "string",
              description: "Opcional. Inici de rang data d'inici de servei YYYY-MM-DD. Si falta, s'usa el dilluns de la setmana natural actual."
            },
            end: {
              type: "string",
              description: "Opcional. Fi de rang YYYY-MM-DD. Si falta, s'usa el diumenge de la setmana natural actual."
            },
            status: {
              type: "string",
              enum: ["all", "confirmed", "draft"],
              description: "Opcional. Filtra per estat: all (per defecte), només confirmats, només esborrany."
            }
          },
          required: ["department"]
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
        name: "sales_by_centre_month",
        description:
          "PRIMARY for sales/revenue from vendes CSV exports: aggregates cobrades (or brut) EUR and units by establishment (centre) and calendar month. " +
          "Uses column jornada (values like 2026-01 or 2026-01 enero). " +
          "Call this when the user asks vendes/facturació/billing by centre and month/year. " +
          "Optional year filters rows to that calendar year. " +
          "Optional file limits to one data file in the vendes folder (.csv, .tsv, or extensionless export); omit to scan all listable files there. " +
          "If unsure of file names, call finances_list_files kind=vendes first.",
        parameters: {
          type: "object",
          properties: {
            year: {
              type: "integer",
              minimum: 2000,
              maximum: 2100,
              description: "Optional. Filter to this calendar year (e.g. 2026). Omit to include all years in the files."
            },
            file: {
              type: "string",
              description: "Optional. One file name inside the vendes folder. Omit to aggregate every tabular file there."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "sales_top_articles_by_establishment",
        description:
          "PRIMARY for vendes exports (carpeta vendes, NOT compres/SAP): best-selling articles/products at one establishment. " +
          "Keeps rows whose centre column contains centreContains (e.g. NAUTIC; case/accent insensitive), groups by article column, sums cobrades EUR or units. " +
          "Use for «article més venut», «més vendes al NAUTIC», top product by revenue at a site. " +
          "Optional year filters jornada; optional file; else all listable files in vendes. Call finances_list_files kind=vendes if the user names a specific export.",
        parameters: {
          type: "object",
          properties: {
            centreContains: {
              type: "string",
              description: 'Substring of establishment name as in CSV centre column (ex. "NAUTIC", "MASIA").'
            },
            year: {
              type: "integer",
              minimum: 2000,
              maximum: 2100,
              description: "Optional. Limit to this calendar year from jornada YYYY-MM."
            },
            file: { type: "string", description: "Optional single file in vendes folder." },
            topN: { type: "integer", minimum: 1, maximum: 40 },
            metric: {
              type: "string",
              enum: ["amount", "quantity"],
              description: "Rank by EUR (amount, default) or units (quantity)."
            }
          },
          required: ["centreContains"]
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
          "No usar per quadrants de planificació d'serveis (comptar confirmats a logística, etc.): això és quadrants_dept_summary. " +
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
          "Cerca amb contains (ex. marketing, rh). La resposta inclou amountColumns i rows[].valuesByColumn: usa label de capçalera per saber quin import és de quin període. " +
          "No confondre 'logística' com a centre de cost amb quadrants d'operació: per «quants quadrants confirmats a logística» usar quadrants_dept_summary amb department=logistica. " +
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
          "Purchase CSV row filter (NOT for ranking “top article” by total spend—use purchases_top_articles_by_amount). " +
          "Filter by column (normalized keys: nom_article, codi_proveidor, import, data_comptable…). Dimensions SAP: column may be dimensio_1 / ln / dim1 (línia de negoci), dimensio_2 / dim2 / centre (centre). Each condition: column + value; mode contains (default), equals, starts_with, gte, lte. Optional dateFrom/dateTo on dateField. Use finances_preview if a column is missing. " +
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
        name: "purchases_top_articles_by_amount",
        description:
          "MANDATORY for questions like: which article was bought the most, top articles by purchase value/amount, ranking articles by import for a month or year (COMPRES / SAP purchase lines, not vendes sales). " +
          "Aggregates every invoice line in the period, groups by article code+name, sums import and quantity, returns sorted top N. " +
          "Prefer yearMonth=YYYY-MM when the user names one calendar month (febrer/febrero 2026 → 2026-02; gener/enero → 2026-01). " +
          "For a full calendar year use dateFrom YYYY-01-01 and dateTo YYYY-12-31. " +
          "Do NOT infer the winner from purchases_search line samples. purchases_article_month_summary requires a known article; do not use it alone for ranking.",
        parameters: {
          type: "object",
          properties: {
            yearMonth: {
              type: "string",
              description: 'Single month YYYY-MM (ex. "2026-02"). Omit if using dateFrom/dateTo instead.'
            },
            dateFrom: { type: "string", description: "YYYY-MM-DD inclòs (with dateTo if no yearMonth)" },
            dateTo: { type: "string", description: "YYYY-MM-DD inclòs" },
            topN: { type: "integer", minimum: 1, maximum: 40, description: "How many ranked articles to return (default 15)" },
            metric: {
              type: "string",
              enum: ["amount", "quantity"],
              description: "Sort by total EUR (amount, default) or total units (quantity)"
            }
          }
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
          "Resum d’un mes per UN article concret (cal articleCode o articleName). No serveix per saber quin article és el més comprat del mes—per això usa purchases_top_articles_by_amount. " +
          "Quantitat total, import, preu mig ponderat. Per comparació de preus entre mesos, crida l’eina dues vegades (un yearMonth cada vegada). Preferir articleCode si el coneixes.",
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
  if (toolName === "event_context_by_code") {
    return getEventContextByCodeForChat(String(args?.code || ""));
  }
  if (toolName === "events_list_recent") {
    return listRecentEventsForChat({ limit: args?.limit });
  }
  if (toolName === "personnel_search") {
    return searchPersonnelForChat({
      nameContains: args?.nameContains,
      roleContains: args?.roleContains,
      limit: args?.limit
    });
  }
  if (toolName === "comercials_for_business_line") {
    return comercialsForBusinessLineForChat({
      lineContains: String(args?.lineContains || ""),
      eventScanLimit: args?.eventScanLimit != null ? Number(args.eventScanLimit) : undefined
    });
  }
  if (toolName === "vehicles_list") {
    return listTransportsForChat({ limit: args?.limit });
  }
  if (toolName === "finques_search") {
    return searchFinquesForChat({
      query: args?.query,
      limit: args?.limit
    });
  }
  if (toolName === "quadrants_dept_summary") {
    return quadrantsDeptSummaryForChat({
      department: String(args?.department || ""),
      start: args?.start != null ? String(args.start) : undefined,
      end: args?.end != null ? String(args.end) : undefined,
      status: args?.status != null ? String(args.status) : undefined
    });
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
  if (toolName === "sales_by_centre_month") {
    const f = args?.file != null ? String(args.file).trim() : "";
    return aggregateSalesByCentreMonth({
      year: args?.year,
      file: f || undefined
    });
  }
  if (toolName === "sales_top_articles_by_establishment") {
    const f = args?.file != null ? String(args.file).trim() : "";
    return aggregateVendesTopArticlesByEstablishment({
      centreContains: String(args?.centreContains ?? ""),
      year: args?.year,
      file: f || undefined,
      topN: args?.topN != null ? Number(args.topN) : undefined,
      metric: args?.metric != null ? String(args.metric) : undefined
    });
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
  if (toolName === "purchases_analytics_ln_centre") {
    return aggregatePurchasesByBusinessLineAndCentre({
      dateFrom: String(args?.dateFrom || ""),
      dateTo: String(args?.dateTo || ""),
      supplierCode: args?.supplierCode ? String(args.supplierCode) : undefined,
      supplierName: args?.supplierName ? String(args.supplierName) : undefined
    });
  }
  if (toolName === "purchases_top_articles_by_amount") {
    const ym = args?.yearMonth != null ? String(args.yearMonth).trim().slice(0, 7) : "";
    const df = args?.dateFrom != null ? String(args.dateFrom).trim().slice(0, 10) : "";
    const dt = args?.dateTo != null ? String(args.dateTo).trim().slice(0, 10) : "";
    const topN = args?.topN != null ? Number(args.topN) : 15;
    const metric = args?.metric != null ? String(args.metric) : "amount";
    return getPurchasesTopArticlesByAmount({
      yearMonth: ym || undefined,
      dateFrom: df || undefined,
      dateTo: dt || undefined,
      topN,
      metric
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
  /** sense prou tokens, les tool_calls es truncuen i el bucle falla (errors 500 opacs en producció). */
  const envMax = Number(process.env.OPENAI_MAX_TOKENS || 1200);
  const baseMax = Math.min(4096, Math.max(1024, Number.isFinite(envMax) ? envMax : 1200));
  const maxTokens = rich ? Math.min(4096, baseMax + 512) : baseMax;

  const qNorm = question.trim();
  const ck = cacheKey(model, language, qNorm, rich);
  const cached = cacheGet(ck);
  if (cached) {
    return { ...cached, cached: true };
  }

  const currentYear = new Date().getFullYear();
  const systemBase =
    "Cal Blay. Tools = facts only. " +
    "Quadrants d'operació (planificació de serveis, confirmats/esborranys per departament com logística o cuina): quadrants_dept_summary. No usar costs_imputation_* per això (aquestes són dades de cost salarial a CSV, no les col·leccions quadrants* de l'app). " +
    "Cost salarial / imputació / P&L intern: per informes que creuen períodes (ex. T1 2025 vs T1 2026) o variació de cost per centre, crida PRIMER costs_imputation_overview; després costs_imputation_search amb contains si cal. " +
    "Interpreta imports amb rows.valuesByColumn i amountColumns.label (cada columna pot ser un període diferent al mateix CSV). Llegeix metaLines per dates o títol. No demanis a l'usuari les dades si pots obtenir-les amb aquestes eines; si el CSV no té la columna esperada, explica-ho amb el que sí retornen amountColumns. " +
    "Compres (factures proveïdor): purchases_search; dimensió 1 = LN, dimensió 2 = centre. purchases_analytics_ln_centre = agregat per LN+centre (no cost salarial / imputació). " +
    "Per «article més comprat», «top articles», «més comprat per valor/import» en COMPRES: purchases_top_articles_by_amount (yearMonth YYYY-MM o dateFrom/dateTo); mai endevinis el guanyador amb un mostreig de purchases_search. " +
    "Proveïdor P###### preu mig per article i comparació trimestres: purchases_supplier_quarter_article_compare. " +
    "Per un interval de dates arbitrari: purchases_supplier_article_period_summary. purchases_by_supplier és només mostreig; purchases_by_article / purchases_article_month_summary per article M######. " +
    `Esdeveniments: events_count_by_year (total anual); si l'usuari no indica any, omet year o usa ${currentYear}. ` +
    "Per recompte per línia de negoci (LN) i un mes concret: events_count_by_ln_month amb yearMonth=YYYY-MM (ex. febrer 2026 → 2026-02). No usar només events_count_by_year per aquestes preguntes. " +
    "Producció / operació (mateixa base Firestore que l'app, enllaç principal: code d'esdeveniment): " +
    "event_context_by_code quan l'usuari dóna un codi (C… o id) i vol detall, quadrants, treballadors/conductors per grups, incidències. " +
    "quadrants_dept_summary per recomptes o llistats de quadrants per departament (sense codi C…) en un interval de dates (per defecte setmana actual). " +
    "comercials_for_business_line per llistar noms de comercial segons la línia de negoci (LN) als esdeveniments (ex. 'empresa'); no és personnel_search. " +
    "events_list_recent per llistar darrers events sense codi. personnel_search per llista de personal (nom o correu, opcional roleContains). " +
    "vehicles_list per vehicle/matrícula a la flota. finques_search per finques o espais (>=2 lletres). " +
    "Quan el codi d'event C… apareix a la pregunta, crida event_context_by_code abans d'inferir. " +
    "finances_preview per capçaleres. " +
    "Vendes / facturació (fitxers a carpeta vendes, no SAP compres): imports per centre i mes → sales_by_centre_month; article més venut / més vendes a un centre concret (ex. NAUTIC) → sales_top_articles_by_establishment amb centreContains. finances_list_files kind=vendes si cal el nom del fitxer. " +
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

  const systemContent =
    (rich ? systemRich : systemBase + " Max 4 short sentences.") +
    supplierCodeHint +
    articleCodeHint +
    eventCodeHint +
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
        let raw;
        try {
          raw = await runTool(name, args);
        } catch (toolErr) {
          raw = {
            ok: false,
            toolError: true,
            tool: name,
            message: toolErr instanceof Error ? toolErr.message : String(toolErr)
          };
        }
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
