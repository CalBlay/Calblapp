// ✅ file: src/lib/colors.ts

/**
 * 🎨 Colors corporatius Cal Blay
 * Paleta unificada i coherent per a:
 * - Calendari
 * - Mòdul Espais
 * - Cards i punts d’estat
 *
 * Criteri únic de STAGE:
 * - confirmat   → 🟢 verd
 * - calentet    → 🟠 taronja
 * - pressupost  → 🟡 groc
 */

// ───────────────────────────────────────────────
// 🎯 STAGE_COLORS
// (targetes, espais, compatibilitat legacy)
// ───────────────────────────────────────────────
export const STAGE_COLORS: Record<string, string> = {
  // 🟢 Confirmat
  verd: 'bg-emerald-50 text-emerald-800 border border-emerald-200',

  // 🟠 Calentet / Prereserva
  taronja: 'bg-orange-50 text-orange-800 border border-orange-200',

  // 🟡 Pressupost enviat
  groc: 'bg-yellow-50 text-yellow-800 border border-yellow-200',

  // 🟣 Residual / proves
  lila: 'bg-violet-50 text-violet-800 border border-violet-200',
}

// ───────────────────────────────────────────────
// 🏷️ COLORS PER LÍNIA DE NEGOCI (LN)
// ───────────────────────────────────────────────
export const COLORS_LN: Record<string, string> = {
  empresa: 'bg-blue-50 border border-blue-200 text-blue-800',
  casaments: 'bg-pink-50 border border-pink-200 text-pink-800',
  'grups restaurants': 'bg-amber-50 border border-amber-200 text-amber-800',
  foodlovers: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
  agenda: 'bg-orange-50 border border-orange-200 text-orange-800',
  altres: 'bg-gray-50 border border-gray-200 text-gray-700',

  // Variants
  'prova de menu': 'bg-violet-50 border border-violet-200 text-violet-800',
  pm: 'bg-violet-50 border border-violet-200 text-violet-800',
}

// ───────────────────────────────────────────────
// 🏷️ COLORS PER DEPARTAMENT
// ───────────────────────────────────────────────
export const COLORS_DEPARTMENT: Record<string, string> = {
  empresa: 'bg-sky-50 border border-sky-200 text-sky-800',
  compres: 'bg-orange-50 border border-orange-200 text-orange-800',
  comptabilitat: 'bg-violet-50 border border-violet-200 text-violet-800',
  administracio: 'bg-slate-50 border border-slate-200 text-slate-700',
  'administració': 'bg-slate-50 border border-slate-200 text-slate-700',
  direccio: 'bg-stone-50 border border-stone-200 text-stone-700',
  'direcció': 'bg-stone-50 border border-stone-200 text-stone-700',
  restauracio: 'bg-amber-50 border border-amber-200 text-amber-800',
  marqueting: 'bg-pink-50 border border-pink-200 text-pink-800',
  manteniment: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
  decoracio: 'bg-rose-50 border border-rose-200 text-rose-800',
  'decoració': 'bg-rose-50 border border-rose-200 text-rose-800',
  'recursos humans': 'bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-800',
  serveis: 'bg-cyan-50 border border-cyan-200 text-cyan-800',
  logistica: 'bg-blue-50 border border-blue-200 text-blue-800',
  cuina: 'bg-red-50 border border-red-200 text-red-800',
  'cuina central': 'bg-red-100 border border-red-300 text-red-900',
  'cuina del felix': 'bg-red-50 border border-red-200 text-red-800',
  'food lover': 'bg-lime-50 border border-lime-200 text-lime-800',
  fdlc: 'bg-green-50 border border-green-200 text-green-800',
  qualitat: 'bg-teal-50 border border-teal-200 text-teal-800',
  produccio: 'bg-indigo-50 border border-indigo-200 text-indigo-800',
  'producción': 'bg-indigo-50 border border-indigo-200 text-indigo-800',
  casaments: 'bg-pink-50 border border-pink-200 text-pink-800',
  transports: 'bg-yellow-50 border border-yellow-200 text-yellow-800',
  altres: 'bg-gray-50 border border-gray-200 text-gray-700',
}

// ───────────────────────────────────────────────
// 🟢🟠🟡 COLORS_STAGE
// (punts del calendari, indicadors simples)
// ───────────────────────────────────────────────
export const COLORS_STAGE: Record<string, string> = {
  // Confirmat
  confirmat: 'bg-emerald-200',
  guanyat: 'bg-emerald-200',

  // Calentet / prereserva
  calentet: 'bg-orange-200',
  prereserva: 'bg-orange-200',

  // Pressupost
  pressupost: 'bg-yellow-200',
  proposta: 'bg-yellow-200',
  pendent: 'bg-yellow-200',
}

export const MAINTENANCE_STATUS_BADGES: Record<string, string> = {
  nou: 'bg-teal-100 text-teal-800',
  assignat: 'bg-sky-100 text-sky-800',
  en_curs: 'bg-amber-100 text-amber-800',
  espera: 'bg-slate-100 text-slate-700',
  fet: 'bg-emerald-100 text-emerald-800',
  no_fet: 'bg-rose-100 text-rose-700',
  resolut: 'bg-violet-100 text-violet-800',
  validat: 'bg-violet-100 text-violet-800',
}

// ───────────────────────────────────────────────
// 🔧 HELPERS
// ───────────────────────────────────────────────
export const colorByLN = (lnRaw?: string): string => {
  const ln = (lnRaw || '').trim().toLowerCase()
  return COLORS_LN[ln] || COLORS_LN['altres']
}

export const colorByDepartment = (departmentRaw?: string): string => {
  const department = (departmentRaw || '').trim().toLowerCase()
  return COLORS_DEPARTMENT[department] || COLORS_DEPARTMENT['altres']
}

export const colorByStage = (stage?: string): string => {
  const s = (stage || '').trim().toLowerCase()

  // 🔒 Valors interns normalitzats
  if (s === 'verd') return COLORS_STAGE.confirmat
  if (s === 'taronja') return COLORS_STAGE.calentet
  if (s === 'groc') return COLORS_STAGE.pressupost

  // 🔹 Textos reals (Zoho / Firestore)
  if (s.includes('confirmat') || s.includes('guanyat'))
    return COLORS_STAGE.confirmat

  if (s.includes('calentet') || s.includes('prereserva'))
    return COLORS_STAGE.calentet

  if (
    s.includes('pressupost') ||
    s.includes('proposta') ||
    s.includes('pendent')
  )
    return COLORS_STAGE.pressupost

  // Fallback neutre (no hauria de passar)
  return 'bg-gray-300'
}

export const maintenanceStatusBadge = (status?: string): string => {
  const key = (status || '').trim().toLowerCase()
  return MAINTENANCE_STATUS_BADGES[key] || 'bg-slate-100 text-slate-700'
}
