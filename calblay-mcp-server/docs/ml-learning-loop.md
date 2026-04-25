# ML Learning Loop (Q/A + Feedback)

Objectiu: guardar exemples reals de preguntes/respostes perquè el sistema millori amb ús real.

## Què es desa

- `chat-traces.jsonl`
  - `traceId`
  - pregunta (`question`)
  - resposta final (`answer`, `report`)
  - eines usades (`toolOutcomes`)
  - origen del selector de tool (`toolChoiceSource`: `legacy_forced | planner | auto | deterministic_executor`)
  - flags de forçat (`forcedFlags`)
  - metadades (`intent`, `durationMs`, `model`, `cached`)

- `chat-feedback.jsonl`
  - `traceId`
  - `helpful` (true/false)
  - `correctedAnswer`
  - `note`
  - `tags`

## Endpoints

- `POST /chat`
  - retorna `traceId` per cada resposta.

- `POST /chat/feedback`
  - body:
    - `traceId` (required)
    - `helpful` (boolean)
    - `correctedAnswer` (optional)
    - `note` (optional)
    - `tags` (optional string[])

- `GET /chat/learning/status`
  - estat del loop i comptadors de traces/feedback.

- `GET /chat/learning/tool-choice-stats?limit=200`
  - resum dels últims `N` traces amb distribució de `toolChoiceSource`:
    - `legacy_forced`
    - `planner`
    - `auto`
    - `other`

## Configuració

- `ML_LEARNING_ENABLED` (default `1`)
- `ML_LEARNING_DIR` (default `data/ml-learning`)
- `QUERY_PLANNER_DETERMINISTIC_EXECUTOR` (default `0`, activa execució directa per `catalog_hit`)
- `QUERY_PLANNER_STRICT_CATALOG_EXECUTOR` (default `1`, bloqueja fallback auto-tools per mètriques de catàleg quan l’executor no és fiable)

## Ús recomanat

1. Consumir `traceId` a UI després de cada resposta.
2. Quan l'usuari validi/corregeixi, enviar `POST /chat/feedback`.
3. Fer ETL periòdic de JSONL cap a un dataset versionat per entrenament.

## ETL a dataset d'entrenament

CLI:

- `npm run learning:etl`
  - Llegeix:
    - `data/ml-learning/chat-traces.jsonl`
    - `data/ml-learning/chat-feedback.jsonl`
  - Escriu:
    - `data/ml-learning/datasets/training-dataset.jsonl`
    - `data/ml-learning/datasets/training-dataset-summary.json`

Camp clau del dataset:

- `trainingTarget`: usa `correctedAnswer` si hi ha feedback; si no, usa `answer`.
- `hasFeedback`, `helpful`, `note`, `tags` per classificar qualitat del sample.
- `queryPlan`, `intent`, `toolChoiceSource` per avaluació offline de routing.

## Avaluació offline (intent/slots)

CLI:

- `npm run learning:eval`
  - Llegeix `training-dataset.jsonl`
  - Recalcula `queryPlan` per cada pregunta amb el planner actual
  - Compara contra el `queryPlan` guardat al dataset (ground truth operacional)
  - Escriu:
    - `data/ml-learning/datasets/training-eval-summary.json`
  - Filtres opcionals:
    - `LEARNING_EVAL_FROM` (ISO datetime; ex. `2026-04-25T21:40:00Z`)
    - `LEARNING_EVAL_LIMIT` (últims N rows a avaluar)

Mètriques principals:

- `metrics.metricId.exactMatchPercent`
- `metrics.slots.perfectRowPercent`
- `metrics.slots.fieldMatchPercent`

## Suggested catalog updates (manual review)

CLI:

- `npm run learning:suggested-catalog-updates`
  - Llegeix `training-dataset.jsonl`
  - Detecta patrons de millora:
    - `metricId=unknown` / `catalog_miss`
    - `status=ambiguous` per mètrica coneguda
    - `deterministic_executor_blocked`
  - Escriu:
    - `data/ml-learning/datasets/suggested-catalog-updates.json`

Important:

- El report és només de suggeriments (`autoMerge=false`).
- No modifica `metric_catalog.json` ni fa canvis automàtics.
