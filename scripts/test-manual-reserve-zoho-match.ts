/**
 * Proves de matching manual ↔ Zoho (sense Firestore).
 * Executar: npx ts-node --transpile-only scripts/test-manual-reserve-zoho-match.ts
 */
import {
  manualReserveMatchesZohoDeal,
  normalizeCommercialKey,
  normalizeUbicacioKey,
  resolveManualReserveReplacements,
  type ManualReserveDoc,
  type ZohoDealMatchInput,
} from '../src/services/spaces/manualReserveZohoMatch'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const manual: ManualReserveDoc = {
  id: 'spaces_manual_1000',
  Comercial: ' Anna Puig ',
  Ubicacio: 'Can Cal Blay (CEU0001)',
  DataInici: '2026-06-15',
  createdAt: '2026-05-01T10:00:00.000Z',
  origen: 'spaces_manual',
}

const deal: ZohoDealMatchInput = {
  idZoho: 'z1',
  Comercial: 'anna puig',
  Ubicacio: 'Can Cal Blay',
  DataInici: '2026-06-15',
}

assert(normalizeCommercialKey('Anna Puig') === 'anna puig', 'commercial normalize')
assert(
  normalizeUbicacioKey('Can Cal Blay (CEU0001)') === 'can cal blay',
  'ubicacio normalize'
)
assert(manualReserveMatchesZohoDeal(manual, deal), '3-criteria match')

assert(
  !manualReserveMatchesZohoDeal(manual, {
    ...deal,
    DataInici: '2026-06-16',
  }),
  'different day'
)

assert(
  !manualReserveMatchesZohoDeal(manual, {
    ...deal,
    Comercial: 'Other Person',
  }),
  'different commercial'
)

const result = resolveManualReserveReplacements(
  [manual, { ...manual, id: 'spaces_manual_2000', createdAt: '2026-05-02T00:00:00.000Z' }],
  [deal, { ...deal, idZoho: 'z2' }]
)
assert(result.replacedCount === 1, 'one manual per two deals')
assert(result.byZohoId.get('z1')?.mergedFromManualId === 'spaces_manual_1000', 'oldest manual')

console.log('✅ manualReserveZohoMatch tests OK')
