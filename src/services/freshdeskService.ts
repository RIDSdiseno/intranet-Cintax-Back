import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRESHDESK_BASE_URL = process.env.FRESHDESK_BASE_URL!;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY!;

// Configuración de Axios para no repetir auth
const freshdeskClient = axios.create({
  baseURL: FRESHDESK_BASE_URL,
  auth: {
    username: FRESHDESK_API_KEY,
    password: "X",
  },
});

/** * 1. Obtiene el diccionario de Grupos (ID -> Nombre)
 * Ej: { 1001: "RRHH", 1002: "Contabilidad" }
 */
async function fetchFreshdeskGroupsMap() {
  try {
    const res = await freshdeskClient.get("/api/v2/groups");
    const groups = res.data as any[];
    
    // Convertimos el array en un objeto simple: { id: "Nombre" }
    const groupMap: Record<number, string> = {};
    groups.forEach((g) => {
      groupMap[g.id] = g.name;
    });
    
    return groupMap;
  } catch (error) {
    console.error("Error obteniendo grupos de Freshdesk:", error);
    return {}; // Si falla, devolvemos mapa vacío para no romper todo
  }
}

/** 2. Obtiene una página de tickets */
async function fetchFreshdeskTicketsPage(page: number, perPage = 100) {
  // include=requester para tener el email del solicitante
  const url = `/api/v2/tickets?per_page=${perPage}&page=${page}&include=requester`;
  const res = await freshdeskClient.get(url);
  return res.data as any[];
}

/** * 3. Mapeo usando el Mapa de Grupos 
 */
function mapFreshdeskTicketToPrisma(ticket: any, groupsMap: Record<number, string>) {
  const requesterEmail =
    ticket.requester?.email ||
    ticket.email ||
    ticket.from_email ||
    "sin-correo@cintax.cl";

  // AQUÍ ESTÁ LA MAGIA:
  // Usamos ticket.group_id para buscar el nombre en el mapa que descargamos.
  // Si no tiene grupo o no existe en el mapa, ponemos "Entre otros".
  const groupName = ticket.group_id ? groupsMap[ticket.group_id] : null;
  
  const categoria = groupName || "Entre otros";

  return {
    freshdeskId: ticket.id,
    subject: ticket.subject ?? "Sin asunto",
    description: ticket.description_text ?? ticket.description ?? "",
    categoria: categoria, // Ahora guardará "RRHH", "Contabilidad", etc.
    estado: String(ticket.status ?? "2"),
    prioridad: ticket.priority ?? null,
    requesterEmail,
  };
}

/**
 * Sincroniza tickets desde Freshdesk (Principal)
 */
export async function syncTicketsFromFreshdesk(perPage = 100) {
  // PASO PREVIO: Obtener nombres de grupos
  const groupsMap = await fetchFreshdeskGroupsMap();
  console.log("Grupos cargados:", groupsMap); // Para depurar en consola

  let totalProcessed = 0;
  const freshdeskIdsVistos: number[] = [];

  let page = 1;
  while (true) {
    const fdTickets = await fetchFreshdeskTicketsPage(page, perPage);

    if (!fdTickets.length) {
      break;
    }

    for (const t of fdTickets) {
      // Pasamos el groupsMap al mapeador
      const data = mapFreshdeskTicketToPrisma(t, groupsMap);

      await prisma.ticket.upsert({
        where: { freshdeskId: data.freshdeskId },
        create: data,
        update: {
          subject: data.subject,
          description: data.description,
          categoria: data.categoria, // Se actualiza con el nombre del grupo
          estado: data.estado,
          prioridad: data.prioridad,
          requesterEmail: data.requesterEmail,
        },
      });

      if (data.freshdeskId != null) {
        freshdeskIdsVistos.push(data.freshdeskId);
      }

      totalProcessed++;
    }

    if (fdTickets.length < perPage) break;
    page++;
  }

  // Borrar tickets antiguos que ya no existen en Freshdesk
  if (freshdeskIdsVistos.length > 0) {
    await prisma.ticket.deleteMany({
      where: {
        freshdeskId: {
          not: null,
          notIn: freshdeskIdsVistos,
        },
      },
    });
  }

  return totalProcessed;
}