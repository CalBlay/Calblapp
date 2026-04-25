# Project Blueprint Executable - Cal Blay MCP

## 1) Purpose

Build a reliable, scalable MCP server for operational queries and professional reports across Firestore, Finance CSV, and future SAP/Delsys integrations, with ML readiness from day one.

## 2) Final Product Goals

- Natural-language operational queries with data-backed answers.
- Professional reports (tables, conclusions, charts when applicable).
- Strict semantic consistency (`event_code`, `dimension_1`, `dimension_2`).
- Governed access to collections and sensitive data.
- Extensible architecture for new collections and ML use cases.

## 3) Architecture (Implemented Direction)

### 3.1 Core Layers

- `src/core/contracts/`
  - Canonical output contract (`QueryResult`, `QueryError`).
- `src/core/semantics/`
  - Intent/domain detection and routing hints.
- `src/core/policies/`
  - Data-backed answer policy (no generic answer for data intents).
- `src/services/`
  - Connectors/adapters for Firestore and Finance CSV.
- `src/services/ai-chat*`
  - Tool schemas, tool runner, orchestration loop.
- `config/`
  - Canonical dictionaries and collection governance.

### 3.2 Data Governance Artifacts

- `config/canonical_dictionary/`
  - `catalog_dimension_1.csv`
  - `catalog_dimension_2.csv`
  - `catalog_dimension_3.csv`
  - `catalog_center_alias.csv`
  - `data_quality_issues.csv`
- `config/firestore_collection_dictionary.json`
  - domain, owner, sensitivity, join keys, ML metadata.

## 4) Canonical Data Model

- `event_code`: event primary key when available.
- `dimension_1`: business line (LN).
- `dimension_2`: center/location/restaurant.
- `source_system`: `firestore|csv_finances|sap|delsys`.
- `confidence`: `high|medium|low`.
- `join_rule`: explicit join strategy used in answer.

## 5) Query/Report Reliability Rules

- Data intent queries must use data tools.
- If no data tool call succeeds, answer must explicitly state data was not validated.
- Prefer domain-specific tools over generic collection querying.
- Generic Firestore tools are fallback for uncovered/new collections.
- Every meaningful data answer should expose source and confidence.

## 6) Firestore Strategy (Scalable by Design)

- Discovery:
  - `/tools/firestore/collections`
  - `/tools/firestore/domain-mapping-detailed`
- Governance:
  - `/tools/firestore/collection-dictionary`
  - Manual dictionary + auto inference fusion.
- Generic querying:
  - `firestore_collections_catalog`
  - `firestore_query_collection`
- Access control:
  - `FIRESTORE_QUERY_ALLOWED_COLLECTIONS`
  - `FIRESTORE_QUERY_BLOCKED_COLLECTIONS`
  - sensitivity from collection dictionary (`admin_only`).

## 7) Finance Strategy

- CSV structure normalized via canonical dictionary.
- Sales analytics tools:
  - `sales_by_centre_month`
  - `sales_top_articles_by_establishment`
  - `sales_by_article_centre_month` (article + centre + month exact case).
- Purchase analytics tools remain isolated from sales logic.

## 8) Food Safety Strategy

- Dedicated tool for celiac-safe dishes:
  - `food_safety_celiac_dishes` (Firestore `plats`, `alergeno.gluten=NO`).
- Prevent generic dietary answers without data lookup.

## 9) Performance & Cost Controls

- Catalog/mapping cache TTL:
  - `FIRESTORE_CATALOG_CACHE_TTL_MS` (default 120000 ms).
- Payload trimming for generic collection responses.
- Query limits and scan limits enforced in generic querying.
- Cache observability:
  - `/tools/firestore/cache-stats`
  - `/tools/firestore/cache-clear`

## 10) Security & Access

- API key guard at route level.
- Collection sensitivity policy (`admin_only`) enforced.
- Env-driven allow/block lists for query surface hardening.
- No secrets in repo files; secrets in environment only.

## 11) ML-Ready Foundation

- Collection-level metadata:
  - `mlReady`
  - `mlFeatures`
  - `mlLabelCandidates`
- Canonical contracts simplify future feature extraction pipelines.
- No ML model coupling in query path yet (clean separation maintained).

## 12) Runtime Environments

### Local validation

- `npm run dev` in `calblay-mcp-server`.
- Requires Firebase/OpenAI/API keys in env (`.env`, `.env.local`, or runtime env).

### Production deployment

- Cloud Run deploy from `calblay-mcp-server`:
  - `gcloud run deploy calblay-mcp-server --source . --region europe-west1`

## 13) Definition of Done (DoD)

A release is valid only if:

- Core services boot cleanly.
- Canonical dictionary loads without missing required files.
- At least one end-to-end query per domain returns data-backed output.
- `Eines MCP > 0` for domain data questions.
- No generic hallucinated answer for data intent.
- Firestore dictionary snapshot reports manual coverage and pending reviews.

## 14) Immediate Test Checklist

1. `plats aptes per celiacs i codi` -> uses food safety tool and returns Firestore-backed data.
2. `vendes d'aigua al Nautic el 2026-02` -> uses article+centre+month sales tool.
3. unknown module question -> uses collection catalog + generic query path.
4. blocked collection query -> denied by policy.
5. cache stats endpoint shows activity after repeated catalog queries.

## 15) Controlled Evolution Plan

- Phase A: stabilize domain-specific query quality and coverage.
- Phase B: extend report templates with strict source/confidence rendering.
- Phase C: add integration tests for deterministic tool routing.
- Phase D: introduce ML tasks on top of canonical contracts and dictionary metadata.

---

Owner: Cal Blay IT + Operativa  
Document type: executable architecture baseline  
Status: active
