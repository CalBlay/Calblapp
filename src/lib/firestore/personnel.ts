// file: src/lib/firestore/personnel.ts
import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const serviceAccount: ServiceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}

// Inicialització de Firebase Admin (només si no hi ha apps creades)
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  })
}

const db = getFirestore()

export interface Personnel {
  id: string
  name: string
  role: 'responsible' | 'driver' | 'soldier'
  driver?: {
    camioGran: boolean
    camioPetit: boolean
    isDriver?: boolean
  }
  available: boolean
  department?: string
}

interface PersonnelDoc {
  name?: string
  role?: string
  available?: boolean
  department?: string
  driver?: {
    isDriver?: boolean
    camioGran?: boolean
    camioPetit?: boolean
  }
}

/**
 * Llegeix directament de Firestore la col·lecció 'personnel'
 * només els documents del departament i disponibles.
 */
export async function getPersonnelByDepartment(
  department: string
): Promise<Personnel[]> {
  const snap = await db
    .collection('personnel')
    .where('department', '==', department)
    .where('available', '==', true)
    .get()

  return snap.docs.map(doc => {
    const data = doc.data() as PersonnelDoc

    const role: Personnel['role'] =
      data.role?.toLowerCase().startsWith('resp')
        ? 'responsible'
        : data.driver?.isDriver
        ? 'driver'
        : 'soldier'

    return {
      id: doc.id,
      name: data.name || doc.id,
      role,
      driver: {
        isDriver: Boolean(data.driver?.isDriver),
        camioGran: Boolean(data.driver?.camioGran),
        camioPetit: Boolean(data.driver?.camioPetit),
      },
      available: !!data.available,
      department: data.department,
    }
  })
}
