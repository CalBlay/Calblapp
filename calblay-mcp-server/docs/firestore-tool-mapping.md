# Firestore Tool Mapping (MCP Chat)

Aquest document defineix quin tool consulta cada col·lecció i amb quins camps clau.

## Maintenance

- `preventius_planned_count_by_day`
  - Collection: `maintenancePreventiusPlanned` (env: `FIRESTORE_PREVENTIUS_PLANNED_COLLECTION`)
  - Date field principal: `date` (env: `FIRESTORE_PREVENTIUS_PLANNED_DATE_FIELD`)
  - Date fallback: `startDate`, `DataInici`, `createdAt`
  - Entrada: `date` (`YYYY-MM-DD`)
  - Sortida clau: `total`, `byPriority`, `collection`, `dateField`, `scopeNote`

## Events / Operativa

- `events_count_by_year`
  - Collection: `stage_verd` (env: `FIRESTORE_EVENTS_COLLECTION`)
  - Date field: `DataInici` (env: `FIRESTORE_EVENTS_DATE_FIELD`)

- `events_count_by_ln_month`
  - Collection: `stage_verd`
  - Date field: `DataInici`
  - Group by: `LN` (env: `FIRESTORE_EVENTS_LN_FIELD`)

- `event_context_by_code`
  - Collection principal: `stage_verd` (`code`)
  - Enllaços secundaris: `quadrants`, `incidents`

## Notes de governança

- Les preguntes de "preventius planificats" han d'anar a `maintenancePreventiusPlanned`, no a `stage_verd`.
- Si hi ha divergència entre UI i resposta del xat, comprovar primer:
  1) col·lecció consultada,
  2) camp de data configurat,
  3) format de data inferit (`DD-MM`, `DD-MM-YY`, `YYYY-MM-DD`).

## Escalar a noves col·leccions

- Tool recomanat: `firestore_mapping_status`
  - Detecta col·leccions noves i marca `needsManualReview`.
  - Dona cobertura del diccionari (`manualCoverage.percent`).
  - Retorna `rowsNeedingManualReview` per prioritzar onboarding.

- Procés suggerit
  1) Executar `firestore_mapping_status` periòdicament.
  2) Afegir les col·leccions noves a `config/firestore_collection_dictionary.json`.
  3) Si són consultables des del xat, definir eina específica o fallback amb `firestore_query_collection`.

## Job automàtic de delta (nightly)

- Endpoint manual d'execució:
  - `POST /jobs/firestore/mapping-delta/run`
  - body opcional: `{ "q": "", "limit": 500, "sampleLimit": 8 }`

- Endpoint d'estat:
  - `GET /jobs/firestore/mapping-delta/status`
  - Retorna últim run, històric curt i store path.

- Scheduler nocturn:
  - Actiu per defecte (`FIRESTORE_MAPPING_DELTA_NIGHTLY_ENABLED=1`)
  - Execució programada cada dia a mitjanit hora del servidor.
  - Store local per defecte: `data/firestore-mapping-delta.json`
  - Es pot canviar amb `FIRESTORE_MAPPING_DELTA_STORE_PATH`.
