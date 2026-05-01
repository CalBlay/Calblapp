/**
 * Estructura de navegació del mòdul Documentació (3 nivells).
 * Les dades de fitxers es podran connectar més endavant a API / emmagatzematge.
 *
 * Visibilitat de fitxers: veure `documentacioFileVisibleToViewer`.
 */

import { normalizeDept } from '@/lib/accessControl'
import { normalizeForSearch } from '@/lib/documentacio-access'
import { normalizeRole } from '@/lib/roles'

export type DocumentacioAmbit = 'formacions' | 'normatives' | 'protocols'

export type DocumentacioGroupId = 'lideratge-serveis' | 'conducta' | 'arees-operatives'

export interface DocumentacioFileRef {
  id: string
  label: string
  href?: string
  kind?: 'pdf' | 'link' | 'video'
  updatedAtLabel?: string
  /**
   * Departaments que poden veure el fitxer (un o més). Valors coherents amb `normalizeDept`.
   * Si és absent o buit → visible per a qualsevol usuari amb accés al mòdul (contingut general).
   */
  departments?: string[]
}

export interface DocumentacioTopic {
  slug: string
  title: string
  files: DocumentacioFileRef[]
}

export interface DocumentacioGroup {
  id: DocumentacioGroupId
  title: string
  topics: DocumentacioTopic[]
}

export const DOCUMENTACIO_AMBITS: Array<{ id: DocumentacioAmbit; title: string }> = [
  { id: 'formacions', title: 'Formacions' },
  { id: 'normatives', title: 'Normatives' },
  { id: 'protocols', title: 'Protocols' },
]

type GroupDef = Omit<DocumentacioGroup, 'topics'> & {
  topicSlugs: Array<{ slug: string; title: string }>
}

const GROUP_DEFS: Record<DocumentacioGroupId, GroupDef> = {
  'lideratge-serveis': {
    id: 'lideratge-serveis',
    title: 'Lideratge i serveis',
    topicSlugs: [
      { slug: 'lideratge', title: 'Lideratge' },
      { slug: 'serveis', title: 'Serveis' },
    ],
  },
  conducta: {
    id: 'conducta',
    title: 'Conducta',
    topicSlugs: [{ slug: 'conducta', title: 'Conducta' }],
  },
  'arees-operatives': {
    id: 'arees-operatives',
    title: 'Restauració, producció i cuina central',
    topicSlugs: [
      { slug: 'restauracio', title: 'Restauració' },
      { slug: 'produccio', title: 'Producció' },
      { slug: 'cuina-central', title: 'Cuina central' },
    ],
  },
}

/** Mapatge intern nivell 1 → grup de temes (sense mostrar codis a la UI). */
const AMBIT_GROUP_IDS: Record<DocumentacioAmbit, DocumentacioGroupId> = {
  formacions: 'lideratge-serveis',
  normatives: 'conducta',
  protocols: 'arees-operatives',
}

/** Admin veu tots els fitxers; la resta només si `departments` és buit o inclou el seu departament. */
export function documentacioFileVisibleToViewer(params: {
  file: DocumentacioFileRef
  viewerRole?: string | null
  viewerDepartment?: string | null
}): boolean {
  if (normalizeRole(params.viewerRole) === 'admin') return true

  const allowed = params.file.departments
  if (!allowed || allowed.length === 0) return true

  const viewerDept = normalizeDept(params.viewerDepartment)
  return allowed.some((d) => normalizeDept(d) === viewerDept)
}

function buildGroupFromDef(def: GroupDef): DocumentacioGroup {
  return {
    id: def.id,
    title: def.title,
    topics: def.topicSlugs.map(({ slug, title }) => ({
      slug,
      title,
      files: [],
    })),
  }
}

/** Els tres àmbits definits al codi (amb grups i temes estàtics). */
export function isStaticDocumentacioAmbit(value: string): value is DocumentacioAmbit {
  return value === 'formacions' || value === 'normatives' || value === 'protocols'
}

/** Genera un slug d’URL per a un tema nou (minúscules, guions, sense accents). */
export function slugifyDocumentacioTopicTitle(raw: string): string {
  const base = normalizeForSearch(raw)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (base || 'tema').slice(0, 80)
}

const TOPIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidDocumentacioTopicSlug(slug: string): boolean {
  return Boolean(slug && TOPIC_SLUG_PATTERN.test(slug))
}

/** Àmbit vàlid a la URL (estàtic o dinàmic): mateix format que els slugs de tema. */
export function isValidDocumentacioAmbitSlug(slug: string): boolean {
  return isValidDocumentacioTopicSlug(slug)
}

/** Títol aproximat a partir del slug (quan no hi ha `topicTitle` emmagatzemat). */
export function humanizeDocumentacioTopicSlug(slug: string): string {
  const s = String(slug || '').trim()
  if (!s) return s
  return s
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function getGroupsForAmbit(ambit: string): DocumentacioGroup[] {
  if (!isStaticDocumentacioAmbit(ambit)) return []
  const groupId = AMBIT_GROUP_IDS[ambit]
  return [buildGroupFromDef(GROUP_DEFS[groupId])]
}

/** Títol visible de l’àmbit (estàtic, emmagatzemat a Firestore o derivat del slug). */
export function getAmbitDisplayTitle(ambitSlug: string, storedTitle?: string | null): string {
  if (isStaticDocumentacioAmbit(ambitSlug)) {
    return DOCUMENTACIO_AMBITS.find((a) => a.id === ambitSlug)?.title ?? ambitSlug
  }
  const t = String(storedTitle ?? '').trim()
  if (t) return t
  return humanizeDocumentacioTopicSlug(ambitSlug)
}

/** @deprecated Use getAmbitDisplayTitle(slug) for estàtics. */
export function getAmbitTitle(ambit: DocumentacioAmbit): string {
  return getAmbitDisplayTitle(ambit)
}

export function findTopicInAmbit(
  ambit: string,
  topicSlug: string
): { group: DocumentacioGroup; topic: DocumentacioTopic } | null {
  const groups = getGroupsForAmbit(ambit)
  for (const group of groups) {
    const topic = group.topics.find((t) => t.slug === topicSlug)
    if (topic) return { group, topic }
  }
  return null
}

export type DocumentacioSearchHit = {
  ambit: DocumentacioAmbit
  ambitTitle: string
  topicSlug: string
  topicTitle: string
  groupTitle: string
  href: string
}

export function getDocumentacioSearchIndex(): DocumentacioSearchHit[] {
  const hits: DocumentacioSearchHit[] = []
  for (const ambit of DOCUMENTACIO_AMBITS) {
    const groups = getGroupsForAmbit(ambit.id)
    for (const group of groups) {
      for (const topic of group.topics) {
        hits.push({
          ambit: ambit.id,
          ambitTitle: ambit.title,
          topicSlug: topic.slug,
          topicTitle: topic.title,
          groupTitle: group.title,
          href: `/menu/documentacio/${ambit.id}/${topic.slug}`,
        })
      }
    }
  }
  return hits
}
