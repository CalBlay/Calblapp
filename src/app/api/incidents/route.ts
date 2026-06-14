// File: src/app/api/incidents/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/server/authOptions";
import { firestoreAdmin, storageAdmin } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";
import type { Query } from "firebase-admin/firestore";
import {
  buildTicketBody,
  notifyForNewMaintenanceTicket,
} from '@/lib/maintenanceNotifications'
import { notifyMarketingManagersFor9xxIncident } from '@/lib/incidentNotifications'
import { canPostIncident } from '@/lib/incidentPolicy'
import { requireIncidentsModuleView } from '@/lib/server/incidentsApiAuth'
import { registerMediaRef } from '@/lib/media/storageMediaIndex'
import { normalizeRole } from '@/lib/roles'
import { isIncidentCategoryGroup2xx } from '@/lib/incidentTypology'

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
  hasImages?: boolean;
  imageCount?: number;
  images?: Array<{
    url?: string | null;
    path?: string | null;
    meta?: { size?: number; type?: string } | null;
  }>;
  [key: string]: unknown;
}

type IncidentImageInput = {
  url?: string | null
  path?: string | null
  meta?: { size?: number; type?: string } | null
}

type IncidentPayload = {
  eventId?: string
  department?: string
  importance?: string
  description?: string
  respSala?: string
  category?: { id?: string; label?: string }
  images?: IncidentImageInput[]
  imageUrl?: string | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
}

/* -------------------------------------------------------
 * 🔵 HELPER: format timestamp
 * ----------------------------------------------------- */
