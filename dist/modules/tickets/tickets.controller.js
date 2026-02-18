"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTicket = exports.createTicketMessage = exports.listTicketMessages = exports.replyTicketStub = exports.getTicketDetail = exports.syncTickets = exports.diagnosticTicketsInbox = exports.listTicketAgents = exports.listTicketsInbox = exports.listTickets = exports.listTicketGroups = void 0;
const client_1 = require("@prisma/client");
const tickets_service_1 = require("./tickets.service");
const ticketAccess_1 = require("./access/ticketAccess");
const tickets_logger_1 = require("./tickets.logger");
function escapeHtml(input) {
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function plainTextFromHtml(html) {
    return String(html)
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/\s*p\s*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function getAuthMeta(req) {
    return {
        requestId: req.requestId ?? null,
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
    };
}
const listTicketGroups = async (req, res) => {
    try {
        const data = await (0, tickets_service_1.getGroupsForUser)({
            user: req.user,
            requestId: req.requestId,
        });
        return res.json({ ok: true, data });
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
            action: "tickets_groups",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            error: err,
        });
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.listTicketGroups = listTicketGroups;
const listTickets = async (req, res) => {
    try {
        const { area, q, status, priority, estado, prioridad } = req.query;
        const data = await (0, tickets_service_1.getTicketsForUser)({
            user: req.user,
            area,
            q,
            status: status ?? estado,
            priority: priority ?? prioridad,
            requestId: req.requestId,
        });
        return res.json({ ok: true, data });
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
            action: "tickets_list",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            error: err,
        });
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.listTickets = listTickets;
const listTicketsInbox = async (req, res) => {
    try {
        const { area, q, status, priority, estado, prioridad, } = req.query;
        const limitRaw = Number(req.query.limit);
        const limit = Number.isNaN(limitRaw)
            ? 20
            : Math.min(Math.max(limitRaw, 1), 100);
        const data = await (0, tickets_service_1.getInboxForUser)({
            user: req.user,
            area,
            q,
            status: status ?? estado,
            priority: priority ?? prioridad,
            limit,
            requestId: req.requestId,
        });
        return res.json({ ok: true, data });
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
            action: "tickets_inbox",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            error: err,
        });
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.listTicketsInbox = listTicketsInbox;
const listTicketAgents = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        if (!["ADMIN", "SUPERVISOR", "AGENTE"].includes(req.user.role)) {
            return res.status(403).json({ ok: false, error: "Sin permisos" });
        }
        const data = await (0, tickets_service_1.getTicketAgentsForUser)({
            user: req.user,
            requestId: req.requestId,
        });
        return res.json({ ok: true, data });
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
            action: "tickets_agents_list",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            error: err,
        });
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.listTicketAgents = listTicketAgents;
const diagnosticTicketsInbox = async (req, res) => {
    try {
        if (!(0, ticketAccess_1.isAdmin)(req.user)) {
            return res.status(403).json({ ok: false, error: "Sin permisos" });
        }
        const limitRaw = Number(req.query.limit);
        const limit = Number.isNaN(limitRaw) ? 20 : Math.min(Math.max(limitRaw, 1), 100);
        const data = await (0, tickets_service_1.getInboxDiagnosticForAdmin)({
            user: req.user,
            limit,
        });
        return res.json({ ok: true, data });
    }
    catch (err) {
        console.error("diagnosticTicketsInbox error:", err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.diagnosticTicketsInbox = diagnosticTicketsInbox;
const syncTickets = async (req, res) => {
    try {
        return res.json({
            ok: true,
            message: "Sincronizacion interna completada",
        });
    }
    catch (err) {
        console.error("syncTickets error:", err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.syncTickets = syncTickets;
const getTicketDetail = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ ok: false, error: "ID inválido" });
        }
        const detail = await (0, tickets_service_1.getTicketDetailForUser)(id, req.user);
        if (!detail) {
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        }
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketInfo)({
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
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
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
exports.getTicketDetail = getTicketDetail;
const replyTicketStub = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ ok: false, error: "ID invalido" });
        }
        const { body } = req.body;
        if (!body || !body.trim()) {
            return res
                .status(400)
                .json({ ok: false, error: "Respuesta vacia" });
        }
        const safeBody = body.trim();
        const bodyHtml = escapeHtml(safeBody).replace(/\r?\n/g, "<br />");
        const created = await (0, tickets_service_1.createTicketMessageForUser)({
            id,
            user: req.user,
            payload: {
                type: client_1.TicketMessageType.PUBLIC_REPLY,
                bodyHtml,
            },
        });
        if (!created) {
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        }
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketInfo)({
            action: "ticket_message_create",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            ticketId: id,
            meta: {
                type: client_1.TicketMessageType.PUBLIC_REPLY,
                toEmail: created.toEmail ?? null,
                bodyHtmlLength: bodyHtml.length,
            },
        });
        return res.status(201).json({
            ok: true,
            data: created,
            message: "Respuesta registrada",
        });
    }
    catch (err) {
        if (err instanceof tickets_service_1.TicketMessagesNotReadyError) {
            return res.status(503).json({
                ok: false,
                error: "Mensajeria no disponible. Ejecuta la migracion de TicketMessage.",
            });
        }
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
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
exports.replyTicketStub = replyTicketStub;
const listTicketMessages = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ ok: false, error: "ID invalido" });
        }
        const data = await (0, tickets_service_1.getTicketMessagesForUser)(id, req.user);
        if (!data) {
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        }
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketInfo)({
            action: "ticket_messages_list",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            ticketId: id,
            meta: { count: data.length },
        });
        return res.json({ ok: true, data });
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
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
exports.listTicketMessages = listTicketMessages;
const createTicketMessage = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ ok: false, error: "ID invalido" });
        }
        const { type, toEmail, cc, bcc, subject, bodyHtml } = req.body;
        const resolvedType = (0, tickets_service_1.coerceMessageType)(type || "");
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
        const created = await (0, tickets_service_1.createTicketMessageForUser)({
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
        const emailConfigured = Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY);
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketInfo)({
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
    }
    catch (err) {
        if (err instanceof tickets_service_1.TicketMessagesNotReadyError) {
            return res.status(503).json({
                ok: false,
                error: "Mensajeria no disponible. Ejecuta la migracion de TicketMessage.",
            });
        }
        if (err instanceof Error &&
            err.message.toLowerCase().includes("mensaje vacio")) {
            return res.status(400).json({ ok: false, error: err.message });
        }
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
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
exports.createTicketMessage = createTicketMessage;
const updateTicket = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ ok: false, error: "ID invalido" });
        }
        const { status, priority, estado, prioridad, categoria, trabajadorId } = req.body;
        const changes = {};
        const normalizedEstado = estado ?? status;
        const normalizedPrioridad = prioridad ?? priority;
        if (normalizedEstado !== undefined)
            changes.estado = normalizedEstado;
        if (normalizedPrioridad !== undefined)
            changes.prioridad = normalizedPrioridad;
        if (categoria !== undefined)
            changes.categoria = categoria;
        if (trabajadorId !== undefined)
            changes.trabajadorId = trabajadorId;
        const auth = getAuthMeta(req);
        if (Object.keys(changes).length === 0) {
            (0, tickets_logger_1.logTicketWarn)({
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
        const updated = await (0, tickets_service_1.updateTicketForUser)({
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
        (0, tickets_logger_1.logTicketInfo)({
            action: "ticket_update",
            requestId: auth.requestId,
            userId: auth.userId,
            role: auth.role,
            ticketId: id,
            meta: { changes },
        });
        return res.json({ ok: true, data: updated });
    }
    catch (err) {
        const auth = getAuthMeta(req);
        (0, tickets_logger_1.logTicketError)({
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
exports.updateTicket = updateTicket;
