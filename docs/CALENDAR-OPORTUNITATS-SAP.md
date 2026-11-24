# Calendar → Oportunitats SAP

**UI:** `/menu/calendar` · interruptor **Oportunitats SAP ON/OFF** + botó **Revisar oportunitats**  
**Permís:** `sync:oportunitats-sap` (matriu Calendar · Accions)

## Flux

1. Producció activa l’interruptor (proves OFF per defecte).
2. Clic **Crear oportunitats (avui)** → encoa `sales-opp-from-mail` amb
   `params: { todayOnly: true, confirm: true }`.
3. El PC worker mira només mails d’**avui** a `oriol@` i **crea** a SAP si n’hi ha.

## Env calblapp (Vercel / `.env.local`)

```
COMPRES_APP_URL=https://…   # o URL local del Gestor Compres
COMPRES_AGENT_KEY=…         # mateix secret que COMPRES_AGENT_KEY del worker
```

## Estat

Firestore: `calendar_controls/oportunitats_sap` (`enabled`, últim run…).
