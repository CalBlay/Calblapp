# Verificar que el MCP llegeix col·leccions / mòduls nous

Aquest document comprova el que es va deixar preparat per al futur.

## Què està preparat (al codi)

| Mecanisme | Què fa |
|-----------|--------|
| `listTopLevelCollections()` | Llista **totes** les col·leccions Firestore del projecte (dinàmic). |
| `firestore_collections_catalog` | Mostra domini suggerit + camps + si es pot consultar. |
| `firestore_query_collection` | Llegeix qualsevol col·lecció permesa (scan + filtres). |
| `firestore_mapping_status` | Cobertura del diccionari manual + `rowsNeedingManualReview`. |
| Job `mapping-delta` (nightly) | Detecta col·leccions **noves** vs últim run. |
| `FIRESTORE_QUERY_ALLOWED_COLLECTIONS=*` | Per defecte, col·leccions futures no cal afegir-les a una llista. |

## Verificació ràpida (amb MCP en marxa)

Substitueix `MCP_URL` i `MCP_KEY`.

### 1. Llistar col·leccions reals del projecte

```bash
curl -s -H "x-api-key: MCP_KEY" "MCP_URL/tools/firestore/collections" | jq '.count, .data[:20]'
```

Si una col·lecció nova (p. ex. `channels`) apareix aquí, el MCP **la ve**.

### 2. Estat de governança (documentades vs noves)

```bash
curl -s -H "x-api-key: MCP_KEY" "MCP_URL/tools/firestore/collection-dictionary?includeDynamic=1" | jq '.manualCoverage, .rowsNeedingManualReview[:15]'
```

Col·leccions sense entrada manual surten a `rowsNeedingManualReview` però **poden** consultar-se igualment.

### 3. Catàleg per al xat (amb `queryAllowed`)

```bash
curl -s -H "x-api-key: MCP_KEY" "MCP_URL/tools/firestore/collections?q=channel" | jq '.'
```

Cada col·lecció ha de tenir `queryAllowed: true` (si `*` i no bloquejada).

### 4. Prova de lectura genèrica

```bash
curl -s -H "x-api-key: MCP_KEY" "MCP_URL/tools/firestore/collection-sample?name=channels&limit=3" | jq '.fieldNames, .count'
```

### 5. Delta de col·leccions noves (comparació amb històric)

```bash
curl -s -X POST -H "x-api-key: MCP_KEY" -H "Content-Type: application/json" \
  -d '{"limit":500,"sampleLimit":6}' \
  "MCP_URL/jobs/firestore/mapping-delta/run" | jq '.run.newCollections, .run.rowsNeedingManualReview | length'
```

### 6. Pregunta oberta (prova d’integració)

A Consultes MCP (admin):

> Quines col·leccions Firestore tenim relacionades amb missatgeria? Mostra camps de `channels`.

El xat hauria d’usar `firestore_collections_catalog` i/o `firestore_query_collection`, no inventar noms.

## Tests automàtics (sense Firebase)

```bash
cd calblay-mcp-server
node --test test/firestore-discovery.test.js
```

Verifiquen: wildcard allow, blocklist, heurística de domini, diccionari manual vs futur.

## Límits (no és lectura “màgica”)

- Només col·leccions **top-level** (no subcol·leccions profundes).
- Consulta genèrica: màxim `scanLimit` documents (cost + incomplet si la col·lecció és enorme).
- Domini `unknown` si el nom no coincideix amb heurístiques (`inferDomainFromName`).
- No substitueix una eina dedicada per KPIs crítics.

## Quan un mòdul nou és “oficialment” cobert

1. Col·lecció existeix a Firestore (top-level).
2. Opcional: entrada a `config/firestore_collection_dictionary.json`.
3. Si cal fiabilitat: mètrica + eina al catàleg.
