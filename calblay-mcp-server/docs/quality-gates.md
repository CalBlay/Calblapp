# Quality Gates (DoD + Evolution)

Aquest servidor inclou portes de qualitat executables per al blueprint.

## Endpoints

- `GET /jobs/quality/dod-check`
  - Executa comprovacions de Definition of Done (DoD).
  - Inclou estat del diccionari canònic, cobertura del mapping, política anti-resposta genèrica, base ML i lock de `query execution policy` (deterministic + source lock).

- `GET /jobs/quality/evolution-checklist`
  - Retorna checklist de fases A→D amb comprovacions automàtiques.
  - Inclou també la sortida DoD.

- `POST /jobs/quality/dod-snapshot`
  - Desa un snapshot JSONL del DoD per tracking de release.
  - Body opcional: `{ "releaseTag": "v2026.04.25-rc1" }`

- `GET /jobs/quality/dod-history?limit=30`
  - Llegeix l'històric recent de snapshots DoD.

## CLI

- `npm run quality:report`
  - Imprimeix en JSON el mateix paquet de dades (DoD + Evolution checklist) i afegeix:
    - `toolChoiceStats` (legacy/planner/auto als últims N traces)
    - `alerts.plannerAdoption` (alerta de share mínim del planner quan està activada)

- `npm run quality:golden`
  - Executa el golden business suite (`config/golden_business_cases.json`).
  - Valida per cas: `metricId`, policy/source lock i execució determinista.
  - Si algun cas falla, retorna codi de sortida diferent de zero (apta per bloqueig a CI).
  - Si falten credencials Firebase, per defecte salta casos `policySystem=firestore` (`GOLDEN_ALLOW_SKIP_FIRESTORE=1`).
  - Si falta font de finances al runner, per defecte salta casos `policySystem=csv_finances` (`GOLDEN_ALLOW_SKIP_FINANCE=1`).

- `npm run quality:drift`
  - Compara traces recents (`data/ml-learning/chat-traces.jsonl`) amb expectatives del golden.
  - Detecta desviacions en `metricId` (i en casos CSV, desviació de `sourceOfTruth.system`).
  - Thresholds configurables:
    - `QUALITY_DRIFT_TRACE_LIMIT` (default `300`)
    - `QUALITY_DRIFT_MIN_MATCHED` (default `1`)
    - `QUALITY_DRIFT_MAX_MISMATCH_PERCENT` (default `0`)

- `npm run quality:ci`
  - Executa la cadena de gates de qualitat per CI:
    - `npm run test:quality`
    - `npm run quality:golden`
    - `npm run quality:drift`
  - Si qualsevol pas falla, el pipeline ha de quedar bloquejat.

Variables opcionals per al report:

- `QUALITY_PLANNER_STATS_LIMIT` (default `200`)
- `QUALITY_PLANNER_MIN_PERCENT` (default `15`)
- `QUALITY_PLANNER_ALERT_ENABLED` (`1`/`0`; si no es defineix, segueix `QUERY_PLANNER_TOOL_CHOICE`)
- `QUALITY_ALLOW_SKIP_FIRESTORE` (default `1`; si falten credencials Firebase, no falla `quality:report` i marca checks Firestore com `skipped`)

## Presets d'entorn recomanats

### Local (sense credencials Firebase)

Objectiu: poder treballar amb qualitat i observabilitat sense bloquejos per Firestore.

```powershell
set QUERY_PLANNER_TOOL_CHOICE=1
set QUERY_PLANNER_DETERMINISTIC_EXECUTOR=1
set QUERY_PLANNER_STRICT_CATALOG_EXECUTOR=1

set QUALITY_PLANNER_ALERT_ENABLED=1
set QUALITY_PLANNER_MIN_PERCENT=15
set QUALITY_PLANNER_STATS_LIMIT=200

set QUALITY_ALLOW_SKIP_FIRESTORE=1
set GOLDEN_ALLOW_SKIP_FIRESTORE=1
set GOLDEN_ALLOW_SKIP_FINANCE=1

set QUALITY_DRIFT_TRACE_LIMIT=300
set QUALITY_DRIFT_MIN_MATCHED=1
set QUALITY_DRIFT_MAX_MISMATCH_PERCENT=0
```

### CI estricte (amb credencials Firebase)

Objectiu: bloquejar release si hi ha regressions o cobertura incompleta.

```powershell
set QUERY_PLANNER_TOOL_CHOICE=1
set QUERY_PLANNER_DETERMINISTIC_EXECUTOR=1
set QUERY_PLANNER_STRICT_CATALOG_EXECUTOR=1

set QUALITY_PLANNER_ALERT_ENABLED=1
set QUALITY_PLANNER_MIN_PERCENT=15
set QUALITY_PLANNER_STATS_LIMIT=500

set QUALITY_ALLOW_SKIP_FIRESTORE=0
set GOLDEN_ALLOW_SKIP_FIRESTORE=0
set GOLDEN_ALLOW_SKIP_FINANCE=1

set QUALITY_DRIFT_TRACE_LIMIT=500
set QUALITY_DRIFT_MIN_MATCHED=5
set QUALITY_DRIFT_MAX_MISMATCH_PERCENT=0
```

Pipeline recomanat:

```powershell
npm run quality:ci
```

## GitHub Actions

Workflow disponible: `.github/workflows/quality-ci.yml`

- `pull_request -> main`: mode baseline (sense Firebase obligatori)
- `push -> main`: mode estricte (Firebase obligatori, no es permet `skip` de casos Firestore)

Secrets requerits a GitHub (`Settings -> Secrets and variables -> Actions`):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Secrets opcionals per validar golden de finances contra GCS:

- `FINANCE_SOURCE` (`gcs`)
- `FINANCE_SUBFOLDERS` (`true`)
- `GCS_BUCKET`
- `GCS_FINANCE_BASE`
- `GOOGLE_PROJECT_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `FINANCE_COST_CSV` / `FINANCE_COST_CSV_KIND` si cal forÃ§ar el fitxer.

## Ús recomanat

1. Llançar `GET /jobs/quality/dod-check` abans de release.
2. Llançar `GET /jobs/quality/evolution-checklist` després de cada iteració gran.
3. Persistir resultats a CI o observabilitat per veure tendència.
4. Abans de cada release: cridar `POST /jobs/quality/dod-snapshot` amb `releaseTag`.
5. En entorn CI amb credencials Firebase disponibles, forçar `GOLDEN_ALLOW_SKIP_FIRESTORE=0` per validar també els casos Firestore.
