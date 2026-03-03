"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyTicketByEmail = exports.createEmailTicket = exports.syncTickets = exports.getInboxDiagnostic = exports.getTicketEvents = exports.createTicketMessage = exports.updateTicket = exports.getTicketAgents = exports.getTicketMessages = exports.getTicketById = exports.listTickets = exports.getGroups = void 0;
const prisma_1 = require("../lib/prisma");
const gmailDelegated_service_1 = require("../services/gmailDelegated.service");
/* =======================================================================================
   Helpers (NO rompen prod: solo utilitarios y validaciones)
======================================================================================= */
const MAX_DESC = 5000;
function parseId(raw) {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function safeStr(v) {
    return String(v ?? "").trim();
}
function isEmailLike(input) {
    const s = String(input ?? "").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function normalizarListaCorreos(raw) {
    if (!raw)
        return [];
    const vistos = new Set();
    const lista = [];
    raw
        .split(/[;,]/g)
        .map((x) => x.trim().toLowerCase())
        .forEach((email) => {
        if (!email || vistos.has(email))
            return;
        vistos.add(email);
        lista.push(email);
    });
    return lista;
}
function extractFirstEmail(input) {
    if (!input)
        return null;
    const first = input.split(",")[0]?.trim();
    if (!first)
        return null;
    const match = first.match(/<([^>]+)>/);
    if (match?.[1])
        return match[1].trim();
    return first.includes("@") ? first : null;
}
function buildAuthorName(req, fallbackEmail) {
    const fullName = req.user?.nombre ||
        req.user?.full_name ||
        req.user?.name;
    return fullName && String(fullName).trim() ? String(fullName).trim() : fallbackEmail;
}
function withSignature(body, authorName) {
    const cleanBody = String(body ?? "").trim();
    const signature = `\n\n--\n${authorName}\nSoporte Cintax`;
    return cleanBody ? cleanBody + signature : signature;
}
function getActor(req) {
    const actorEmail = req.user?.email;
    const actorIdRaw = req.user?.id_trabajador ?? req.user?.id ?? null;
    const actorId = actorIdRaw != null ? Number(actorIdRaw) : null;
    const actorArea = (req.user?.areaInterna ?? null);
    // OJO: tu auth define admin/soporte en frontend; aquí dejamos un flag básico.
    // Si tu middleware pone rol/permisos, ajusta esta línea.
    const isAdmin = Boolean(req.user?.isAdmin) || false;
    return { actorEmail, actorIdRaw, actorId, actorArea, isAdmin };
}
/** Mantén compatibilidad: DB guarda strings, UI manda ABIERTO/PENDIENTE/RESUELTO/CERRADO */
function estadoToDb(raw) {
    const s = String(raw ?? "").trim().toUpperCase();
    if (s === "ABIERTO" || s === "OPEN")
        return "ABIERTO";
    if (s === "PENDIENTE" || s.includes("PEND"))
        return "PENDIENTE";
    if (s === "RESUELTO" || s === "RESOLVED")
        return "RESUELTO";
    if (s === "CERRADO" || s === "CLOSED")
        return "CERRADO";
    // compat prod antiguo
    if (s === "OPEN")
        return "ABIERTO";
    if (s === "CLOSED")
        return "CERRADO";
    return s || "ABIERTO";
}
function areaSlugFromDb(area) {
    switch (area) {
        case "CONTA":
            return "contabilidad";
        case "TRIBUTARIO":
            return "tributaria";
        case "RRHH":
            return "recursos-humanos";
        case "ADMIN":
            return "administracion";
        default:
            return "sin-asignar";
    }
}
function areaDbFromSlug(slug) {
    const s = String(slug ?? "").trim().toLowerCase();
    if (s === "contabilidad")
        return "CONTA";
    if (s === "tributaria")
        return "TRIBUTARIO";
    if (s === "recursos-humanos" || s === "rrhh")
        return "RRHH";
    if (s === "administracion" || s === "admin")
        return "ADMIN";
    if (s === "sin-asignar" || s === "sin_clasificar" || s === "sin-clasificar")
        return null;
    return null;
}
/* =======================================================================================
   Groups / Tabs (TicketsTabs)
======================================================================================= */
const getGroups = async (_req, res) => {
    try {
        const totalAll = await prisma_1.prisma.ticket.count();
        // conteos por área asignada
        const byArea = await prisma_1.prisma.ticket.groupBy({
            by: ["areaAsignada"],
            _count: { _all: true },
        });
        const countMap = {};
        for (const row of byArea) {
            const slug = areaSlugFromDb(row.areaAsignada ?? null);
            countMap[slug] = Number(row._count?._all ?? 0);
        }
        const groups = [
            { slug: "all", label: "Todos", total: totalAll },
            // "mine" se calcula en front con filtros (o lo hacemos en listTickets si viene vista=mine)
            { slug: "mine", label: "Mis tickets", total: 0 },
            { slug: "contabilidad", label: "Contabilidad", total: countMap["contabilidad"] ?? 0 },
            { slug: "tributaria", label: "Tributaria", total: countMap["tributaria"] ?? 0 },
            { slug: "recursos-humanos", label: "RRHH", total: countMap["recursos-humanos"] ?? 0 },
            { slug: "administracion", label: "Administración", total: countMap["administracion"] ?? 0 },
            { slug: "sin-asignar", label: "Sin asignar", total: countMap["sin-asignar"] ?? 0 },
        ];
        return res.json({ ok: true, data: { groups, totalAll } });
    }
    catch (err) {
        console.error("getGroups error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.getGroups = getGroups;
/* =======================================================================================
   Listado (TicketsTable + filtros)
   Nota: no conocemos exacto tu useTickets; dejamos filtros compatibles y no estrictos.
======================================================================================= */
const listTickets = async (req, res) => {
    try {
        const { actorId } = getActor(req);
        // query params típicos (compat)
        const area = safeStr(req.query.area ?? req.query.group ?? "");
        const vista = safeStr(req.query.vista ?? req.query.view ?? "all"); // "all" | "mine"
        const status = safeStr(req.query.status ?? req.query.estado ?? "");
        const q = safeStr(req.query.q ?? req.query.search ?? "");
        const requesterEmail = safeStr(req.query.requesterEmail ?? "");
        const page = Math.max(Number(req.query.page ?? 1), 1);
        const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? 25), 1), 100);
        const skip = (page - 1) * pageSize;
        const where = {};
        // area/group
        if (area && area !== "all" && area !== "mine") {
            where.areaAsignada = areaDbFromSlug(area);
        }
        // vista mine
        if (vista === "mine" || area === "mine") {
            if (actorId)
                where.trabajadorId = actorId;
            else
                where.trabajadorId = -999999; // fuerza vacío si no hay actorId
        }
        // status
        if (status && status !== "--" && status !== "all") {
            where.estado = estadoToDb(status);
        }
        // requester
        if (requesterEmail) {
            where.requesterEmail = { contains: requesterEmail, mode: "insensitive" };
        }
        // search
        if (q) {
            where.OR = [
                { subject: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { requesterEmail: { contains: q, mode: "insensitive" } },
            ];
        }
        const [total, rows] = await Promise.all([
            prisma_1.prisma.ticket.count({ where }),
            prisma_1.prisma.ticket.findMany({
                where,
                orderBy: { updatedAt: "desc" },
                skip,
                take: pageSize,
            }),
        ]);
        const tickets = rows.map((t) => ({
            id: t.id_ticket,
            number: t.id_ticket,
            subject: t.subject,
            status: t.estado,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
            requesterEmail: t.requesterEmail,
            group: areaSlugFromDb(t.areaAsignada ?? null),
            trabajadorId: t.trabajadorId ?? null,
            prioridad: t.prioridad ?? null,
            categoria: t.categoria,
            source: String(t.source),
        }));
        // total mine para groups "mine" (opcional)
        let totalMine = 0;
        if (actorId) {
            totalMine = await prisma_1.prisma.ticket.count({ where: { trabajadorId: actorId } });
        }
        return res.json({
            ok: true,
            data: tickets,
            total,
            meta: { page, pageSize, totalMine },
        });
    }
    catch (err) {
        console.error("listTickets error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.listTickets = listTickets;
/* =======================================================================================
   Detalle (TicketDetailPage)
======================================================================================= */
const getTicketById = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ ok: false, error: "id inválido" });
        const ticket = await prisma_1.prisma.ticket.findUnique({
            where: { id_ticket: id },
        });
        if (!ticket)
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        // Campos SLA no existen en schema actual: devolvemos placeholders para no romper UI
        const now = new Date();
        const due1 = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        const due2 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return res.json({
            ok: true,
            data: {
                ticket: {
                    id: ticket.id_ticket,
                    number: ticket.id_ticket,
                    subject: ticket.subject,
                    description: ticket.description,
                    requesterEmail: ticket.requesterEmail,
                    group: areaSlugFromDb(ticket.areaAsignada ?? null),
                    areaAsignada: ticket.areaAsignada,
                    categoria: ticket.categoria,
                    estado: ticket.estado,
                    status: ticket.estado,
                    prioridad: ticket.prioridad,
                    priority: ticket.prioridad,
                    trabajadorId: ticket.trabajadorId,
                    createdAt: ticket.createdAt.toISOString(),
                    updatedAt: ticket.updatedAt.toISOString(),
                    source: ticket.source,
                    // placeholders esperados por tu UI
                    tags: [],
                    areaDetected: "SIN_CLASIFICAR",
                    firstResponseStatus: "OK",
                    firstResponseDueAt: due1.toISOString(),
                    resolutionStatus: "OK",
                    resolutionDueAt: due2.toISOString(),
                },
            },
        });
    }
    catch (err) {
        console.error("getTicketById error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.getTicketById = getTicketById;
/* =======================================================================================
   Thread / Messages
======================================================================================= */
const getTicketMessages = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ ok: false, error: "id inválido" });
        const msgs = await prisma_1.prisma.ticketMessage.findMany({
            where: { ticketId: id },
            orderBy: { createdAt: "asc" },
            include: {
                author: true,
                attachments: true,
            },
        });
        // Shape compatible con tu front (TicketThreadMessage)
        const data = msgs.map((m) => ({
            id: m.id,
            ticketId: m.ticketId,
            type: m.type,
            direction: m.direction,
            isInbound: m.direction === "INBOUND",
            createdAt: m.createdAt.toISOString(),
            subject: m.subject ?? null,
            bodyHtml: m.bodyHtml,
            bodyText: m.bodyText ?? null,
            toEmail: m.toEmail ?? null,
            cc: m.cc ?? null,
            bcc: m.bcc ?? null,
            fromEmail: null, // no existe en schema
            author: m.author
                ? { id_trabajador: m.author.id_trabajador, nombre: m.author.nombre, email: m.author.email }
                : null,
            attachments: (m.attachments ?? []).map((a) => ({
                id: a.id,
                filename: a.filename,
                mimeType: a.mimeType,
                size: a.size,
                url: a.url,
            })),
        }));
        return res.json({ ok: true, data });
    }
    catch (err) {
        console.error("getTicketMessages error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.getTicketMessages = getTicketMessages;
/* =======================================================================================
   Agents (para reasignación / filtros)
======================================================================================= */
const getTicketAgents = async (_req, res) => {
    try {
        const agentes = await prisma_1.prisma.trabajador.findMany({
            where: { status: true },
            orderBy: { nombre: "asc" },
            select: { id_trabajador: true, nombre: true, email: true, areaInterna: true, status: true },
        });
        return res.json({ ok: true, data: agentes });
    }
    catch (err) {
        console.error("getTicketAgents error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.getTicketAgents = getTicketAgents;
const updateTicket = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ ok: false, error: "id inválido" });
        const { actorId, actorArea, isAdmin } = getActor(req);
        if (!actorId)
            return res.status(401).json({ ok: false, error: "No autenticado" });
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id_ticket: id } });
        if (!ticket)
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        const isAssigned = ticket.trabajadorId && Number(ticket.trabajadorId) === actorId;
        const puedeGestionar = isAdmin || isAssigned;
        const payload = req.body;
        const data = {};
        if (payload.estado !== undefined) {
            if (!puedeGestionar)
                return res.status(403).json({ ok: false, error: "Sin permisos para cambiar estado" });
            data.estado = estadoToDb(payload.estado);
        }
        if (payload.prioridad !== undefined) {
            if (!puedeGestionar)
                return res.status(403).json({ ok: false, error: "Sin permisos para cambiar prioridad" });
            data.prioridad = payload.prioridad;
        }
        if (payload.categoria !== undefined) {
            if (!isAdmin)
                return res.status(403).json({ ok: false, error: "Solo admin puede editar categoria" });
            data.categoria = payload.categoria ?? ticket.categoria;
        }
        if (payload.trabajadorId !== undefined) {
            if (!isAdmin)
                return res.status(403).json({ ok: false, error: "Solo admin puede reasignar" });
            data.trabajadorId = payload.trabajadorId;
        }
        // si mandan areaAsignada explícita (no viene en tu front actual, pero lo soportamos)
        if (payload.areaAsignada !== undefined) {
            if (!isAdmin)
                return res.status(403).json({ ok: false, error: "Solo admin puede reasignar área" });
            data.areaAsignada = payload.areaAsignada;
        }
        // Auto-asignación por área del actor si el ticket no tiene área
        if (!ticket.areaAsignada && actorArea) {
            data.areaAsignada = actorArea;
        }
        // Nada que actualizar
        if (Object.keys(data).length === 0) {
            return res.json({ ok: true, data: { ticket } });
        }
        const updated = await prisma_1.prisma.ticket.update({
            where: { id_ticket: id },
            data,
        });
        return res.json({ ok: true, data: { ticket: updated } });
    }
    catch (err) {
        console.error("updateTicket error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.updateTicket = updateTicket;
const createTicketMessage = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ ok: false, error: "id inválido" });
        const { actorEmail, actorId } = getActor(req);
        if (!actorEmail || !actorId)
            return res.status(401).json({ ok: false, error: "No autenticado" });
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id_ticket: id } });
        if (!ticket)
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        const type = safeStr(req.body.type);
        const bodyHtml = safeStr(req.body.bodyHtml);
        const bodyTextFallback = safeStr(req.body.bodyText);
        const toEmailRaw = safeStr(req.body.toEmail);
        const ccRaw = safeStr(req.body.cc);
        const bccRaw = safeStr(req.body.bcc);
        const subjectRaw = safeStr(req.body.subject);
        if (!["PUBLIC_REPLY", "INTERNAL_NOTE", "FORWARD"].includes(type)) {
            return res.status(400).json({ ok: false, error: "type inválido" });
        }
        const files = req.files ?? [];
        // Regla mínima: si no hay html, permitir si hay adjuntos o bodyText
        const effectiveBodyHtml = bodyHtml || (bodyTextFallback ? `<p>${bodyTextFallback}</p>` : "");
        if (!effectiveBodyHtml.trim() && files.length === 0) {
            return res.status(400).json({ ok: false, error: "bodyHtml vacío (o adjunta un archivo)" });
        }
        // Guardar mensaje SIEMPRE
        const created = await prisma_1.prisma.ticketMessage.create({
            data: {
                ticketId: id,
                authorTrabajadorId: actorId,
                type,
                direction: "OUTBOUND",
                subject: type === "FORWARD" ? (subjectRaw || null) : (ticket.subject || null),
                bodyHtml: effectiveBodyHtml || "<p></p>",
                bodyText: bodyTextFallback || null,
                toEmail: type === "INTERNAL_NOTE" ? null : (toEmailRaw || null),
                cc: ccRaw || null,
                bcc: bccRaw || null,
            },
        });
        // Guardar adjuntos en DB (placeholder url email:// para no romper UI)
        if (files.length > 0) {
            await prisma_1.prisma.ticketAttachment.createMany({
                data: files.map((f) => ({
                    messageId: created.id,
                    filename: f.originalname,
                    mimeType: f.mimetype,
                    size: f.size,
                    url: `email://${encodeURIComponent(f.originalname)}`,
                })),
            });
        }
        // Nota interna: no envía email
        if (type === "INTERNAL_NOTE") {
            const full = await prisma_1.prisma.ticketMessage.findUnique({
                where: { id: created.id },
                include: { author: true, attachments: true },
            });
            return res.status(201).json({
                ok: true,
                data: full,
                emailStatus: "SKIPPED",
                messageSaved: true,
            });
        }
        // Enviar por Gmail
        const mailbox = process.env.TICKETS_MAILBOX;
        if (!mailbox) {
            return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
        }
        const authorName = buildAuthorName(req, actorEmail);
        const fromName = `Soporte Cintax — ${authorName}`;
        const toList = normalizarListaCorreos(type === "PUBLIC_REPLY" ? (ticket.requesterEmail || toEmailRaw) : toEmailRaw);
        if (toList.length === 0 || toList.some((e) => !isEmailLike(e))) {
            return res.status(400).json({ ok: false, error: "Destinatario inválido" });
        }
        if (type === "FORWARD" && !subjectRaw.trim()) {
            return res.status(400).json({ ok: false, error: "subject es obligatorio en FORWARD" });
        }
        const subject = type === "FORWARD"
            ? subjectRaw.trim()
            : ticket.subject?.startsWith("Re:")
                ? ticket.subject
                : `Re: ${ticket.subject}`;
        const bodyToSend = withSignature(bodyTextFallback || effectiveBodyHtml, authorName);
        let emailStatus = "SENT";
        let emailError = null;
        try {
            const attachments = files.map((f) => ({
                filename: f.originalname,
                mimeType: f.mimetype,
                content: f.buffer,
            }));
            const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
                fromUserEmail: mailbox,
                fromName,
                to: toList.join(", "),
                cc: ccRaw || actorEmail, // mantiene tu comportamiento: copia al actor si no viene cc
                bcc: bccRaw || undefined,
                subject,
                bodyText: bodyToSend,
                attachments,
                replyTo: mailbox,
                threadId: ticket.gmailThreadId ?? undefined,
            });
            const gmailMessageId = sendRes?.id ?? null;
            const threadId = sendRes?.threadId ?? null;
            if (threadId && !ticket.gmailThreadId) {
                await prisma_1.prisma.ticket.update({ where: { id_ticket: id }, data: { gmailThreadId: threadId } });
            }
            await prisma_1.prisma.ticketMessage.update({
                where: { id: created.id },
                data: { gmailMessageId, subject },
            });
            // headers opcionales (si luego agregas columnas)
            try {
                if (gmailMessageId) {
                    const rawMsg = await (0, gmailDelegated_service_1.getMessageAsUser)(mailbox, gmailMessageId);
                    const parsed = (0, gmailDelegated_service_1.parseGmailMessage)(rawMsg);
                    void parsed;
                }
            }
            catch { }
            const full = await prisma_1.prisma.ticketMessage.findUnique({
                where: { id: created.id },
                include: { author: true, attachments: true },
            });
            return res.status(201).json({
                ok: true,
                data: full,
                emailStatus: "SENT",
                messageSaved: true,
            });
        }
        catch (err) {
            console.error("createTicketMessage send error:", err);
            emailStatus = "FAILED";
            emailError = err?.message ?? "Error enviando correo";
            const full = await prisma_1.prisma.ticketMessage.findUnique({
                where: { id: created.id },
                include: { author: true, attachments: true },
            });
            return res.status(201).json({
                ok: true,
                data: full,
                emailStatus,
                emailError,
                messageSaved: true,
            });
        }
    }
    catch (err) {
        console.error("createTicketMessage error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.createTicketMessage = createTicketMessage;
/* =======================================================================================
   Eventos
   Tu schema actual NO tiene TicketEvent, así que este endpoint devuelve [] para no romper.
   (Después, si quieres eventos reales, ahí sí añadimos modelo + migración controlada.)
======================================================================================= */
const getTicketEvents = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id)
            return res.status(400).json({ ok: false, error: "id inválido" });
        return res.json({ ok: true, data: [] });
    }
    catch (err) {
        console.error("getTicketEvents error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.getTicketEvents = getTicketEvents;
/* =======================================================================================
   Admin tools (diagnóstico + sync)
   Todavía no los implementamos: devolvemos 501 pero existen para que TS no falle y no caiga app.
======================================================================================= */
const getInboxDiagnostic = async (_req, res) => {
    return res.status(501).json({ ok: false, error: "Endpoint no implementado: getInboxDiagnostic" });
};
exports.getInboxDiagnostic = getInboxDiagnostic;
const syncTickets = async (_req, res) => {
    return res.status(501).json({ ok: false, error: "Endpoint no implementado: syncTickets" });
};
exports.syncTickets = syncTickets;
/* =======================================================================================
   Email endpoints (TU implementación actual)
   - Las dejo completas aquí (tal cual las tenías) para que el controller quede “completo”.
======================================================================================= */
const createEmailTicket = async (req, res) => {
    try {
        const { to, subject, bodyText, categoria } = req.body;
        if (!to || !subject || !bodyText) {
            return res.status(400).json({
                ok: false,
                error: "to, subject y bodyText son obligatorios",
            });
        }
        const actorEmail = req.user?.email;
        const actorIdRaw = req.user?.id_trabajador ?? req.user?.id ?? null;
        if (!actorEmail || !actorIdRaw) {
            return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const actorId = Number(actorIdRaw);
        const actorArea = (req.user?.areaInterna ?? null);
        const mailbox = process.env.TICKETS_MAILBOX;
        if (!mailbox) {
            return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
        }
        const authorName = buildAuthorName(req, actorEmail);
        const fromName = `Soporte Cintax — ${authorName}`;
        const bodyWithSig = withSignature(bodyText, authorName);
        const files = req.files ?? [];
        const attachments = files.map((f) => ({
            filename: f.originalname,
            mimeType: f.mimetype,
            content: f.buffer,
        }));
        const requesterEmail = extractFirstEmail(to) ?? to;
        const ticket = await prisma_1.prisma.ticket.create({
            data: {
                subject,
                description: bodyText.slice(0, MAX_DESC),
                categoria: categoria ?? "GENERAL",
                estado: "ABIERTO",
                prioridad: null,
                requesterEmail,
                trabajadorId: actorId,
                areaAsignada: actorArea,
                source: "EMAIL",
            },
        });
        const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
            fromUserEmail: mailbox,
            fromName,
            to,
            cc: actorEmail,
            subject,
            bodyText: bodyWithSig,
            attachments,
            replyTo: mailbox,
        });
        const threadId = sendRes?.threadId ?? null;
        const gmailMessageId = sendRes?.id ?? null;
        if (threadId) {
            await prisma_1.prisma.ticket.update({
                where: { id_ticket: ticket.id_ticket },
                data: { gmailThreadId: threadId },
            });
        }
        let messageIdHeader = null;
        let referencesHeader = null;
        try {
            if (gmailMessageId) {
                const rawMsg = await (0, gmailDelegated_service_1.getMessageAsUser)(mailbox, gmailMessageId);
                const parsed = (0, gmailDelegated_service_1.parseGmailMessage)(rawMsg);
                messageIdHeader = parsed.messageIdHeader ?? null;
                referencesHeader = parsed.references ?? null;
                void messageIdHeader;
                void referencesHeader;
            }
        }
        catch { }
        const msg = await prisma_1.prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id_ticket,
                authorTrabajadorId: actorId,
                type: "PUBLIC_REPLY",
                direction: "OUTBOUND",
                gmailMessageId,
                subject,
                bodyHtml: "<p></p>",
                bodyText: bodyWithSig,
                toEmail: to,
                cc: actorEmail,
            },
        });
        // adjuntos (placeholder)
        if (files.length > 0) {
            await prisma_1.prisma.ticketAttachment.createMany({
                data: files.map((f) => ({
                    messageId: msg.id,
                    filename: f.originalname,
                    mimeType: f.mimetype,
                    size: f.size,
                    url: `email://${encodeURIComponent(f.originalname)}`,
                })),
            });
        }
        return res.status(201).json({
            ok: true,
            ticket,
            gmail: sendRes,
            from: mailbox,
            fromName,
            replyTo: mailbox,
            ccFinal: actorEmail,
            actor: { id: actorId, email: actorEmail, areaInterna: actorArea, authorName },
        });
    }
    catch (err) {
        console.error("createEmailTicket error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.createEmailTicket = createEmailTicket;
const replyTicketByEmail = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { bodyText } = req.body;
        if (!bodyText?.trim()) {
            return res.status(400).json({ ok: false, error: "bodyText es obligatorio" });
        }
        const actorEmail = req.user?.email;
        const actorIdRaw = req.user?.id_trabajador ?? req.user?.id ?? null;
        if (!actorEmail || !actorIdRaw) {
            return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const actorId = Number(actorIdRaw);
        const actorArea = (req.user?.areaInterna ?? null);
        const mailbox = process.env.TICKETS_MAILBOX;
        if (!mailbox) {
            return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
        }
        const ticket = await prisma_1.prisma.ticket.findUnique({
            where: { id_ticket: Number(ticketId) },
        });
        if (!ticket)
            return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
        if (!ticket.requesterEmail)
            return res.status(400).json({ ok: false, error: "Ticket sin requesterEmail" });
        const authorName = buildAuthorName(req, actorEmail);
        const fromName = `Soporte Cintax — ${authorName}`;
        const bodyWithSig = withSignature(bodyText, authorName);
        const files = req.files ?? [];
        const attachments = files.map((f) => ({
            filename: f.originalname,
            mimeType: f.mimetype,
            content: f.buffer,
        }));
        const subject = ticket.subject?.startsWith("Re:") ? ticket.subject : `Re: ${ticket.subject}`;
        await prisma_1.prisma.ticket.update({
            where: { id_ticket: ticket.id_ticket },
            data: {
                trabajadorId: actorId,
                areaAsignada: actorArea,
            },
        });
        const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
            fromUserEmail: mailbox,
            fromName,
            to: ticket.requesterEmail,
            cc: actorEmail,
            subject,
            bodyText: bodyWithSig,
            attachments,
            replyTo: mailbox,
            threadId: ticket.gmailThreadId ?? undefined,
        });
        const gmailMessageId = sendRes?.id ?? null;
        const msg = await prisma_1.prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id_ticket,
                authorTrabajadorId: actorId,
                type: "PUBLIC_REPLY",
                direction: "OUTBOUND",
                gmailMessageId,
                subject,
                bodyHtml: "<p></p>",
                bodyText: bodyWithSig,
                toEmail: ticket.requesterEmail,
                cc: actorEmail,
            },
        });
        if (files.length > 0) {
            await prisma_1.prisma.ticketAttachment.createMany({
                data: files.map((f) => ({
                    messageId: msg.id,
                    filename: f.originalname,
                    mimeType: f.mimetype,
                    size: f.size,
                    url: `email://${encodeURIComponent(f.originalname)}`,
                })),
            });
        }
        return res.status(201).json({
            ok: true,
            gmail: sendRes,
            from: mailbox,
            fromName,
            replyTo: mailbox,
            actor: { id: actorId, email: actorEmail, areaInterna: actorArea, authorName },
        });
    }
    catch (err) {
        console.error("replyTicketByEmail error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
    }
};
exports.replyTicketByEmail = replyTicketByEmail;
//# sourceMappingURL=tickets.controller.js.map