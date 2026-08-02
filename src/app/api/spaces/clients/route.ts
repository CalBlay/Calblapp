import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import {
  SPACES_RESERVES_PATH,
  SPACES_ZOHO_ACCOUNTS_COLLECTION,
  SPACES_ZOHO_CLIENTS_COLLECTION,
} from '@/lib/spacesPermissions'
import { requireSpacesView } from '@/lib/server/spacesApiAuth'
import {
  filterClientNames,
  mergeClientNameLists,
} from '@/services/spaces/zohoClients'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const canView = await requireSpacesView(auth, SPACES_RESERVES_PATH)
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') || ''

    const [accountsSnap, manualSnap] = await Promise.all([
      db.collection(SPACES_ZOHO_ACCOUNTS_COLLECTION).get(),
      db.collection(SPACES_ZOHO_CLIENTS_COLLECTION).get(),
    ])

    const accountNames = accountsSnap.docs
      .map((doc) => String(doc.data().nom || '').trim())
      .filter(Boolean)

    const manualNames = manualSnap.docs
      .map((doc) => String(doc.data().nom || '').trim())
      .filter(Boolean)

    const merged = mergeClientNameLists(accountNames, manualNames)

    return NextResponse.json(
      { data: filterClientNames(merged, q) },
      { status: 200 }
    )
  } catch (err) {
    console.error('[API-SPACES-CLIENTS]', err)
    return NextResponse.json(
      { error: 'Error carregant clients' },
      { status: 500 }
    )
  }
}
