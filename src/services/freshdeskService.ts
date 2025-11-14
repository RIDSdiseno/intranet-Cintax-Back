// src/services/freshdeskService.ts
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRESHDESK_BASE_URL = process.env.FRESHDESK_BASE_URL!;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY!;

/** Obtiene una página de tickets desde Freshdesk */
async function fetchFreshdeskTicketsPage(page: number, perPage = 100) {
  const url = `${FRESHDESK_BASE_URL}/api/v2/tickets?per_page=${perPage}&page=${page}&include=requester`;

  const res = await axios.get(url, {
    auth: {
      username: FRESHDESK_API_KEY,
      password: "X", // Freshdesk: API_KEY como user y "X" como pass
    },
  });

  return res.data as any[];
}

/** Mapeo de ticket Freshdesk -> modelo Prisma */
function mapFreshdeskTicketToPrisma(ticket: any) {
  const requesterEmail =
    ticket.requester?.email ||   // si viene con include=requester
    ticket.email ||              // por si Freshdesk lo expone directo
    ticket.from_email ||         // algunos orígenes lo traen así
    "sin-correo@cintax.cl";

  return {
    freshdeskId: ticket.id,
    subject: ticket.subject ?? "Sin asunto",
    description: ticket.description_text ?? ticket.description ?? "",
    categoria: ticket.custom_fields?.cf_categoria ?? "otros",
    estado: String(ticket.status ?? "2"),
    prioridad: ticket.priority ?? null,
    requesterEmail,
  };
}
/**
 * Sincroniza tickets desde Freshdesk.
 * - Upsertea todos los tickets que vienen.
 * - BORRA de la DB los tickets con freshdeskId que ya no existen en Freshdesk
 *   (solo si se alcanzaron a leer TODAS las páginas).
 */
// src/services/freshdeskService.ts
export async function syncTicketsFromFreshdesk(perPage = 100) {
  let totalProcessed = 0;
  const freshdeskIdsVistos: number[] = [];

  let page = 1;
  while (true) {
    const fdTickets = await fetchFreshdeskTicketsPage(page, perPage);

    if (!fdTickets.length) {
      // No hay más tickets en Freshdesk
      break;
    }

    for (const t of fdTickets) {
      const data = mapFreshdeskTicketToPrisma(t);

      await prisma.ticket.upsert({
        where: { freshdeskId: data.freshdeskId },
        create: data,
        update: {
          subject: data.subject,
          description: data.description,
          categoria: data.categoria,
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

    // Si la página viene "incompleta", sabemos que es la última
    if (fdTickets.length < perPage) break;

    page++;
  }

  // AHORA sí podemos borrar todo lo que ya no existe en Freshdesk
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
