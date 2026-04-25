# Resum en llenguatge pla: què hem guanyat amb els 5 sprints

Aquest document explica, en paraules simples, què s'ha fet i quin impacte real té per al negoci.

## Punt de partida (abans dels sprints)

Abans teníem un problema recurrent:

- el xat responia algunes preguntes bé, però d'altres donaven valors erronis o inconsistents,
- massa dependència de la "interpretació" del model,
- poca traçabilitat per entendre per què havia triat una eina o un càlcul,
- risc de regressions (arreglar una cosa i espatllar-ne una altra sense veure-ho fins tard).

En resum: funcionava "a vegades", però no era prou fiable per consultes de negoci crítiques.

---

## Sprint 1 - Catàleg semàntic de mètriques

### Què hem fet

- Hem creat un catàleg de mètriques (`metric_catalog.json`) amb definicions clares:
  - d'on surt la dada (Firestore, CSV finances),
  - quina eina l'executa,
  - com s'ha de calcular.

### Què hem guanyat

- Ara hi ha una "font de veritat" explícita.
- Menys improvisació a l'hora de respondre.
- Base sòlida per escalar nous casos sense parxes ad-hoc.

---

## Sprint 2 - Query Planner (planificador)

### Què hem fet

- Hem afegit un planificador que transforma pregunta -> pla estructurat:
  - `catalog_hit`, `catalog_miss`, `ambiguous`.
- Extracció de slots (data, període, departament, matrícula, etc.).
- Observabilitat de com s'ha triat la ruta (`toolChoiceSource`).

### Què hem guanyat

- Decisió més determinista sobre quina mètrica i eina s'ha d'executar.
- Més transparència: podem auditar el "per què" de cada resposta.
- Menys caiguda a `auto` cec en casos importants.

---

## Sprint 3 - Execució determinista

### Què hem fet

- Hem implementat l'executor determinista per mètriques de catàleg.
- Contracte de sortida estàndard (`calc_details`, `slotsUsed`, `metricId`, `executor`).
- Política "fail-closed" en casos crítics (millor bloquejar que inventar).
- Lock de font per finances (ex. subministraments -> `c.explotacio`, `costos`).

### Què hem guanyat

- Els números ja no depenen d'un text generat pel model.
- Respostes més fiables i auditables.
- Menys risc de barrejar fonts incorrectes.

---

## Sprint 4 - Golden tests + gates de qualitat

### Què hem fet

- Suite golden de negoci amb 30 casos.
- `quality:golden`, `quality:drift`, `quality:ci`.
- `quality:report` robust (no peta local si falten creds Firebase).
- Workflow CI configurat:
  - PR baseline
  - main estricte amb Firebase.

### Què hem guanyat

- Ara hi ha un "control de qualitat real" abans de desplegar.
- Es bloquegen regressions de negoci abans d'arribar a producció.
- Tenim una lectura contínua de salut (DoD, drift, adopció).

---

## Sprint 5 - Learning controlat (sense auto-merge)

### Què hem fet

- ETL de traces + feedback a dataset (`learning:etl`).
- Avaluació offline del planner (`learning:eval`).
- Report de suggeriments de catàleg (`learning:suggested-catalog-updates`) amb revisió manual obligatòria.
- Millores funcionals basades en evidència:
  - incidències,
  - cost de personal (prioritzant `TOTAL COST SALARIAL`),
  - tolerància a typos i variants.

### Què hem guanyat

- El sistema "aprèn" de l'ús real, però amb governança.
- No hi ha canvis automàtics perillosos al catàleg.
- Millora contínua amb dades i mètriques, no per intuïció.

---

## Resultat global dels 5 sprints

En termes simples, hem passat de:

- **"xat que sovint encerta però no sempre és fiable"**

a:

- **"plataforma governada, testejada i auditable, preparada per créixer amb seguretat"**.

### Beneficis directes per tu

- més confiança en els números,
- menys temps corregint respostes una a una,
- menys sorpreses en producció,
- més facilitat per incorporar noves consultes/mètriques de negoci.

---

## Què canvia en el dia a dia

- Quan una resposta falla, ara sabem on falla (planner, slots, executor, font, test).
- Quan arreglem una regla, podem comprovar immediatament que no hem trencat la resta.
- Les decisions de millora es prenen amb evidència (`quality:report`, `learning:eval`, `suggested updates`).

---

## Missatge final

Els 5 sprints han convertit un assistent amb comportament irregular en una base sòlida per fer consultes de negoci de manera fiable, controlada i escalable.
