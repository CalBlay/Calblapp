export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAllergensModuleView } from '@/lib/server/allergensApiAuth'
import { DEFAULT_ALLERGENS, sortAllergensByStandardOrder } from '@/data/allergens'

export async function GET() {
  try {
    const auth = await requireAllergensModuleView()
    if (!auth.ok) return auth.res

    const [categorySnap, familySnap, menuSnap, allergenSnap, platsSnap, conflictSnap] =
      await Promise.all([
        firestoreAdmin.collection('categories').orderBy('label').get(),
        firestoreAdmin.collection('family').orderBy('label').get(),
        firestoreAdmin.collection('menus').orderBy('label').get(),
        firestoreAdmin.collection('allergens').orderBy('label').get(),
        firestoreAdmin.collection('plats').get(),
        firestoreAdmin.collection('allergens_import_conflicts').get(),
      ])

    const dbAllergens = allergenSnap.docs.map((docSnap) => ({
      key: docSnap.id,
      label: String(docSnap.data().label || docSnap.id),
    }))

    return NextResponse.json({
      categories: categorySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        label: String(docSnap.data().label || docSnap.id),
      })),
      families: familySnap.docs.map((docSnap) => ({
        id: docSnap.id,
        label: String(docSnap.data().label || docSnap.id),
      })),
      menus: menuSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        label: String(docSnap.data().label || docSnap.id),
      })),
      allergens: dbAllergens.length
        ? sortAllergensByStandardOrder(dbAllergens)
        : [...DEFAULT_ALLERGENS],
      allergensSource: dbAllergens.length ? 'db' : 'default',
      platsIndex: platsSnap.docs.map((docSnap) => {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          code: String(data.code || docSnap.id),
          nameCa: String(data.name?.ca || ''),
          nameEs: String(data.name?.es || ''),
          nameEn: String(data.name?.en || ''),
        }
      }),
      importConflicts: conflictSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })),
    })
  } catch (error) {
    console.error('[allergens/bbdd/catalog GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
