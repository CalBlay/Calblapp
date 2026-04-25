# Blueprint Objectiu 2: Informes TOP nivell professional (ML-ready)

## 1) Objectiu d'aquest blueprint

Passar de "respostes correctes" a "informes executius de nivell direcció", amb:

- qualitat visual i narrativa professional,
- consistència de format,
- comparatives i conclusions accionables,
- governança i control de regressions,
- base preparada per millora contínua amb machine learning.

Aquest blueprint segueix la mateixa línia de treball dels últims sprints: passos petits, validació contínua, i gates de qualitat.

---

## 2) Definició de "Informe TOP Professional"

Un informe es considera "TOP professional" si compleix sempre:

1. **Precisió de dades**
   - només usa dades calculades per eines deterministes o fonts explícites.
   - cap xifra inventada.

2. **Estructura executiva estàndard**
   - resum executiu (5-7 bullets),
   - KPIs principals,
   - taules de suport,
   - gràfic clar (bar/line),
   - conclusions i recomanacions.

3. **Qualitat de narrativa**
   - llenguatge clar, formal, orientat negoci.
   - destaca variacions, riscos i oportunitats.

4. **Traçabilitat**
   - font de dades i període explícits.
   - metadades suficients per auditar el resultat.

5. **Reutilització i escalabilitat**
   - mateix contracte de sortida per UI/PDF/export.
   - plantilles versionades.

---

## 3) Abast funcional inicial (MVP d'informes professionals)

### 3.1 Tipus d'informe prioritaris

1. **Informe de costos per departament/període**
   - subministraments,
   - personal,
   - variacions mensuals/trimestrals.

2. **Informe resultat financer per línia de negoci (LN)**
   - comparativa mesos,
   - desviacions rellevants.

3. **Informe operatiu**
   - incidències,
   - preventius,
   - serveis/assignacions.

### 3.2 Fora d'abast inicial

- dashboards interactius complexos multi-pàgina,
- auto-generació de presentacions completes (PPT),
- recomanacions automàtiques sense validació humana.

---

## 4) Arquitectura objectiu (Informes Pro)

### 4.1 Capa de composició d'informes

Nova capa `report-composer`:

- rep resultats d'eines (deterministes preferentment),
- aplica plantilla segons tipus d'informe,
- construeix objecte d'informe únic (contracte estable),
- aplica regles de qualitat narrativa.

### 4.2 Contracte de sortida únic (v1)

Es recomana un contracte tipus:

- `reportType`
- `period`
- `sourceOfTruth`
- `executiveSummary[]`
- `kpis[]`
- `tables[]`
- `chart`
- `insights[]`
- `actions[]`
- `qualityFlags[]`

### 4.3 Policy layer d'informes

Regles hard:

- si no hi ha xifra fiable -> missatge controlat, mai inventar,
- si hi ha warning de dades -> bandera visible a l'informe,
- si el període és ambigu -> demanar aclariment o bloquejar en mode estricte.

---

## 5) Pla d'acció per sprints (Objectiu 2)

## Sprint R1 - Plantilla executiva base

**Goal:** tenir una plantilla professional comuna.

- crear `report-composer.service.js`,
- definir `report_contract_v1`,
- implementar plantilla "executive summary + KPIs + taula + gràfic + accions",
- integrar al flux de resposta en mode informe.

**Exit criteria:**
- 3 informes diferents surten amb el mateix format base,
- cap informe trenca el contracte.

---

## Sprint R2 - Especialització per domini

**Goal:** plantilles específiques per costos, financer LN i operació.

- plantilla `finance_costs_report_v1`,
- plantilla `finance_ln_report_v1`,
- plantilla `operations_report_v1`,
- regles de narrativa per domini (to i focus).

**Exit criteria:**
- cada tipus mostra KPIs i insights adequats al domini,
- validació funcional amb casos reals de negoci.

---