function normalizeTimestamp(ts: unknown): string {
  if (
    ts &&
    typeof ts === "object" &&
    "toDate" in ts &&
    typeof (ts as { toDate?: unknown }).toDate === "function"
  ) {
    return ((ts as { toDate: () => Date }).toDate()).toISOString();
  }
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

const normalizeText = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const getEventCommercial = (ev: Record<string, unknown>) =>
  String(
    ev.Comercial ||
      ev.comercial ||
      ev.comercialNom ||
      ev.Comercial_nom ||
      ev.ComercialName ||
      ev.ComercialNom ||
      ""
  ).trim();

const getEventCode = (ev: Record<string, unknown>) =>
  String(ev.code || ev.Code || ev.C_digo || ev.codi || '').trim()

const getEventOperationalResponsibles = (ev: Record<string, unknown>) => {
  const candidates = [
    ev.Responsable,
    ev.RESPONSABLE,
    ev.responsable,
    ev.responsableZoho,
    ev.responsableName,
  ]

  return candidates
    .flatMap((value) => {
      if (Array.isArray(value)) return value
      return [value]
    })
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

const commercialOwnsEvent = (
  user: { name?: string | null; commercialName?: string | null },
  ev: Record<string, unknown>
) => {
  const eventCommercial = normalizeText(getEventCommercial(ev));
  if (!eventCommercial) return false;
  const aliases = [user.commercialName, user.name]
    .map((value) => normalizeText(value || ""))
    .filter(Boolean);
  return aliases.some((alias) => alias === eventCommercial);
};

async function commercialCanCreateIncidentForEvent(
  user: { name?: string | null; commercialName?: string | null },
  eventId: string,
  ev: Record<string, unknown>
) {
  if (commercialOwnsEvent(user, ev)) return true

  const aliases = new Set(
    [user.commercialName, user.name]
      .map((value) => normalizeText(value || ''))
      .filter(Boolean)
  )
  if (aliases.size === 0) return false

  const operativeResponsibles = getEventOperationalResponsibles(ev).map((value) => normalizeText(value))
  if (operativeResponsibles.some((value) => aliases.has(value))) return true

  const eventCode = getEventCode(ev)
  const quadrantCollections = [
    'quadrantsServeis',
    'quadrantsLogistica',
    'quadrantsCuina',
    'quadrantsProduccio',
    'quadrantsComercial',
  ]

  const snapshots = await Promise.all(
    quadrantCollections.map(async (collectionName) => {
      const collection = firestoreAdmin.collection(collectionName)
      const byEventId = await collection.where('eventId', '==', eventId).get().catch(() => null)
      if (byEventId && !byEventId.empty) return byEventId.docs
      if (!eventCode) return []
      const byCode = await collection.where('code', '==', eventCode).get().catch(() => null)
      return byCode?.docs ?? []
    })
  )

  for (const docs of snapshots) {
    for (const doc of docs) {
      const data = doc.data() as {
        responsableName?: string
        responsable?: { name?: string | null } | null
      }
      const possibleResponsibleNames = [
        String(data?.responsableName || '').trim(),
        String(data?.responsable?.name || '').trim(),
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
      if (possibleResponsibleNames.some((value) => aliases.has(value))) return true
    }
  }

  return false
}

/** Resposta més lleugera per llistats (tauler, quadre): sense payloads d’imatges. */
function projectIncidentLight(inc: Record<string, unknown>): Record<string, unknown> {
  const rawImages = Array.isArray(inc.images) ? inc.images : [];
  const fallbackPrimary = inc.imageUrl || inc.imagePath ? 1 : 0;
  const imageCount = rawImages.length > 0 ? rawImages.length : fallbackPrimary;
  const {
    images: _images,
    imageUrl: _u,
    imagePath: _p,
    imageMeta: _m,
    ...rest
  } = inc;
  return {
    ...rest,
    hasImages: imageCount > 0,
    imageCount,
    images: [],
    imageUrl: null,
    imagePath: null,
    imageMeta: null,
  };
}

async function withFreshIncidentImageUrls(rows: Array<Record<string, unknown>>) {
  const bucket = storageAdmin.bucket()

  return Promise.all(
    rows.map(async (row) => {
      const rawImages = Array.isArray(row.images) ? row.images : []
      const normalizedImages =
        rawImages.length > 0
          ? rawImages
          : row.imageUrl || row.imagePath
            ? [
                {
                  url: row.imageUrl || null,
                  path: row.imagePath || null,
                  meta: row.imageMeta || null,
                },
              ]
            : []

      const images = await Promise.all(
        normalizedImages.map(async (image) => {
          const path = String(image?.path || '').trim()
          if (!path) {
            return {
              url: image?.url || null,
              path: image?.path || null,
              meta: image?.meta || null,
              missing: false,
            }
          }
          try {
            const [freshUrl] = await bucket.file(path).getSignedUrl({
              action: 'read',
              expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
            })
            return {
              url: freshUrl,
              path,
              meta: image?.meta || null,
              missing: false,
            }
          } catch {
            return {
              url: null,
              path,
              meta: image?.meta || null,
              missing: true,
            }
          }
        })
      )

      const firstImage = images[0] || null
      return {
        ...row,
        imageUrl: firstImage?.url || null,
        imagePath: firstImage?.path || null,
        imageMeta: firstImage?.meta || null,
        hasImages: images.length > 0,
        imageCount: images.length,
        images,
      }
    })
  )
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
    const user = session?.user as { id?: string; role?: string; department?: string; name?: string; commercialName?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: "No autenticat" }, { status: 401 });
    if (!canPostIncident(user)) {
      return NextResponse.json({ error: "Sense permisos" }, { status: 403 });
    }

    const bodyText = await req.text();
    let payload: IncidentPayload;

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

    const ev = (evSnap.data() || {}) as Record<string, unknown>;
    if (
      normalizeRole(user.role || "") === "comercial" &&
      !(await commercialCanCreateIncidentForEvent(user, String(eventId), ev))
    ) {
      return NextResponse.json(
        { error: "Aquest esdeveniment no esta assignat ni al teu comercial ni al teu responsable" },
        { status: 403 }
      );
    }

    const eventCode = getEventCode(ev)
    const eventTitle = String(ev.NomEvent || "")
    const eventDate = String(ev.DataInici || ev.DataPeticio || "")
    const eventLocation = String(ev.Ubicacio || "")

    // 2️⃣ Generar número d’incidència
    const incidentNumber = await generateIncidentNumber();

    const normalizedImages = Array.isArray(images)
      ? images
          .map((image: IncidentImageInput) => ({
            url: image?.url || null,
            path: image?.path || null,
            meta: image?.meta || null,
          }))
          .filter((image) => image.url || image.path)
      : []

    const primaryImage = normalizedImages[0] || {
      url: imageUrl || null,
      path: imagePath || null,
      meta: imageMeta || null,
    }

    const categoryId = String(category?.id || '').trim()
    const hasAttachment =
      normalizedImages.length > 0 || Boolean(primaryImage.url || primaryImage.path)
    if (isIncidentCategoryGroup2xx(categoryId) && !hasAttachment) {
      return NextResponse.json(
        { error: 'Les incidències del grup 2XX (Maquinària) requereixen adjuntar com a mínim una foto o fitxer.' },
        { status: 400 }
      )
    }

    // 3️⃣ Crear document incidència
    const createdAtMs = Date.now();
    const docRef = await firestoreAdmin.collection("incidents").add({
      incidentNumber,
      eventId: String(eventId),
      eventCode,
      department,
      importance: String(importance).trim().toLowerCase(),
      description,
      createdBy: respSala,
      createdById: user.id,
      status: "obert",
      createdAt: admin.firestore.Timestamp.now(),

      // dades event
      eventTitle,
      eventDate,
      eventLocation,
      category: {
        id: String(category?.id || ""),
        label: String(category?.label || ""),
      },
      imageUrl: primaryImage.url || null,
      imagePath: primaryImage.path || null,
      imageMeta: primaryImage.meta || null,
      images: normalizedImages,
    });

    const primaryPath = String(primaryImage.path || "").trim();
    if (primaryPath) {
      const meta = primaryImage.meta as { size?: number; type?: string } | null | undefined;
      void registerMediaRef({
        path: primaryPath,
        source: "incidents",
        firestoreDocId: docRef.id,
        url: String(primaryImage.url || "").trim() || null,
        size: typeof meta?.size === "number" ? meta.size : null,
        contentType: meta?.type ? String(meta.type) : null,
        title: [incidentNumber, eventTitle, String(description).slice(0, 80)]
          .filter(Boolean)
          .join(" · "),
        createdAt: createdAtMs,
        incidentEventId: String(eventId),
      });
    }

    const categoryPrefix = categoryId.charAt(0);
    const baseUrl = new URL(req.url).origin

    if (categoryPrefix === '9') {
      await notifyMarketingManagersFor9xxIncident({
        baseUrl,
        payload: {
          type: 'incident_marketing_9xx_new',
          title: 'Nova incidencia 9XX',
          body: [
            incidentNumber,
            eventTitle || eventLocation || eventCode,
            String(category?.label || '').trim(),
          ]
            .filter(Boolean)
            .join(' · '),
          incidentId: docRef.id,
          incidentNumber,
          eventId: String(eventId),
          eventCode,
          categoryId,
          categoryLabel: String(category?.label || '').trim() || null,
        },
      })
    }

    const shouldCreateTicket = categoryPrefix === "2" || categoryPrefix === "4";
    const ticketType = categoryPrefix === "4" ? "deco" : "maquinaria";

    if (shouldCreateTicket) {
      const now = Date.now();
      const ticketRef = await firestoreAdmin.collection("maintenanceTickets").add({
        ticketCode: incidentNumber,
        incidentNumber,
        location: eventLocation,
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
        sourceEventCode: eventCode,
        sourceEventTitle: eventTitle,
        sourceEventLocation: eventLocation,
        sourceEventDate: eventDate,
        imageUrl: primaryImage.url || null,
        imagePath: primaryImage.path || null,
        imageMeta: primaryImage.meta || null,
        needsVehicle: false,
        vehicleId: null,
        vehiclePlate: null,
        workflowStage: 'tickets_inbox',
        intakeChannel: 'incidencia',
        statusHistory: [
          {
            status: "nou",
            at: now,
            byId: null,
            byName: respSala || "",
          },
        ],
      });

      await notifyForNewMaintenanceTicket({
        workflowStage: 'tickets_inbox',
        payload: {
          type: 'maintenance_ticket_new',
          title: 'Nou ticket de manteniment',
          body: buildTicketBody({
            machine: '',
            location: eventLocation,
            description: String(description),
          }),
          ticketId: ticketRef.id,
          ticketCode: incidentNumber,
          status: 'nou',
          priority: normalizePriority(String(importance)),
          location: eventLocation,
          machine: '',
          source: 'incidencia',
        },
      })

      if (primaryPath) {
        const meta = primaryImage.meta as { size?: number; type?: string } | null | undefined;
        void registerMediaRef({
          path: primaryPath,
          source: "maintenance",
          firestoreDocId: ticketRef.id,
          url: String(primaryImage.url || "").trim() || null,
          size: typeof meta?.size === "number" ? meta.size : null,
          contentType: meta?.type ? String(meta.type) : null,
          title: [incidentNumber, eventLocation, String(description).slice(0, 80)]
            .filter(Boolean)
            .join(" · "),
          createdAt: now,
          incidentEventId: String(eventId),
        });
      }
    }

    return NextResponse.json({ id: docRef.id }, { status: 201 });
  } catch (err: unknown) {
    console.error("[incidents] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error intern" },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------
 * 🔵 GET — Llistar incidències
 * ----------------------------------------------------- */
export async function GET(req: Request) {
  try {
    const auth = await requireIncidentsModuleView();
    if (!auth.ok) return auth.res;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const importance = searchParams.get("importance");
    const eventId = searchParams.get("eventId");
    const department = searchParams.get("department");
    const categoryLabel = searchParams.get("categoryLabel");
    const categoryId = searchParams.get("categoryId"); // compat: nom antic
    const categoryPrefix = searchParams.get("categoryPrefix");
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
    const categoryLabelFilter =
      categoryLabel && categoryLabel !== "all" ? categoryLabel : null;
    const categoryIdFilter =
      !categoryLabelFilter && categoryId && categoryId !== "all" ? categoryId : null;

    if (categoryLabelFilter) {
      ref = ref.where("category.label", "==", categoryLabelFilter);
    } else if (categoryIdFilter) {
      ref = ref.where("category.id", "==", categoryIdFilter);
    }

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

    const categoryPrefixFilter =
      !categoryLabelFilter && !categoryIdFilter && categoryPrefix && categoryPrefix !== 'all'
        ? categoryPrefix
        : ''

    const filteredIncidents = categoryPrefixFilter
      ? incidents.filter((inc) => String(inc.category?.id || '').trim().startsWith(categoryPrefixFilter))
      : incidents

    const payload = lightList
      ? filteredIncidents.map((row) => projectIncidentLight(row as Record<string, unknown>))
      : await withFreshIncidentImageUrls(filteredIncidents as Array<Record<string, unknown>>)

    return NextResponse.json({ incidents: payload }, { status: 200 });
  } catch (err) {
    console.error("[incidents] GET error:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
