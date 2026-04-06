// File: src/app/api/incidents/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { firestoreAdmin } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";
import type { Query } from "firebase-admin/firestore";
import {
  buildTicketBody,
  notifyMaintenanceManagers,
} from '@/lib/maintenanceNotifications'
import { canAccessIncidentsModule, canPostIncident } from '@/lib/incidentPolicy'

interface IncidentDoc {
  id?: string;
  eventId?: string;
  eventCode?: string;
  department?: string;
  importance?: string;
  description?: string;
  createdBy?: string;
  status?: string;
  createdAt?: FirebaseFirestore.Timestamp | string;
  eventTitle?: string;
  eventDate?: string;
  eventLocation?: string;
  category?: { id?: string; label?: string };
  imageUrl?: string | null;
  imagePath?: string | null;
  imageMeta?: { size?: number; type?: string } | null;
  images?: Array<{
    url?: string | null;
    path?: string | null;
    meta?: { size?: number; type?: string } | null;
  }>;
  [key: string]: unknown;
}

/* -------------------------------------------------------
 * 🔵 HELPER: format timestamp
 * ----------------------------------------------------- */
function normalizeTimestamp(ts: any): string {
  if (ts && typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts === "string") return ts;
  return "";
}

function normalizePriority(value?: string) {
  const v = (value || "").trim().toLowerCase();
  if (v === "urgent") return "urgent";
  if (v === "alta") return "alta";
  if (v === "baixa") return "baixa";
  return "normal";
}

/** Resposta més lleugera per llistats (tauler, quadre): sense payloads d’imatges. */
function projectIncidentLight(inc: Record<string, unknown>): Record<string, unknown> {
  const {
    images: _images,
    imageUrl: _u,
    imagePath: _p,
    imageMeta: _m,
    ...rest
  } = inc;
  return {
    ...rest,
    images: [],
    imageUrl: null,
    imagePath: null,
    imageMeta: null,
  };
}

/* -------------------------------------------------------
 * 🔵 HELPER: Generar número INCxxxxx
 * ----------------------------------------------------- */
async function generateIncidentNumber(): Promise<string> {
  const counterRef = firestoreAdmin.collection("counters").doc("incidents");

  const next = await firestoreAdmin.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = (snap.data()?.value as number) || 0;
    const updated = current + 1;
    tx.set(counterRef, { value: updated }, { merge: true });
    return updated;
  });

  return `INC${String(next).padStart(6, "0")}`;
}

/* -------------------------------------------------------
 * 🔵 POST — Crear incidència
 * ----------------------------------------------------- */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: "No autenticat" }, { status: 401 });
    if (!canPostIncident(user)) {
      return NextResponse.json({ error: "Sense permisos" }, { status: 403 });
    }

    const bodyText = await req.text();
    let payload: Record<string, any>;

    try {
      payload = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "JSON mal formatejat" }, { status: 400 });
    }

    const { eventId, department, importance, description, respSala, category, images, imageUrl, imagePath, imageMeta } =
      payload;

    if (!eventId || !department || !importance || !description || !respSala || !category) {
      return NextResponse.json(
        { error: "Falten camps obligatoris" },
        { status: 400 }
      );
    }

    // 1️⃣ Llegir esdeveniment
    const evSnap = await firestoreAdmin.collection("stage_verd").doc(String(eventId)).get();

    if (!evSnap.exists) {
      return NextResponse.json(
        { error: "No s’ha trobat l’esdeveniment a stage_verd" },
        { status: 404 }
      );
    }

    const ev = evSnap.data() as any;

    // 2️⃣ Generar número d’incidència
    const incidentNumber = await generateIncidentNumber();

    const normalizedImages = Array.isArray(images)
      ? images
          .map((image: any) => ({
            url: image?.url || null,
            path: image?.path || null,
            meta: image?.meta || null,
          }))
          .filter((image: any) => image.url || image.path)
      : []

    const primaryImage = normalizedImages[0] || {
      url: imageUrl || null,
      path: imagePath || null,
      meta: imageMeta || null,
    }

    // 3️⃣ Crear document incidència
    const docRef = await firestoreAdmin.collection("incidents").add({
      incidentNumber,
      eventId: String(eventId),
      eventCode:
        ev.code || ev.Code || ev.C_digo || ev.codi || "",
      department,
      importance: importance.trim().toLowerCase(),
      description,
      createdBy: respSala,
      status: "obert",
      createdAt: admin.firestore.Timestamp.now(),

      // dades event
      eventTitle: ev.NomEvent || "",
      eventDate: ev.DataInici || ev.DataPeticio || "",
      eventLocation: ev.Ubicacio || "",
      category: {
        id: category?.id || "",
        label: category?.label || "",
      },
      imageUrl: primaryImage.url || null,
      imagePath: primaryImage.path || null,
      imageMeta: primaryImage.meta || null,
      images: normalizedImages,
    });

    const categoryId = String(category?.id || "").trim();
    const categoryPrefix = categoryId.charAt(0);
    const shouldCreateTicket = categoryPrefix === "2" || categoryPrefix === "4";
    const ticketType = categoryPrefix === "4" ? "deco" : "maquinaria";

    if (shouldCreateTicket) {
      const now = Date.now();
      const ticketRef = await firestoreAdmin.collection("maintenanceTickets").add({
        ticketCode: incidentNumber,
        incidentNumber,
        location: ev.Ubicacio || "",
        machine: "",
        description,
        priority: normalizePriority(importance),
        status: "nou",
        ticketType,
        createdAt: now,
        createdById: null,
        createdByName: respSala || "",
        assignedToIds: [],
        assignedToNames: [],
        assignedAt: null,
        assignedById: null,
        assignedByName: null,
        plannedStart: null,
        plannedEnd: null,
        estimatedMinutes: null,
        source: "incidencia",
        sourceEventId: String(eventId),
        sourceEventCode: ev.code || ev.Code || ev.C_digo || ev.codi || "",
        sourceEventTitle: ev.NomEvent || "",
        sourceEventLocation: ev.Ubicacio || "",
        sourceEventDate: ev.DataInici || ev.DataPeticio || "",
        imageUrl: primaryImage.url || null,
        imagePath: primaryImage.path || null,
        imageMeta: primaryImage.meta || null,
        needsVehicle: false,
        vehicleId: null,
        vehiclePlate: null,
        statusHistory: [
          {
            status: "nou",
            at: now,
            byId: null,
            byName: respSala || "",
          },
        ],
      });

      await notifyMaintenanceManagers({
        payload: {
          type: 'maintenance_ticket_new',
          title: 'Nou ticket de manteniment',
          body: buildTicketBody({
            machine: '',
            location: ev.Ubicacio || '',
            description,
          }),
          ticketId: ticketRef.id,
          ticketCode: incidentNumber,
          status: 'nou',
          priority: normalizePriority(importance),
          location: ev.Ubicacio || '',
          machine: '',
          source: 'incidencia',
        },
      })
    }

    return NextResponse.json({ id: docRef.id }, { status: 201 });
  } catch (err: any) {
    console.error("[incidents] POST error:", err);
    return NextResponse.json({ error: err.message || "Error intern" }, { status: 500 });
  }
}

