import type { firestore as FirestoreNS } from 'firebase-admin'
import { SUPPLIERS_COLLECTION } from '@/lib/companySuppliers/constants'
import { filterSuppliersByDepartment, listAllSuppliers } from '@/lib/companySuppliers/server'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'

export type RobaSupplierRow = {
  id: string
  name: string
  email: string
  phone: string
  specialty: string
  notes: string
  active: boolean
  createdAt: unknown
  updatedAt: unknown
}

const str = (value: unknown) => String(value ?? '').trim()

export function serializeRobaSupplier(
  id: string,
  data: Record<string, unknown>
): RobaSupplierRow {
  return {
    id,
    name: str(data.name),
    email: str(data.email),
    phone: str(data.phone),
    specialty: str(data.specialty),
    notes: str(data.notes),
    active: data.active !== false,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}

/**
 * Separa els antics proveïdors de RRHH del catàleg de Manteniment.
 * Conserva l'id perquè els articles existents continuïn vinculats.
 */
export async function migrateLegacyRobaSuppliers(db: FirestoreNS.Firestore): Promise<void> {
  const legacy = filterSuppliersByDepartment(await listAllSuppliers(db), 'Recursos Humans')
  for (const supplier of legacy) {
    const dedicatedRef = db.collection(DOTACIO_COLLECTIONS.suppliers).doc(supplier.id)
    const dedicatedSnap = await dedicatedRef.get()
    if (!dedicatedSnap.exists) {
      await dedicatedRef.set({
        name: supplier.name,
        email: supplier.email,
        phone: supplier.phone,
        specialty: supplier.specialty,
        notes: supplier.notes,
        active: supplier.active,
        createdAt: supplier.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      })
    }

    const legacyRef = db.collection(SUPPLIERS_COLLECTION).doc(supplier.id)
    const remainingDepartments = supplier.supplierDepartments.filter(
      (department) => department !== 'Recursos Humans'
    )
    if (remainingDepartments.length > 0) {
      await legacyRef.set(
        { supplierDepartments: remainingDepartments, updatedAt: Date.now() },
        { merge: true }
      )
    } else {
      await legacyRef.delete()
    }
  }
}

export async function listRobaSuppliers(db: FirestoreNS.Firestore): Promise<RobaSupplierRow[]> {
  await migrateLegacyRobaSuppliers(db)
  const snap = await db.collection(DOTACIO_COLLECTIONS.suppliers).orderBy('name', 'asc').get()
  return snap.docs.map((doc) =>
    serializeRobaSupplier(doc.id, doc.data() as Record<string, unknown>)
  )
}