## Sprint R3 - Quality Gates d'informe

**Goal:** bloquejar informes "visualment pobres" o incoherents.

- script `quality:reports`,
- checks automàtics:
  - contracte complet,
  - camps obligatoris,
  - mínim d'insights accionables,
  - presència de font/període,
  - no inconsistències de valors clau.

**Exit criteria:**
- CI bloqueja regressions de format i qualitat narrativa.

---

## Sprint R4 - Export professional

**Goal:** producció d'informes exportables (PDF/HTML estructurat).

- capa d'export amb layout corporatiu,
- capçalera/peu, data, context i disclaimer de dades,
- validació visual en mostra de casos.

**Exit criteria:**
- export estable per mínim 3 tipus d'informe.

---

## Sprint R5 - ML-ready per qualitat d'informes

**Goal:** millora contínua de qualitat de narrativa i priorització d'insights.

- ETL específic d'informes (no només Q/A),
- feedback explícit per informe (utilitat, claredat, accions útils),
- score offline de qualitat d'informe (rubrica),
- report de "suggested template improvements" (manual review, no auto-merge).

**Exit criteria:**
- millora mensual mesurable en score de qualitat d'informe,
- zero regressions en exactitud de xifres.

---

## 6) ML-readiness específica per informes

## 6.1 Què guardarem per entrenament/avaluació

Per cada informe:

- entrada: pregunta + context + pla + dades,
- sortida: informe final estructurat,
- metadades: tipus d'informe, domini, fonts, warnings,
- feedback:
  - útil/no útil,
  - claredat,
  - nivell executiu,
  - si les accions proposades són aplicables.

## 6.2 Rubrica de qualitat (0-5)

1. exactitud (xifres correctes),
2. claredat executiva,
3. rellevància dels insights,
4. accionabilitat,
5. consistència visual/estructural.

## 6.3 Regla de seguretat

Cap millora ML pot desplegar-se si:

- baixa l'exactitud de dades,
- o trenca el contracte d'informe,
- o empitjora el quality gate de manera significativa.

---

## 7) KPI de seguiment de l'Objectiu 2

KPI operatius:

- `% informes que passen quality:reports`,
- `% informes amb contracte complet`,
- temps mitjà de generació.

KPI de negoci:

- `% informes validats sense correccions manuals`,
- satisfacció de l'usuari intern,
- reducció de temps de preparació d'informes.

KPI ML:

- score mitjà de qualitat narrativa,
- taxa de millora mensual en feedback positiu,
- regressions evitades per gates.

---

## 8) Riscos i mitigacions

1. **Informe bonic però xifres incorrectes**
   - Mitigació: deterministic-first + fail-closed + quality gates.

2. **Sobrecàrrega de format, poc valor executiu**
   - Mitigació: plantilla amb prioritat a insights i accions.

3. **ML introdueix regressions de to o estructura**
   - Mitigació: offline eval + suggested updates + manual review.

4. **Històric brut distorsiona mètriques**
   - Mitigació: avaluació per finestra temporal (`LEARNING_EVAL_FROM`, `LEARNING_EVAL_LIMIT`).

---

## 9) Definició de "Done" de l'Objectiu 2 (V1)

L'Objectiu 2 es considera tancat en V1 quan:

- hi ha 3 plantilles professionals en producció (costos, financer LN, operació),
- `quality:reports` actiu i passant en CI,
- export professional estable,
- pipeline ML-ready d'informes operatiu (ETL + eval + suggested improvements),
- i mantenim exactitud de negoci sense regressions crítiques.

---

## 10) Primera execució recomanada (setmana 1)

1. Sprint R1 (contracte + composer base),
2. pilot amb 10 consultes d'informe reals,
3. quality gate inicial de contracte,
4. recollida de feedback intern estructurat.

Aquest ordre permet obtenir valor visible ràpid i, al mateix temps, deixar la base preparada per millora contínua.