/* -------------------------------------------------------
 * 🔵 GET — Llistar incidències
 * ----------------------------------------------------- */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; role?: string; department?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: "No autenticat" }, { status: 401 });
    if (!canAccessIncidentsModule(user)) {
      return NextResponse.json({ error: "Sense permisos" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const importance = searchParams.get("importance");
    const eventId = searchParams.get("eventId");
    const department = searchParams.get("department");
    const categoryLabel = searchParams.get("categoryLabel");
    const categoryId = searchParams.get("categoryId"); // compat: nom antic
    const limitRaw = Number(searchParams.get("limit") || "");
    const limitN = Math.min(
      1000,
      Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 300)
    );
    const lightList =
      searchParams.get("light") === "1" || searchParams.get("light") === "true";

    // Amb rang de dates: filtre i ordre per **data de l'esdeveniment** (reunió setmanal).
    // Sense rang: ordre per creació (tauler general).
    let ref: Query = firestoreAdmin.collection("incidents");
    if (from && to) {
      ref = ref
        .where("eventDate", ">=", from)
        .where("eventDate", "<=", to)
        .orderBy("eventDate", "desc");
    } else {
      ref = ref.orderBy("createdAt", "desc");
    }


    if (eventId) ref = ref.where("eventId", "==", eventId);
    if (importance && importance !== "all") {
      if (importance === "normal") {
        ref = ref.where("importance", "in", ["normal", "mitjana"]);
      } else {
        ref = ref.where("importance", "==", importance);
      }
    }
    if (department && department !== "all")
      ref = ref.where("department", "==", department);

    // Filtre de categoria: admet tant label (nou) com id (antic)
    const categoryFilter =
      categoryLabel && categoryLabel !== "all"
        ? categoryLabel
        : categoryId && categoryId !== "all"
        ? categoryId
        : null;

    if (categoryFilter)
      ref = ref.where("category.label", "==", categoryFilter);

    ref = ref.limit(limitN);

    // 1️⃣ Llegir incidències crues
    const snap = await ref.get();

    const raw = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        createdAt: normalizeTimestamp(d.createdAt),
      };
    }) as IncidentDoc[];

    // 2️⃣ Recuperar esdeveniments stage_verd
    const eventIds = [...new Set(raw.map((i) => i.eventId).filter(Boolean))] as string[];

    const eventsMap = new Map<string, FirebaseFirestore.DocumentData>()
    if (eventIds.length) {
      const chunkSize = 10
      const chunks: string[][] = []
      for (let i = 0; i < eventIds.length; i += chunkSize) {
        chunks.push(eventIds.slice(i, i + chunkSize))
      }

      const snaps = await Promise.all(
        chunks.map((chunk) =>
          firestoreAdmin
            .collection('stage_verd')
            .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
            .get()
        )
      )

      snaps.forEach((snap) => {
        snap?.docs.forEach((doc) => eventsMap.set(doc.id, doc.data()))
      })
    }

    // 3️⃣ Enriquir incidències
    const incidents = raw.map((inc) => {
      const ev = eventsMap.get(inc.eventId || "") || {};

      return {
        ...inc,
        ln: ev.LN || "",
        serviceType: ev.Servei || "",
        pax: ev.NumPax || "",
        eventCode:
          ev.code || ev.Code || ev.C_digo || ev.codi || "",
        eventTitle: ev.NomEvent || "",
        eventLocation: ev.Ubicacio || "",
        eventCommercial: ev.Comercial || ev.comercial || "",
        fincaId: ev.FincaId || ev.FincaCode || "",
      };
    });

    const payload = lightList
      ? incidents.map((row) => projectIncidentLight(row as Record<string, unknown>))
      : incidents;

    return NextResponse.json({ incidents: payload }, { status: 200 });
  } catch (err) {
    console.error("[incidents] GET error:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
