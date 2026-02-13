import type { Request, Response } from "express";
import { TicketMessageType } from "@prisma/client";
import {
  getTicketAgentsForUser,
  getInboxDiagnosticForAdmin,
  getInboxForUser,
  getGroupsForUser,
  getTicketDetailForUser,
  getTicketMessagesForUser,
  getTicketsForUser,
  createTicketMessageForUser,
  coerceMessageType,
  TicketMessagesNotReadyError,
  updateTicketForUser,
} from "./tickets.service";
import { isAdmin } from "./access/ticketAccess";
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
    const data = await getGroupsForUser({
      user: req.user,
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

export const listTickets = async (req: Request, res: Response) => {
  try {
    const { area, q, status, priority, estado, prioridad } = req.query as {
      area?: string;
      q?: string;
      status?: string;
      priority?: string;
      estado?: string;
      prioridad?: string;
    };

    const data = await getTicketsForUser({
      user: req.user,
      area,
      q,
      status: status ?? estado,
      priority: priority ?? prioridad,
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

export const listTicketsInbox = async (req: Request, res: Response) => {
  try {
    const {
      area,
      q,
      status,
      priority,
      estado,
      prioridad,
    } = req.query as {
      area?: string;
      q?: string;
      status?: string;
      priority?: string;
      estado?: string;
      prioridad?: string;
    };

    const limitRaw = Number(req.query.limit);
    const limit = Number.isNaN(limitRaw)
      ? 20
      : Math.min(Math.max(limitRaw, 1), 100);

    const data = await getInboxForUser({
      user: req.user,
      area,
      q,
      status: status ?? estado,
      priority: priority ?? prioridad,
      limit,
      requestId: req.requestId,
    });

    return res.json({ ok: true, data });
  } catch (err) {
    const auth = getAuthMeta(req);
    logTicketError({
      action: "tickets_inbox",
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

export const syncTickets = async (req: Request, res: Response) => {
  try {
    return res.json({
      ok: true,
      message: "Sincronizacion interna completada",
    });
  } catch (err) {
    console.error("syncTickets error:", err);
    return res.status(500).json({ ok: false, error: "Error interno" });
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
        threadMessages: detail.messages.length,
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

    const created = await createTicketMessageForUser({
      id,
      user: req.user,
      payload: {
        type: TicketMessageType.PUBLIC_REPLY,
        bodyHtml,
      },
    });
    if (!created) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

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
      },
    });

    return res.status(201).json({
      ok: true,
      data: created,
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

    const created = await createTicketMessageForUser({
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
    });

    if (!created) {
      return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    }

    const emailConfigured = Boolean(
      process.env.SMTP_HOST || process.env.SENDGRID_API_KEY
    );

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
      },
    });

    return res.status(201).json({
      ok: true,
      data: created,
      message: emailConfigured
        ? "Envio pendiente de integracion"
        : "Mensaje guardado (envio pendiente)",
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

export const updateTicket = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ ok: false, error: "ID invalido" });
    }

    const { status, priority, estado, prioridad, categoria, trabajadorId } =
      req.body as {
      status?: string;
      priority?: string | number | null;
      estado?: string;
      prioridad?: string | number | null;
      categoria?: string | null;
      trabajadorId?: number | null;
    };

    const changes: Record<string, unknown> = {};
    const normalizedEstado = estado ?? status;
    const normalizedPrioridad = prioridad ?? priority;

    if (normalizedEstado !== undefined) changes.estado = normalizedEstado;
    if (normalizedPrioridad !== undefined) changes.prioridad = normalizedPrioridad;
    if (categoria !== undefined) changes.categoria = categoria;
    if (trabajadorId !== undefined) changes.trabajadorId = trabajadorId;

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
