// filename: src/app/api/modifications/route.ts
import { NextRequest, NextResponse } from "next/server"
import { firestoreAdmin } from "@/lib/firebaseAdmin"
import admin from "firebase-admin"
import { getToken } from "next-auth/jwt"

interface ModificationDoc {
  id?: string
  eventId?: string
  eventCode?: string
  eventTitle?: string
  eventDate?: string
  eventLocation?: string
  eventCommercial?: string
  modificationNumber?: string
  department?: string
  createdBy?: string
  createdById?: string
  createdByEmail?: string
  category?: { id?: string; label?: string }
  importance?: string
  description?: string
  createdAt?: FirebaseFirestore.Timestamp | string
  updatedAt?: FirebaseFirestore.Timestamp | string
  [key: string]: unknown
}

function isTimestamp(val: unknown): val is FirebaseFirestore.Timestamp {
  return typeof val === "object" && val !== null && "toDate" in val
}

async function generateModificationNumber(): Promise<string> {
  const counterRef = firestoreAdmin.collection("counters").doc("modifications")

  const next = await firestoreAdmin.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = (snap.data()?.value as number) || 0
    const updated = current + 1
    tx.set(counterRef, { value: updated }, { merge: true })
    return updated
  })

  return `MOD${String(next).padStart(6, "0")}`
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req })
    if (!token) return NextResponse.json({ error: "No autoritzat" }, { status: 401 })

    const rawBody = await req.text()
    let payload: Record<string, unknown>

    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "JSON mal format" }, { status: 400 })
    }

    const {
      eventId,
      eventCode,
      eventTitle,
      eventDate,
      eventLocation,
      eventCommercial,
      department,
      createdBy,
      createdById,
      createdByEmail,
      category,
      importance,
      description,
    } = payload as ModificationDoc

    const createdByFinal = createdBy || (token as any)?.name || (token as any)?.email || ""
    const createdByIdFinal = createdById || (token as any)?.sub || ""
    const createdByEmailFinal = createdByEmail || (token as any)?.email || ""

    const modificationNumber = await generateModificationNumber()

    // Llegir event de stage_verd (si existeix) per omplir camps d'esdeveniment
    let ev: any = null
    if (eventId) {
      const evSnap = await firestoreAdmin.collection("stage_verd").doc(String(eventId)).get()
      if (evSnap.exists) ev = evSnap.data()
    }

    const eventTitleFinal = eventTitle || ev?.NomEvent || ""
    const eventLocationFinal = eventLocation || ev?.Ubicacio || ""
    const eventCodeFinal = eventCode || ev?.code || ev?.Code || ev?.C_digo || ev?.codi || ""
    const eventDateFinal = eventDate || ev?.DataInici || ev?.DataPeticio || ""
    const eventCommercialFinal = eventCommercial || ev?.Comercial || ""

    const now = new Date()
    const eventDateObj = eventDateFinal ? new Date(eventDateFinal) : null
    const daysToEvent =
      eventDateObj && !isNaN(eventDateObj.getTime())
        ? Math.round((eventDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null

    const docRef = await firestoreAdmin.collection("modifications").add({
      modificationNumber,
      eventId: eventId || "",
      eventCode: eventCodeFinal,
      eventTitle: eventTitleFinal,
      eventDate: eventDateFinal,
      eventLocation: eventLocationFinal,
      eventCommercial: eventCommercialFinal,
      department: department || "",
      category: category || { id: "", label: "" },
      importance: importance?.trim().toLowerCase() || "",
      description: description || "",
      createdBy: createdByFinal,
      createdById: createdByIdFinal,
      createdByEmail: createdByEmailFinal,
      daysToEvent,
      createdAt: admin.firestore.Timestamp.now(),
    })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err: unknown) {
    console.error("[modifications] POST error:", err)
    if (err instanceof Error)
      return NextResponse.json({ error: err.message }, { status: 500 })
    return NextResponse.json({ error: "Internal Error" }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const eventId = searchParams.get("eventId")
  const department = searchParams.get("department")
  const importance = searchParams.get("importance")
  const commercial = searchParams.get("commercial")
  const categoryLabel = searchParams.get("categoryLabel")
  const categoryId = searchParams.get("categoryId") // compatibilitat antiga

  try {
    const coll = firestoreAdmin.collection("modifications")

    // Si filtrem per dates d'esdeveniment, ordenem per eventDate; si no, per createdAt
    const usingEventDate = Boolean(from || to)
    let ref: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = usingEventDate
      ? coll.orderBy("eventDate", "asc")
      : coll.orderBy("createdAt", "desc")

    // Filtrat per data: eventDate en format YYYY-MM-DD
    if (from) ref = ref.where("eventDate", ">=", from)
    if (to) ref = ref.where("eventDate", "<=", to)

    if (eventId) ref = ref.where("eventId", "==", eventId)
    if (department && department !== "all")
      ref = ref.where("department", "==", department)
    if (importance && importance !== "all")
      ref = ref.where("importance", "==", importance.toLowerCase())
    if (commercial && commercial !== "all")
      ref = ref.where("eventCommercial", "==", commercial)

    const categoryFilter =
      categoryLabel && categoryLabel !== "all"
        ? categoryLabel
        : categoryId && categoryId !== "all"
        ? categoryId
        : null

    if (categoryFilter) {
      ref = ref.where("category.label", "==", categoryFilter)
    }

    const snap = await ref.get()
    const baseMods = snap.docs.map((doc) => {
      const data = doc.data() as ModificationDoc
      let createdAtVal: string | null = null
      let updatedAtVal: string | null = null

      if (data.createdAt) {
        if (isTimestamp(data.createdAt))
          createdAtVal = data.createdAt.toDate().toISOString()
        else if (typeof data.createdAt === "string") createdAtVal = data.createdAt
      }

      if (data.updatedAt) {
        if (isTimestamp(data.updatedAt))
          updatedAtVal = data.updatedAt.toDate().toISOString()
        else if (typeof data.updatedAt === "string") updatedAtVal = data.updatedAt
      }

      return { id: doc.id, ...data, createdAt: createdAtVal, updatedAt: updatedAtVal }
    })

    // Enriquim amb dades d'esdeveniment (nom/ubicació/data/codi) si falten
    const eventIds = Array.from(new Set(baseMods.map((m) => m.eventId).filter(Boolean))) as string[]
    const eventsSnap = eventIds.length
      ? await firestoreAdmin
          .collection("stage_verd")
          .where(admin.firestore.FieldPath.documentId(), "in", eventIds)
          .get()
      : null

    const eventsMap = new Map<string, any>()
    eventsSnap?.docs.forEach((doc) => eventsMap.set(doc.id, doc.data()))

    const modifications = baseMods.map((m) => {
      const ev = eventsMap.get(m.eventId || "")
      if (!ev) return m
      return {
        ...m,
        eventTitle: m.eventTitle || ev.NomEvent || "",
        eventLocation: m.eventLocation || ev.Ubicacio || "",
        eventCode: m.eventCode || ev.code || ev.Code || ev.C_digo || ev.codi || "",
        eventDate: m.eventDate || ev.DataInici || ev.DataPeticio || "",
        eventCommercial: m.eventCommercial || ev.Comercial || "",
      }
    })

    return NextResponse.json({ modifications }, { status: 200 })
  } catch (err: unknown) {
    console.error("[modifications] GET error:", err)
    if (err instanceof Error)
      return NextResponse.json({ error: err.message }, { status: 500 })
    return NextResponse.json({ error: "Internal Error" }, { status: 500 })
  }
}
