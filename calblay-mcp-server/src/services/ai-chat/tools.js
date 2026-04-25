/**
 * Esquemes OpenAI (function calling) per al xat.
 * Font de veritat: edita aquest fitxer (sense imports de serveis).
 */
export function buildTools() {
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
          "Dades d'operació d'UN esdeveniment a partir del codi d'esdeveniment (ex. C2500012 com a la webapp). " +
          "Retorna l'esdeveniment a Firestore, els quadrants vinculats (treballadors, grups de servei, conductors) i incidències enllaçades. " +
          "Ús obligatori quan l'usuari demana detall, personal, serveis, vehicles/conductors o incidències d'un event concret per code.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Codi d'esdeveniment (mateix que a l'app / stage_verd)."
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
          "Per dades d'un event concret (qui treballa un dia) prioritzar event_context_by_code (quadrants).",
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
          "Dades extretes del camp comercial/Comercial dels esdeveniments (calendari), no del CSV d'imputació. " +
          "Ús obligatori per «comercials de la línia…», «qui ven a empresa/casaments…» sense codi d'event; retorna noms i recompte aproximat al mostreig d'esdeveniments recents. " +
          "Si l'usuari dóna un codi C…, preferir event_context_by_code per detall d'un event.",
        parameters: {
          type: "object",
          properties: {
            lineContains: {
              type: "string",
              description:
                "Text que ha d'aparèixer a LN (línia de negoci) en minúscules/sense accents, ex. empresa, casament, food, nautic."
            },
            eventScanLimit: {
              type: "integer",
              minimum: 200,
              maximum: 5000,
              description: "Opcional. Fins a quants esdeveniments recents escanejar (per defecte ~2500). Ampliar si el resultat ve buit però hauria d'haver dades."
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
          "No és el mateix que conductors assignats a un event; per assignacions d'event usar event_context_by_code.",
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
          "Per a tot el detall d'on és un event concret, combinar amb event_context_by_code.",
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
        name: "firestore_collections_catalog",
        description:
          "Catàleg de col·leccions Firestore (actuals i futures) amb domini suggerit, camps detectats i claus de join candidates. " +
          "Ús obligatori quan la pregunta fa referència a una col·lecció/mòdul no cobert per una eina específica (ex. projectes, al·lèrgens, nous mòduls).",
        parameters: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: "Opcional. Filtre per nom de col·lecció (contains)."
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Màxim col·leccions a inspeccionar (default ~120)."
            },
            sampleLimit: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              description: "Mostra de documents per col·lecció per inferir camps (default ~8)."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "firestore_query_collection",
        description:
          "Consulta genèrica de qualsevol col·lecció Firestore (incloses noves) amb filtres i projecció de camps. " +
          "Llegeix un subconjunt controlat (scanLimit) i filtra en memòria. Ideal per al·lèrgens, projectes o mòduls nous quan encara no hi ha eina dedicada.",
        parameters: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Nom exacte de la col·lecció Firestore."
            },
            filters: {
              type: "array",
              description: "Filtres opcionals sobre camps.",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  op: {
                    type: "string",
                    enum: ["contains", "equals", "starts_with", "gte", "lte"]
                  },
                  value: {
                    type: "string",
                    description: "Valor comparat (text, número o data representada com text)."
                  }
                },
                required: ["field", "value"]
              }
            },
            fields: {
              type: "array",
              description: "Camps a retornar (projectar). Si s'omet, retorna el document complet.",
              items: { type: "string" }
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              description: "Màxim de files retornades."
            },
            scanLimit: {
              type: "integer",
              minimum: 20,
              maximum: 2000,
              description: "Quantes files escanejar abans de filtrar (cost/rendiment)."
            }
          },
          required: ["collection"]
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
