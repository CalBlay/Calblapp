// file: src/app/api/finques/[id]/route.ts
import { NextResponse } from "next/server"
import { firestoreAdmin } from "@/lib/firebaseAdmin"
import { registerFinquesProduccioImagesInIndex } from "@/lib/media/storageMediaIndex"

export const runtime = "nodejs"

// =======================================================
//  PATCH → Actualitzar una finca concreta
// =======================================================
export async function PATCH(
  req: Request,
  context: { params: { id: string } }
) {
  try {
    const id = context.params.id
    const incoming = await req.json()

    // Col·lecció
    const ref = firestoreAdmin.collection("finques").doc(id)
    const snap = await ref.get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "La finca no existeix." },
        { status: 404 }
      )
    }

    // 🔍 Estat actual de Firestore
    const actual = snap.data() || {}

    // Camps arrel que es poden editar
    const allowedRoot = ["code", "nom", "ubicacio", "ln", "tipus", "origen"]

    const data: Record<string, unknown> = {}

    // =======================================================
    // 1) Arrel (camps simples)
    // =======================================================
    for (const key of allowedRoot) {
      if (key in incoming) {
        data[key] = incoming[key]
      }
    }

    // =======================================================
    // 2) Bloc comercial (merge segur)
    // =======================================================
    if (incoming.comercial) {
      data.comercial = {
        ...(actual.comercial || {}),
        ...incoming.comercial,
      }
    }

    // =======================================================
    // 3) Bloc producció (dinàmic, conserva TOT)
    // =======================================================
    if (incoming.produccio) {
      data.produccio = {
        ...(actual.produccio || {}),
        ...incoming.produccio,
      }
    }

    // =======================================================
    // 4) updatedAt
    // =======================================================
    data.updatedAt = Date.now()

    // Desar a Firestore
    await ref.set(data, { merge: true })

    const mergedProduccio = data.produccio as Record<string, unknown> | undefined
    if (mergedProduccio && Array.isArray(mergedProduccio.images)) {
      const imgs = (mergedProduccio.images as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      if (imgs.length) {
        void registerFinquesProduccioImagesInIndex(id, {
          nom: String(incoming.nom ?? actual.nom ?? ""),
          code: String(incoming.code ?? actual.code ?? ""),
          images: imgs,
          createdAt: data.updatedAt as number,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      id,
      updated: data,
    })
  } catch (err) {
    console.error("❌ Error PATCH /finques/[id]:", err)
    return NextResponse.json(
      { error: "Error actualitzant la finca" },
      { status: 500 }
    )
  }
}
