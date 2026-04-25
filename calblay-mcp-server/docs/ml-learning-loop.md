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
