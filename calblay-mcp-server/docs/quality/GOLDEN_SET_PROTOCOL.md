# Golden Set Protocol (MCP Queries)

Aquest protocol evita regressions i "parches per pregunta".

## Objectiu

Validar qualsevol canvi contra preguntes reals de negoci abans de considerar-lo "fet".

## Regles

1. No es desplega cap canvi si baixa el percentatge d'encert del Golden Set.
2. No es permet resposta final en consultes de dades sense resultat útil de tool.
3. Si hi ha mismatch, es corregeix router/contracte/parser abans d'afegir noves features.

## Golden queries inicials (mínim)

- Cost de marketing el primer trimestre de 2026.
- Cost de marketing al 2026-T1.
- Cost de marketing al gener 2026.
- Resultat financer per línia de negoci del gener de 2026.
- Vendes de coca-cola al Nàutic al 2026-02.
- Compra total al proveïdor P003004 al 2025.

## Criteri d'acceptació sprint base

- >= 90% casos correctes.
- 0 respostes inventades per consultes de dades.
- 0 eines cridades amb arguments invàlids sense missatge operatiu clar.

## Com executar base tècnica

- Unit tests: `npm test`
- Regressió manual de Golden queries des del mòdul de consultes (cache off o pregunta variant)
- Verificació de logs MCP (tool seleccionada, missatges de warning/error)
