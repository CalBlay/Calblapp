# Importacio d'al.lergens

## Scripts disponibles

- `npm run import:allergens:dry`
  - Analitza l'Excel actual sense escriure a Firestore.
  - Genera l'informe `tmp/allergens-import-report.json`.

- `npm run import:allergens:replace`
  - Buida la base actual del modul d'al.lergens.
  - Importa el contingut nou.
  - Genera l'informe `tmp/allergens-import-report.json`.

- `npm run import:allergens`
  - Mode incremental.
  - Si troba un codi existent, pregunta si s'ha d'actualitzar.
  - Si es respon que no, guarda el conflicte a `allergens_import_conflicts`.

## Regles actuals

- Els codis duplicats dins del mateix Excel no s'importen.
- Els duplicats es guarden com a conflictes consultables.
- `Tipus` es desa a `category/categoryLabel`.
- `Grup` es desa a `family/familyLabel`.
- Les columnes de menus marcades amb `x` es desen a `menus`.
- Les traduccions ESP/ENG es detecten a la fila de capçalera o a la subcapçalera immediata.
- Les columnes de menu es calculen dinamicament despres de `VEGA`/`VEGETARIA` (sense dependre que la capçalera sigui la fila 0).
- Els 14 al.lergens base es regeneren a cada importacio completa.

## On revisar conflictes

- A la pantalla de BBDD del modul d'al.lergens.
- A la col.leccio Firestore `allergens_import_conflicts`.
- A l'informe JSON `tmp/allergens-import-report.json` quan s'executa amb `--report-file`.
