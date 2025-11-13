// src/services/freshdeskService.ts
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRESHDESK_BASE_URL = process.env.FRESHDESK_BASE_URL!;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY!;

/**
 * Hace una llamada a la API de Freshdesk para obtener tickets (paginado).
 * Freshdesk: GET /api/v2/tickets?per_page=100&page=1
 */
async function fetchFreshdeskTicketsPage(page: number, perPage = 100) {
  const url = `${FRESHDESK_BASE_URL}/api/v2/tickets?per_page=${perPage}&page=${page}`;

  const res = await axios.get(url, {
    auth: {
      username: FRESHDESK_API_KEY,
      // Freshdesk usa Basic Auth: API_KEY como user y 'X' como password
      password: "X",
    },
  });

  return res.data as any[]; // array de tickets de Freshdesk
}

/**
 * Mapea un ticket de Freshdesk a los campos de tu modelo Ticket.
 * Aquí haces la traducción de estados/categorías/prioridades.
 */
function mapFreshdeskTicketToPrisma(ticket: any) {
  return {
    freshdeskId: ticket.id,
    subject: ticket.subject ?? "Sin asunto",
    description: ticket.description_text ?? ticket.description ?? "",
    categoria: ticket.custom_fields?.cf_categoria ?? "otros", // ejemplo
    estado: String(ticket.status ?? "open"),
    prioridad: ticket.priority ?? null,
    requesterEmail: ticket.requester_email ?? "sin-correo@cintax.cl",
  };
}

/**
 * Sincroniza (importa/actualiza) tickets desde Freshdesk a la base local.
 * Devuelve el número de tickets procesados.
 */
export async function syncTicketsFromFreshdesk(maxPages = 3) {
  let totalProcessed = 0;

  for (let page = 1; page <= maxPages; page++) {
    const fdTickets = await fetchFreshdeskTicketsPage(page);

    if (!fdTickets.length) break; // no hay más páginas

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

      totalProcessed++;
    }
  }

  return totalProcessed;
}
