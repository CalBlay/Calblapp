/**
 * Proves de matching manual ↔ Zoho (sense Firestore).
 * Executar: npx ts-node --transpile-only scripts/test-manual-reserve-zoho-match.ts
 */
import {
  applyManualCreatedAtPreserve,
  docCreatedAtIso,
  manualReserveMatchesZohoDeal,
  normalizeClientNameKey,
  normalizeCommercialKey,
  normalizeUbicacioKey,
  resolveManualReserveReplacements,
  stripInvalidManualMerge,
  type ManualReserveDoc,
  type ZohoDealMatchInput,
} from '../src/services/spaces/manualReserveZohoMatch'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const manual: ManualReserveDoc = {
  id: 'spaces_manual_1000',
  Comercial: ' Anna Puig ',
  NomClient: 'Client Test',
  Ubicacio: 'Can Cal Blay (CEU0001)',
  DataInici: '2026-06-15',
  createdAt: '2026-05-01T10:00:00.000Z',
  origen: 'spaces_manual',
}

const deal: ZohoDealMatchInput = {
  idZoho: 'z1',
  Comercial: 'anna puig',
  NomEvent: 'Client Test',
  Ubicacio: 'Can Cal Blay',
  DataInici: '2026-06-15',
}

assert(normalizeCommercialKey('Anna Puig') === 'anna puig', 'commercial normalize')
assert(
  normalizeUbicacioKey('Can Cal Blay (CEU0001)') === 'can cal blay',
  'ubicacio normalize'
)
assert(
  normalizeClientNameKey('AFFINITY PETCARE, S.A.') === 'affinity petcare',
  'client suffix normalize'
)
assert(manualReserveMatchesZohoDeal(manual, deal), '4-criteria match')

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

assert(
  !manualReserveMatchesZohoDeal(manual, {
    ...deal,
    NomEvent: 'Other Client',
  }),
  'different client'
)

const result = resolveManualReserveReplacements(
  [manual, { ...manual, id: 'spaces_manual_2000', createdAt: '2026-05-02T00:00:00.000Z' }],
  [deal, { ...deal, idZoho: 'z2', NomEvent: 'Other Client' }]
)
assert(result.replacedCount === 1, 'one manual per deal with matching client')
assert(result.byZohoId.get('z1')?.mergedFromManualId === 'spaces_manual_1000', 'oldest manual')
assert(
  result.byZohoId.get('z1')?.createdAt === '2026-05-01T10:00:00.000Z',
  'preserves manual createdAt ISO with time'
)

const sharedDay = '2026-06-01'
const sharedUbic = 'Affinity - Masquefa'
const sharedComercial = 'Anna Puig'
const affinityManual: ManualReserveDoc = {
  id: 'spaces_manual_1780055302796',
  Comercial: sharedComercial,
  NomClient: 'AFFINITY PETCARE',
  Ubicacio: sharedUbic,
  DataInici: sharedDay,
  origen: 'spaces_manual',
}
const marbetManual: ManualReserveDoc = {
  id: 'spaces_manual_1780055400000',
  Comercial: sharedComercial,
  NomClient: 'MARBET VIAJES',
  Ubicacio: sharedUbic,
  DataInici: sharedDay,
  createdAt: '2026-05-29T11:48:22.796Z',
  origen: 'spaces_manual',
}
const affinityDeal: ZohoDealMatchInput = {
  idZoho: '739896000036849019',
  Comercial: sharedComercial,
  NomEvent: 'AFFINITY PETCARE, S.A.',
  Ubicacio: sharedUbic,
  DataInici: sharedDay,
}
const marbetDeal: ZohoDealMatchInput = {
  idZoho: '739896000036849014',
  Comercial: sharedComercial,
  NomEvent: 'MARBET VIAJES',
  Ubicacio: sharedUbic,
  DataInici: sharedDay,
}

const twoClientResult = resolveManualReserveReplacements(
  [marbetManual, affinityManual],
  [marbetDeal, affinityDeal]
)
assert(twoClientResult.replacedCount === 2, 'both manuals match their client')
assert(
  twoClientResult.byZohoId.get('739896000036849019')?.mergedFromManualId ===
    'spaces_manual_1780055302796',
  'affinity deal gets affinity manual (oldest, created first)'
)
assert(
  twoClientResult.byZohoId.get('739896000036849014')?.mergedFromManualId ===
    'spaces_manual_1780055400000',
  'marbet deal gets marbet manual only'
)

const staleMerge = stripInvalidManualMerge(
  {
    mergedFromManualId: 'spaces_manual_1780055302796',
    createdAt: '2026-05-29T11:48:22.796Z',
  },
  marbetDeal,
  [affinityManual]
)
assert(!staleMerge?.mergedFromManualId, 'clears wrong merge when affinity manual still exists')

const storedClientMismatch = stripInvalidManualMerge(
  {
    mergedFromManualId: 'spaces_manual_1780055302796',
    mergedFromManualNomClient: 'AFFINITY PETCARE',
    createdAt: '2026-05-29T11:48:22.796Z',
  },
  marbetDeal,
  []
)
assert(
  !storedClientMismatch?.mergedFromManualId,
  'clears merge when stored client differs from deal NomEvent'
)

const freshMerge = applyManualCreatedAtPreserve(
  { NomEvent: 'Zoho deal', DataPeticio: '2026-05-20' },
  'z1',
  result.byZohoId,
  undefined
)
assert(
  freshMerge.createdAt === '2026-05-01T10:00:00.000Z',
  'applyManualCreatedAtPreserve on first merge'
)
assert(
  freshMerge.mergedFromManualId === 'spaces_manual_1000',
  'applyManualCreatedAtPreserve sets mergedFromManualId'
)

const mergedId = 'spaces_manual_1714550400000'
const subsequentSync = applyManualCreatedAtPreserve(
  { NomEvent: 'Zoho deal', DataPeticio: '2026-05-20' },
  'z1',
  new Map(),
  {
    mergedFromManualId: mergedId,
    createdAt: '2026-04-01T08:00:00.000Z',
  }
)
assert(
  docCreatedAtIso(subsequentSync.createdAt) ===
    new Date(1714550400000).toISOString(),
  'subsequent sync repairs createdAt from mergedFromManualId'
)

const timestampLike = {
  toDate: () => new Date('2026-04-01T08:00:00.000Z'),
}
const wrongExistingCreatedAt = applyManualCreatedAtPreserve(
  { DataPeticio: '2026-05-20' },
  'z1',
  new Map(),
  { mergedFromManualId: mergedId, createdAt: timestampLike }
)
assert(
  docCreatedAtIso(wrongExistingCreatedAt.createdAt) ===
    new Date(1714550400000).toISOString(),
  'merged doc prefers manual id over existing createdAt'
)
assert(
  !wrongExistingCreatedAt.createdAt?.toString().includes('Timestamp'),
  'createdAt is ISO not Timestamp.toString()'
)

const legacyFallback = applyManualCreatedAtPreserve(
  { DataPeticio: '2026-05-20' },
  'z9',
  new Map(),
  { mergedFromManualId: 'spaces_manual_1000' }
)
assert(
  docCreatedAtIso(legacyFallback.createdAt) === '1970-01-01T00:00:01.000Z',
  'legacy manual id fallback for createdAt'
)

console.log('✅ manualReserveZohoMatch tests OK')
