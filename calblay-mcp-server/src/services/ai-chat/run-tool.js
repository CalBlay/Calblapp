import { countEventsByLnInMonth, countEventsInYear } from "../webapp.service.js";
import {
  comercialsForBusinessLineForChat,
  getEventContextByCodeForChat,
  listRecentEventsForChat,
  listTransportsForChat,
  quadrantsDeptSummaryForChat,
  searchFinquesForChat,
  searchPersonnelForChat
} from "../operations-data.service.js";
import { getCostImputationOverview, searchCostImputation } from "../cost-imputation.service.js";
import {
  collectionsCatalogForChat,
  queryCollectionForChat,
} from "../firestore.service.js";
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
} from "../finances.service.js";

export async function runTool(toolName, args) {
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
  if (toolName === "firestore_collections_catalog") {
    return collectionsCatalogForChat({
      q: args?.q != null ? String(args.q) : "",
      limit: args?.limit != null ? Number(args.limit) : undefined,
      sampleLimit: args?.sampleLimit != null ? Number(args.sampleLimit) : undefined
    });
  }
  if (toolName === "firestore_query_collection") {
    return queryCollectionForChat({
      collection: String(args?.collection || ""),
      filters: Array.isArray(args?.filters) ? args.filters : [],
      fields: Array.isArray(args?.fields) ? args.fields : [],
      limit: args?.limit != null ? Number(args.limit) : undefined,
      scanLimit: args?.scanLimit != null ? Number(args.scanLimit) : undefined
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
