/**
 * Proves de matching manual ↔ Zoho (sense Firestore).
 * Executar: npx ts-node --transpile-only scripts/test-manual-reserve-zoho-match.ts
 */
import {
  applyManualCreatedAtPreserve,
  docCreatedAtIso,
  manualReserveCreatedAtIso,
  manualReserveMatchesZohoDeal,
  normalizeClientNameKey,
  normalizeCommercialKey,
  normalizeEventDay,
  normalizeUbicacioKey,
  resolveManualReserveReplacements,
  stripInvalidManualMerge,
  type ManualReserveDoc,
  type ZohoDealMatchInput,
} from '../src/services/spaces/manualReserveZohoMatch'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
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
assertEqual(normalizeCommercialKey('Ànna Puig'), 'anna puig', 'commercial unaccent')
assertEqual(
  normalizeEventDay('2026-06-15T20:30:00+02:00'),
  '2026-06-15',
  'event datetime normalize'
)
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
  manualReserveMatchesZohoDeal(
    {
      ...manual,
      Comercial: 'Ànna Puig',
      NomClient: 'Client Test, S.L.',
      DataInici: '2026-06-15T19:00:00+02:00',
    },
    {
      ...deal,
      NomEvent: 'Client Test SL',
      DataInici: '2026-06-15 09:30:00',
    }
  ),
  'normalizes accents, legal suffixes and datetime days'
)

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
assert(
  !manualReserveMatchesZohoDeal(
    { ...manual, Comercial: '—' },
    deal
  ),
  'placeholder commercial does not match'
)
assert(
  !manualReserveMatchesZohoDeal(manual, {
    ...deal,
    Ubicacio: 'Other Finca',
  }),
  'different ubicacio'
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

const oneToOneResult = resolveManualReserveReplacements(
  [manual],
  [
    { ...deal, idZoho: 'z2' },
    { ...deal, idZoho: 'z1' },
  ]
)
assertEqual(oneToOneResult.replacedCount, 1, 'manual consumed only once')
assert(oneToOneResult.byZohoId.has('z1'), 'lowest Zoho id gets single matching manual')
assert(!oneToOneResult.byZohoId.has('z2'), 'second matching deal is not assigned used manual')

const eligibilityResult = resolveManualReserveReplacements(
  [
    {
      ...manual,
      id: 'spaces_manual_0500',
      createdAt: '2026-04-01T00:00:00.000Z',
      replacedByZoho: true,
    },
    {
      ...manual,
      id: 'external_manual_0600',
      createdAt: '2026-04-02T00:00:00.000Z',
      origen: 'zoho',
    },
    {
      ...manual,
      id: 'spaces_manual_0700',
      createdAt: '2026-04-03T00:00:00.000Z',
    },
  ],
  [deal]
)
assertEqual(eligibilityResult.replacedCount, 1, 'only eligible manuals are considered')
assertEqual(
  eligibilityResult.byZohoId.get('z1')?.mergedFromManualId,
  'spaces_manual_0700',
  'skips already replaced and non-manual origins'
)

const tiedManualResult = resolveManualReserveReplacements(
  [
    { ...manual, id: 'spaces_manual_b', createdAt: '2026-05-01T10:00:00.000Z' },
    { ...manual, id: 'spaces_manual_a', createdAt: '2026-05-01T10:00:00.000Z' },
  ],
  [deal]
)
assertEqual(
  tiedManualResult.byZohoId.get('z1')?.mergedFromManualId,
  'spaces_manual_a',
  'manual tie-breaker is deterministic by id'
)

assertEqual(
  manualReserveCreatedAtIso({ id: 'spaces_manual_1714550400000' }),
  '2024-05-01T08:00:00.000Z',
  'legacy manual id provides createdAt fallback'
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
    keep: 'value',
  },
  marbetDeal,
  [affinityManual]
)
assert(!staleMerge?.mergedFromManualId, 'clears wrong merge when affinity manual still exists')
assertEqual(staleMerge?.keep, 'value', 'stale merge cleanup preserves unrelated fields')

const validMerge = stripInvalidManualMerge(
  {
    mergedFromManualId: 'spaces_manual_1780055302796',
    mergedFromManualNomClient: 'AFFINITY PETCARE',
    createdAt: '2026-05-29T11:48:22.796Z',
    keep: 'value',
  },
  affinityDeal,
  [affinityManual]
)
assertEqual(
  validMerge?.mergedFromManualId,
  'spaces_manual_1780055302796',
  'valid merge metadata remains'
)
assertEqual(validMerge?.keep, 'value', 'valid merge preserves unrelated fields')

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
assertEqual(
  freshMerge.manualReserveCreatedAt,
  '2026-05-01T10:00:00.000Z',
  'first merge also stores manualReserveCreatedAt'
)
assertEqual(
  freshMerge.mergedFromManualNomClient,
  'Client Test',
  'first merge stores manual client name for stale-merge detection'
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

const existingUnmerged = applyManualCreatedAtPreserve(
  { DataPeticio: '2026-05-20' },
  'z-no-replacement',
  new Map(),
  {
    createdAt: '2026-01-01T00:00:00.000Z',
    manualReserveCreatedAt: '2026-01-02T00:00:00.000Z',
  }
)
assertEqual(
  existingUnmerged.createdAt,
  '2026-01-01T00:00:00.000Z',
  'unmerged existing doc keeps createdAt'
)
assertEqual(
  existingUnmerged.manualReserveCreatedAt,
  '2026-01-02T00:00:00.000Z',
  'unmerged existing doc keeps manualReserveCreatedAt metadata'
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
