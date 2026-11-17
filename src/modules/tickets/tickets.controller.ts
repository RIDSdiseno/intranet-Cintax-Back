import type { Request, Response } from "express";
import { TicketMessageType } from "@prisma/client";
import {
  getTicketAgentsForUser,
  getInboxDiagnosticForAdmin,
  getGroupsForUser,
  getSummaryForUser,
  getTicketDetailForUser,
  getTicketEventsForUser,
  getTicketMessagesForUser,
  getTicketsForUser,
  createTicketForUser,
  createTicketMessageForUser,
  coerceMessageType,
  TicketMessagesNotReadyError,
  updateTicketForUser,
} from "./tickets.service";
import { isAdmin } from "./access/ticketAccess";
import { ingestInbox } from "./email/ingestInbox";
import { logTicketError, logTicketInfo, logTicketWarn } from "./tickets.logger";

function escapeHtml(input: string) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plainTextFromHtml(html: string) {
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAuthMeta(req: Request) {
  return {
    requestId: req.requestId ?? null,
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
  };
}

export const listTicketGroups = async (req: Request, res: Response) => {
  try {
    const { view } = req.query as { view?: string };
    const data = await getGroupsForUser({
      user: req.user,
      view,
      requestId: req.requestId,
    });
    return res.json({ ok: true, data });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "tickets_groups",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

/** GET /api/tickets/summary?area=&view= : totales + SLA global (solo lectura). */
export const getTicketsSummary = async (req: Request, res: Response) => {
  try {
    const { area, view } = req.query as { area?: string; view?: string };
    const data = await getSummaryForUser({
      user: req.user,
      area,
      view,
      requestId: req.requestId,
    });
    return res.json({ ok: true, data });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "tickets_summary",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const listTickets = async (req: Request, res: Response) => {
  try {
    const {
      area,
      view,
      q,
      keywords,
      status,
      priority,
      estado,
      prioridad,
      asignado,
      solicitante,
      page,
      pageSize,
    } = req.query as {
      area?: string;
      view?: string;
      q?: string;
      keywords?: string;
      status?: string;
      priority?: string;
      estado?: string;
      prioridad?: string;
      asignado?: string;
      solicitante?: string;
      page?: string;
      pageSize?: string;
    };

    const data = await getTicketsForUser({
      user: req.user,
      area,
      view,
      q,
      keywords,
      status: status ?? estado,
      priority: priority ?? prioridad,
      asignado,
      solicitante,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      requestId: req.requestId,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "tickets_list",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const listTicketAgents = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    if (!["ADMIN", "SUPERVISOR", "AGENTE"].includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Sin permisos" });
    }

    const data = await getTicketAgentsForUser({
      user: req.user,
      requestId: req.requestId,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "tickets_agents_list",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const diagnosticTicketsInbox = async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, error: "Sin permisos" });
    }

    const limitRaw = Number(req.query.limit);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.min(Math.max(limitRaw, 1), 100);

    const data = await getInboxDiagnosticForAdmin({
      user: req.user,
      limit,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    console.error("diagnosticTicketsInbox error:", err);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

/**
 * POST /api/tickets/sync
 * Lee la bandeja de soporte y crea/actualiza tickets desde los correos.
 */
export const syncTickets = async (req: Request, res: Response) => {
  const auth = getAuthMeta(req);
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ ok: false, error: "Sin permisos" });
    }

    const { days, unreadOnly, markRead, maxThreads } = req.query as {
      days?: string;
      unreadOnly?: string;
      markRead?: string;
      maxThreads?: string;
    };

    const data = await ingestInbox({
      days: days ? Number(days) : undefined,
      unreadOnly: unreadOnly === undefined ? undefined : unreadOnly !== "false",
      markRead: markRead === undefined ? undefined : markRead !== "false",
      maxThreads: maxThreads ? Number(maxThreads) : undefined,
      requestId: req.requestId,
      userId: auth.userId,
    });

    return res.json({
      ok: true,
      message: `Sincronizacion completada: ${data.createdTickets} ticket(s) nuevo(s), ${data.createdMessages} mensaje(s)`,
      processed: data.scannedThreads,
      data: {
        processed: data.scannedThreads,
        ingested: data.createdMessages,
        createdTickets: data.createdTickets,
        updatedThreads: data.updatedThreads,
        duplicates: data.duplicates,
        errors: data.errors,
      },
    });
  } catch (err) {
    logTicketError({
      action: "tickets_email_ingest",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      error: err,
    });
    const message =
      err instanceof Error && err.message.includes("TICKETS_MAILBOX")
        ? "Falta configurar TICKETS_MAILBOX en el entorno"
        : "Error interno";
    return res.status(500).json({ ok: false, error: message });
  }
};

export const getTicketDetail = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const detail = await getTicketDetailForUser(id, req.user);
    if (!detail) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    const auth = getAuthMeta(req);
    logTicketInfo({
      action: "ticket_detail",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: id,
      meta: {
        estado: detail.ticket.estado,
        firstResponseStatus: detail.ticket.firstResponseStatus,
        resolutionStatus: detail.ticket.resolutionStatus,
      },
    });

    return res.json({ ok: true, data: detail });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "ticket_detail",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: Number(req.params.id),
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const replyTicketStub = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID invalido" });
    }

    const { body } = req.body as { body?: string };
    if (!body || !body.trim()) {
      return res
        .status(400)
        .json({ ok: false, error: "Respuesta vacia" });
    }

    const safeBody = body.trim();
    const bodyHtml = escapeHtml(safeBody).replace(/\r?\n/g, "<br />");

    const result = await createTicketMessageForUser({
      id,
      user: req.user,
      payload: {
        type: TicketMessageType.PUBLIC_REPLY,
        bodyHtml,
      },
    });
    if (!result) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    const created = result.message;

    const auth = getAuthMeta(req);
    logTicketInfo({
      action: "ticket_message_create",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: id,
      meta: {
        type: TicketMessageType.PUBLIC_REPLY,
        toEmail: created.toEmail ?? null,
        bodyHtmlLength: bodyHtml.length,
        emailStatus: result.emailStatus,
      },
    });

    return res.status(201).json({
      ok: true,
      data: created,
      emailStatus: result.emailStatus,
      emailError: result.emailError,
      message: "Respuesta registrada",
    });
  } catch (err) {
    if (err instanceof TicketMessagesNotReadyError) {
      return res.status(503).json({
        ok: false,
        error:
          "Mensajeria no disponible. Ejecuta la migracion de TicketMessage.",
      });
    }
    const auth = getAuthMeta(req);
    logTicketError({
      action: "ticket_message_create",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: Number(req.params.id),
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const listTicketMessages = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID invalido" });
    }

    const data = await getTicketMessagesForUser(id, req.user);
    if (!data) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    const auth = getAuthMeta(req);
    logTicketInfo({
      action: "ticket_messages_list",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: id,
      meta: { count: data.length },
    });

    return res.json({ ok: true, data });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "ticket_messages_list",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: Number(req.params.id),
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const createTicketMessage = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID invalido" });
    }

    const { type, toEmail, cc, bcc, subject, bodyHtml } = req.body as {
      type?: string;
      toEmail?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      bodyHtml?: string;
    };

    const resolvedType = coerceMessageType(type || "");
    if (!resolvedType) {
      return res.status(400).json({ ok: false, error: "Tipo invalido" });
    }

    if (!bodyHtml || !bodyHtml.trim()) {
      return res.status(400).json({ ok: false, error: "Mensaje vacio" });
    }
    if (!plainTextFromHtml(bodyHtml).length) {
      return res
        .status(400)
        .json({ ok: false, error: "Mensaje vacio o sin contenido util" });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const result = await createTicketMessageForUser({
      id,
      user: req.user,
      payload: {
        type: resolvedType,
        toEmail,
        cc,
        bcc,
        subject,
        bodyHtml: bodyHtml.trim(),
      },
      attachments: files.map((file) => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
      })),
    });

    if (!result) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    const created = result.message;

    const auth = getAuthMeta(req);
    logTicketInfo({
      action: "ticket_message_create",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: id,
      meta: {
        type: resolvedType,
        toEmail: created.toEmail ?? null,
        cc: created.cc ?? null,
        bcc: created.bcc ?? null,
        bodyHtmlLength: bodyHtml.trim().length,
        attachments: files.length,
        emailStatus: result.emailStatus,
      },
    });

    const mensajePorEstado: Record<typeof result.emailStatus, string> = {
      SENT: "Mensaje enviado",
      SKIPPED: "Nota interna guardada (no se envia correo)",
      FAILED: "Mensaje guardado, pero fallo el envio del correo",
    };

    return res.status(201).json({
      ok: true,
      data: created,
      message: mensajePorEstado[result.emailStatus],
      emailStatus: result.emailStatus,
      emailError: result.emailError,
    });
  } catch (err) {
    if (err instanceof TicketMessagesNotReadyError) {
      return res.status(503).json({
        ok: false,
        error:
          "Mensajeria no disponible. Ejecuta la migracion de TicketMessage.",
      });
    }
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("mensaje vacio")
    ) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const auth = getAuthMeta(req);
    logTicketError({
      action: "ticket_message_create",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: Number(req.params.id),
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

/** POST /api/tickets — crea un ticket manual. */
export const createTicket = async (req: Request, res: Response) => {
  const auth = getAuthMeta(req);
  try {
    const row = await createTicketForUser({
      user: req.user,
      payload: req.body ?? {},
      requestId: req.requestId,
    });

    if (!row) {
      return res.status(403).json({ ok: false, error: "Sin permisos" });
    }

    return res.status(201).json({ ok: true, data: row });
  } catch (err) {
    // Errores de validacion vuelven como 400, no como 500.
    const message = err instanceof Error ? err.message : "Error interno";
    const isValidation =
      message.includes("obligatori") || message.includes("invalid");

    logTicketError({
      action: "tickets_create",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      error: err,
    });

    return res
      .status(isValidation ? 400 : 500)
      .json({ ok: false, error: isValidation ? message : "Error interno" });
  }
};

/** GET /api/tickets/:id/events — historial de auditoria del ticket. */
export const listTicketEvents = async (req: Request, res: Response) => {
  const auth = getAuthMeta(req);
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID invalido" });
    }

    const data = await getTicketEventsForUser(id, req.user);
    if (!data) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    logTicketInfo({
      action: "ticket_events_list",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: id,
      meta: { count: data.length },
    });

    return res.json({ ok: true, data });
  } catch (err) {
    logTicketError({
      action: "ticket_events_list",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: Number(req.params.id),
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

export const updateTicket = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID invalido" });
    }

    const {
      status,
      priority,
      estado,
      prioridad,
      categoria,
      trabajadorId,
      tags,
      areaDetected,
      clienteId,
    } = req.body as {
      status?: string;
      priority?: string | number | null;
      estado?: string;
      prioridad?: string | number | null;
      categoria?: string | null;
      trabajadorId?: number | null;
      tags?: string[] | string | null;
      areaDetected?: string | null;
      clienteId?: number | null;
    };

    const changes: Record<string, unknown> = {};
    const normalizedEstado = estado ?? status;
    const normalizedPrioridad = prioridad ?? priority;

    if (normalizedEstado !== undefined) changes.estado = normalizedEstado;
    if (normalizedPrioridad !== undefined) changes.prioridad = normalizedPrioridad;
    if (categoria !== undefined) changes.categoria = categoria;
    if (trabajadorId !== undefined) changes.trabajadorId = trabajadorId;
    if (tags !== undefined) changes.tags = tags;
    if (areaDetected !== undefined) changes.areaDetected = areaDetected;
    if (clienteId !== undefined) changes.clienteId = clienteId;

    const auth = getAuthMeta(req);
    if (Object.keys(changes).length === 0) {
      logTicketWarn({
        action: "ticket_update",
        requestId: auth.requestId,
        userId: auth.userId,
        role: auth.role,
        ticketId: id,
        meta: { warning: "empty_changes" },
      });
      return res
        .status(400)
        .json({ ok: false, error: "No hay cambios para actualizar" });
    }

    const updated = await updateTicketForUser({
      id,
      user: req.user,
      estado: normalizedEstado,
      prioridad: normalizedPrioridad,
      categoria,
      trabajadorId,
      tags,
      areaDetected,
      clienteId,
    });

    if (!updated) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    logTicketInfo({
      action: "ticket_update",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: id,
      meta: { changes },
    });

    return res.json({ ok: true, data: updated });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "ticket_update",
      requestId: auth.requestId,
      userId: auth.userId,
      role: auth.role,
      ticketId: Number(req.params.id),
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};
