import { NextResponse } from "next/server"
import { firestoreAdmin } from "@/lib/firebaseAdmin"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const doc = await firestoreAdmin.collection("finques").doc(params.id).get()

    if (!doc.exists) return NextResponse.json({ error: 'No trobat' }, { status: 404 })

    return NextResponse.json(doc.data(), { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Error carregant finca' }, { status: 500 })
  }
}
