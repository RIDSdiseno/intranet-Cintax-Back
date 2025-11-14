// src/services/freshdeskService.ts
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FRESHDESK_BASE_URL = process.env.FRESHDESK_BASE_URL!;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY!;

/** Obtiene una página de tickets desde Freshdesk */
async function fetchFreshdeskTicketsPage(page: number, perPage = 100) {
  const url = `${FRESHDESK_BASE_URL}/api/v2/tickets?per_page=${perPage}&page=${page}`;

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
  return {
    freshdeskId: ticket.id,
    subject: ticket.subject ?? "Sin asunto",
    description: ticket.description_text ?? ticket.description ?? "",
    categoria: ticket.custom_fields?.cf_categoria ?? "otros",
    // Aquí podrías seguir guardando el "status" numérico si quieres
    estado: String(ticket.status ?? "2"),
    prioridad: ticket.priority ?? null,
    requesterEmail: ticket.requester_email ?? "sin-correo@cintax.cl",
  };
}

/**
 * Sincroniza tickets desde Freshdesk.
 * - Upsertea todos los tickets que vienen.
 * - BORRA de la DB los tickets con freshdeskId que ya no existen en Freshdesk
 *   (solo si se alcanzaron a leer TODAS las páginas).
 */
export async function syncTicketsFromFreshdesk(maxPages = 3, perPage = 100) {
  let totalProcessed = 0;
  const freshdeskIdsVistos: number[] = [];
  let truncadoPorMaxPages = false;

  for (let page = 1; page <= maxPages; page++) {
    const fdTickets = await fetchFreshdeskTicketsPage(page, perPage);

    if (!fdTickets.length) {
      // No hay más tickets en Freshdesk → llegamos al final real
      truncadoPorMaxPages = false;
      break;
    }

    // Si justo llenamos la página y además llegamos al límite de maxPages,
    // asumimos que puede haber más tickets que NO estamos leyendo.
    if (fdTickets.length === perPage && page === maxPages) {
      truncadoPorMaxPages = true;
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
  }

  // Solo borramos si NO hemos truncado por maxPages,
  // es decir, si estamos razonablemente seguros de haber listado todos.
  if (!truncadoPorMaxPages && freshdeskIdsVistos.length > 0) {
    await prisma.ticket.deleteMany({
      where: {
        // solo los tickets que vienen de Freshdesk
        freshdeskId: {
          not: null,
          notIn: freshdeskIdsVistos,
        },
      },
    });
  }

  return totalProcessed;
}
