"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketMessagesNotReadyError = void 0;
exports.coerceMessageType = coerceMessageType;
exports.getGroupsForUser = getGroupsForUser;
exports.getTicketsForUser = getTicketsForUser;
exports.getInboxForUser = getInboxForUser;
exports.getInboxDiagnosticForAdmin = getInboxDiagnosticForAdmin;
exports.getTicketDetailForUser = getTicketDetailForUser;
exports.getTicketMessagesForUser = getTicketMessagesForUser;
exports.createTicketMessageForUser = createTicketMessageForUser;
exports.updateTicketForUser = updateTicketForUser;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const ticketAccess_1 = require("./access/ticketAccess");
const ticketRouting_1 = require("./routing/ticketRouting");
function buildGroupWhere(slugs) {
    const orClauses = [];
    slugs.forEach((slug) => {
        const group = (0, ticketRouting_1.areaFromSlug)(slug);
        if (!group)
            return;
        orClauses.push({
            trabajador: { areaInterna: group.area },
        });
    });
    if (orClauses.length === 0)
        return null;
    return { OR: orClauses };
}
function buildStatusWhere(status) {
    const key = status.trim().toLowerCase();
    const map = {
        abierto: ["2", "open", "abierto", "abierta"],
        pendiente: [
            "3",
            "6",
            "7",
            "pendiente",
            "pendiente de cliente",
            "pendiente de tercero",
            "pending",
        ],
        resuelto: ["4", "resuelto", "resolved"],
        cerrado: ["5", "cerrado", "closed"],
    };
    const values = map[key];
    if (!values)
        return null;
    return {
        OR: values.map((value) => ({
            estado: { equals: value, mode: "insensitive" },
        })),
    };
}
function buildPriorityWhere(priority) {
    const key = priority.trim().toLowerCase();
    const map = {
        baja: 1,
        media: 2,
        alta: 3,
        urgente: 4,
    };
    const value = map[key];
    if (!value)
        return null;
    return { prioridad: value };
}
function toStatusLabel(raw) {
    const rawStr = String(raw ?? "").trim();
    const rawLower = rawStr.toLowerCase();
    const rawNum = Number(rawStr);
    if (rawNum === 3)
        return "Pendiente";
    if (rawNum === 4)
        return "Resuelto";
    if (rawNum === 5)
        return "Cerrado";
    if (rawNum === 6 || rawNum === 7)
        return "Pendiente";
    if (["open", "abierto", "abierta"].includes(rawLower))
        return "Abierto";
    if (["resolved", "resuelto"].includes(rawLower))
        return "Resuelto";
    if (["closed", "cerrado"].includes(rawLower))
        return "Cerrado";
    if (rawLower.includes("pendiente"))
        return "Pendiente";
    return "Abierto";
}
function normalizeEstadoInput(raw) {
    const key = String(raw ?? "").trim().toLowerCase();
    const map = {
        abierto: "ABIERTO",
        abierta: "ABIERTO",
        open: "ABIERTO",
        pendiente: "PENDIENTE",
        "pendiente de cliente": "PENDIENTE",
        "pendiente de tercero": "PENDIENTE",
        pending: "PENDIENTE",
        resuelto: "RESUELTO",
        resolved: "RESUELTO",
        cerrado: "CERRADO",
        closed: "CERRADO",
    };
    return map[key] ?? String(raw).trim().toUpperCase();
}
function toPriorityLabel(raw) {
    if (raw === 4)
        return "Urgente";
    if (raw === 3)
        return "Alta";
    if (raw === 2)
        return "Media";
    if (raw === 1)
        return "Baja";
    return "Media";
}
function normalizePrioridadInput(raw) {
    if (typeof raw === "number") {
        if (Number.isInteger(raw) && raw >= 1 && raw <= 4)
            return raw;
        return null;
    }
    const key = String(raw ?? "").trim().toLowerCase();
    const map = {
        baja: 1,
        media: 2,
        alta: 3,
        urgente: 4,
    };
    if (map[key])
        return map[key];
    const parsed = Number(key);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 4)
        return parsed;
    return null;
}
function toGroupLabel(categoria) {
    return categoria || "Sin grupo";
}
function buildPreview(description) {
    const text = String(description ?? "").replace(/\s+/g, " ").trim();
    if (!text)
        return "";
    return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
function normalizeOptionalString(value) {
    if (value === undefined || value === null)
        return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}
function stripHtmlToText(raw) {
    const html = String(raw ?? "");
    if (!html)
        return "";
    const withBreaks = html
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/\s*p\s*>/gi, "\n");
    const withoutScripts = withBreaks
        .replace(/<\s*script[^>]*>[\s\S]*?<\/\s*script\s*>/gi, "")
        .replace(/<\s*style[^>]*>[\s\S]*?<\/\s*style\s*>/gi, "");
    const withoutTags = withoutScripts.replace(/<[^>]*>/g, "");
    return withoutTags.replace(/\s+/g, " ").trim();
}
function coerceMessageType(raw) {
    if (!raw)
        return null;
    const value = raw.trim().toUpperCase();
    if (value === "PUBLIC_REPLY")
        return client_1.TicketMessageType.PUBLIC_REPLY;
    if (value === "INTERNAL_NOTE")
        return client_1.TicketMessageType.INTERNAL_NOTE;
    if (value === "FORWARD")
        return client_1.TicketMessageType.FORWARD;
    return null;
}
class TicketMessagesNotReadyError extends Error {
    constructor() {
        super("TicketMessage table is not available");
        this.name = "TicketMessagesNotReadyError";
    }
}
exports.TicketMessagesNotReadyError = TicketMessagesNotReadyError;
function isMissingTicketMessageTable(err) {
    if (!(err instanceof client_1.Prisma.PrismaClientKnownRequestError))
        return false;
    if (err.code !== "P2021")
        return false;
    const table = String(err.meta?.table ?? "");
    return table.includes("TicketMessage");
}
const REPLIES_MARKER = "\n\n[[TICKET_REPLIES]]\n";
function splitDescription(raw) {
    const description = raw ?? "";
    const markerIndex = description.indexOf(REPLIES_MARKER);
    if (markerIndex === -1) {
        return { base: description, replies: [] };
    }
    const base = description.slice(0, markerIndex);
    const jsonPart = description.slice(markerIndex + REPLIES_MARKER.length);
    if (!jsonPart.trim()) {
        return { base, replies: [] };
    }
    try {
        const parsed = JSON.parse(jsonPart);
        if (Array.isArray(parsed)) {
            return { base, replies: parsed };
        }
    }
    catch {
        // ignore parsing errors
    }
    return { base, replies: [] };
}
async function getTicketForAccess(id, user) {
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth)
        return null;
    const admin = (0, ticketAccess_1.isAdmin)(auth);
    const areaInterna = await (0, ticketAccess_1.resolveTrabajadorArea)(prisma_1.prisma, auth.id_trabajador);
    if (!admin && !areaInterna)
        return null;
    const ticket = await prisma_1.prisma.ticket.findFirst({
        where: { id_ticket: id },
        include: { trabajador: { select: { areaInterna: true } } },
    });
    if (!ticket)
        return null;
    const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
    if (!admin && (!resolved || resolved.area !== areaInterna))
        return null;
    return { ticket, auth, admin, areaInterna };
}
function mapThreadMessage(row) {
    return {
        id: row.id,
        type: row.type,
        toEmail: row.toEmail,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        bodyText: row.bodyText,
        createdAt: row.createdAt.toISOString(),
        author: row.author
            ? {
                id_trabajador: row.author.id_trabajador,
                nombre: row.author.nombre,
                email: row.author.email,
            }
            : null,
    };
}
async function getGroupsForUser(user) {
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    const admin = (0, ticketAccess_1.isAdmin)(auth ?? undefined);
    if (!auth) {
        return { totalAll: 0, groups: [] };
    }
    const areaInterna = await (0, ticketAccess_1.resolveTrabajadorArea)(prisma_1.prisma, auth.id_trabajador);
    const areaChips = (0, ticketRouting_1.getAreaChips)();
    if (!admin && !areaInterna) {
        return { totalAll: 0, groups: [] };
    }
    const candidates = await prisma_1.prisma.ticket.findMany({
        include: { trabajador: { select: { areaInterna: true } } },
    });
    const counts = {};
    areaChips.forEach((group) => {
        counts[group.slug] = 0;
    });
    let totalAll = 0;
    candidates.forEach((ticket) => {
        const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
        if (!resolved) {
            if (admin)
                totalAll += 1;
            return;
        }
        if (!admin && resolved.area !== areaInterna)
            return;
        totalAll += 1;
        if (counts[resolved.slug] !== undefined) {
            counts[resolved.slug] += 1;
        }
    });
    const groups = areaChips
        .filter((group) => admin || group.area === areaInterna)
        .map((group) => ({
        slug: group.slug,
        name: group.name,
        count: counts[group.slug] ?? 0,
    }));
    console.info("tickets_groups", {
        role: auth.role,
        areaInterna,
        groupsCount: groups.length,
    });
    return {
        totalAll,
        groups,
    };
}
async function getTicketsForUser(params) {
    const { user, area, q, status, priority } = params;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth)
        return [];
    const admin = (0, ticketAccess_1.isAdmin)(auth);
    const areaInterna = await (0, ticketAccess_1.resolveTrabajadorArea)(prisma_1.prisma, auth.id_trabajador);
    if (!admin && !areaInterna)
        return [];
    const filters = [];
    if (q && q.trim()) {
        const search = q.trim();
        const orFilters = [
            { subject: { contains: search, mode: "insensitive" } },
            { requesterEmail: { contains: search, mode: "insensitive" } },
        ];
        const num = Number(search);
        if (!Number.isNaN(num)) {
            orFilters.push({ id_ticket: num });
            orFilters.push({ freshdeskId: num });
        }
        filters.push({ OR: orFilters });
    }
    if (status) {
        const statusWhere = buildStatusWhere(status);
        if (statusWhere)
            filters.push(statusWhere);
    }
    if (priority) {
        const priorityWhere = buildPriorityWhere(priority);
        if (priorityWhere)
            filters.push(priorityWhere);
    }
    if (!admin) {
        filters.push({
            OR: [{ trabajador: { areaInterna } }, { trabajadorId: null }],
        });
    }
    if (admin && area && area !== "all") {
        const areaWhere = buildGroupWhere([area]);
        if (areaWhere) {
            filters.push({
                OR: [areaWhere, { trabajadorId: null }],
            });
        }
    }
    const where = filters.length > 0 ? { AND: filters } : undefined;
    const rows = await prisma_1.prisma.ticket.findMany({
        where,
        include: { trabajador: { select: { areaInterna: true } } },
        orderBy: { createdAt: "desc" },
    });
    const requestedArea = area ?? "all";
    const effectiveArea = admin ? requestedArea : areaInterna?.toString() ?? "none";
    const results = [];
    rows.forEach((ticket) => {
        const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
        if (!resolved) {
            if (!admin && areaInterna)
                return;
            if (admin && area && area !== "all")
                return;
        }
        else {
            if (!admin && resolved.area !== areaInterna)
                return;
            if (admin && area && area !== "all" && resolved.slug !== area)
                return;
        }
        results.push({
            id: ticket.id_ticket,
            number: ticket.id_ticket,
            subject: ticket.subject || "Sin asunto",
            requester: ticket.requesterEmail || "Sin correo",
            requesterEmail: ticket.requesterEmail || "Sin correo",
            preview: buildPreview(ticket.description),
            group: toGroupLabel(ticket.categoria),
            areaSlug: resolved?.slug ?? null,
            areaLabel: resolved?.name ?? null,
            categoria: ticket.categoria ?? null,
            status: toStatusLabel(ticket.estado),
            priority: toPriorityLabel(ticket.prioridad),
            createdAt: ticket.createdAt.toISOString(),
        });
    });
    console.info("tickets_list", {
        role: auth.role,
        requestedArea,
        effectiveArea,
        resultCount: results.length,
    });
    return results;
}
async function getInboxForUser(params) {
    const { user, area, q, status, priority, limit = 20 } = params;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth)
        return [];
    const admin = (0, ticketAccess_1.isAdmin)(auth);
    const areaInterna = await (0, ticketAccess_1.resolveTrabajadorArea)(prisma_1.prisma, auth.id_trabajador);
    if (!admin && !areaInterna)
        return [];
    const filters = [];
    if (q && q.trim()) {
        const search = q.trim();
        const orFilters = [
            { subject: { contains: search, mode: "insensitive" } },
            { requesterEmail: { contains: search, mode: "insensitive" } },
        ];
        const num = Number(search);
        if (!Number.isNaN(num)) {
            orFilters.push({ id_ticket: num });
            orFilters.push({ freshdeskId: num });
        }
        filters.push({ OR: orFilters });
    }
    if (status) {
        const statusWhere = buildStatusWhere(status);
        if (statusWhere)
            filters.push(statusWhere);
    }
    if (priority) {
        const priorityWhere = buildPriorityWhere(priority);
        if (priorityWhere)
            filters.push(priorityWhere);
    }
    if (!admin) {
        filters.push({
            OR: [{ trabajador: { areaInterna } }, { trabajadorId: null }],
        });
    }
    if (admin && area && area !== "all") {
        const areaWhere = buildGroupWhere([area]);
        if (areaWhere) {
            filters.push({
                OR: [areaWhere, { trabajadorId: null }],
            });
        }
    }
    const where = filters.length > 0 ? { AND: filters } : undefined;
    const rows = await prisma_1.prisma.ticket.findMany({
        where,
        include: { trabajador: { select: { areaInterna: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    const results = [];
    rows.forEach((ticket) => {
        const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
        if (!admin) {
            if (!resolved || resolved.area !== areaInterna)
                return;
        }
        else if (area && area !== "all") {
            if (!resolved || resolved.slug !== area)
                return;
        }
        results.push({
            id: ticket.id_ticket,
            number: ticket.id_ticket,
            subject: ticket.subject || "Sin asunto",
            requester: ticket.requesterEmail || "Sin correo",
            requesterEmail: ticket.requesterEmail || "Sin correo",
            preview: buildPreview(ticket.description),
            group: toGroupLabel(ticket.categoria),
            areaSlug: resolved?.slug ?? null,
            areaLabel: resolved?.name ?? null,
            categoria: ticket.categoria ?? null,
            status: toStatusLabel(ticket.estado),
            priority: toPriorityLabel(ticket.prioridad),
            createdAt: ticket.createdAt.toISOString(),
        });
    });
    console.info("tickets_inbox", {
        role: auth.role,
        areaInterna,
        resultCount: results.length,
    });
    return results;
}
async function getInboxDiagnosticForAdmin(params) {
    const { user, limit = 20 } = params;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth || !(0, ticketAccess_1.isAdmin)(auth))
        return null;
    const totalTickets = await prisma_1.prisma.ticket.count();
    const latest = await prisma_1.prisma.ticket.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
            id_ticket: true,
            subject: true,
            requesterEmail: true,
            createdAt: true,
            categoria: true,
            estado: true,
            prioridad: true,
        },
    });
    return {
        totalTickets,
        latest: latest.map((ticket) => ({
            id_ticket: ticket.id_ticket,
            subject: ticket.subject,
            requesterEmail: ticket.requesterEmail,
            createdAt: ticket.createdAt.toISOString(),
            categoria: ticket.categoria,
            estado: ticket.estado,
            prioridad: ticket.prioridad,
        })),
    };
}
async function getTicketDetailForUser(id, user) {
    const access = await getTicketForAccess(id, user);
    if (!access)
        return null;
    const { ticket } = access;
    const { base, replies } = splitDescription(ticket.description);
    let dbMessages = [];
    try {
        dbMessages = await prisma_1.prisma.ticketMessage.findMany({
            where: { ticketId: ticket.id_ticket },
            orderBy: { createdAt: "asc" },
            include: {
                author: {
                    select: { id_trabajador: true, nombre: true, email: true },
                },
            },
        });
    }
    catch (err) {
        if (!isMissingTicketMessageTable(err)) {
            throw err;
        }
        console.warn("TicketMessage table missing, returning legacy thread only.");
        dbMessages = [];
    }
    const legacyReplies = replies.map((reply) => ({
        id: reply.id,
        authorEmail: reply.authorEmail || "sin-correo@cintax.cl",
        body: reply.body,
        createdAt: reply.createdAt,
        kind: "reply",
    }));
    const dbReplies = dbMessages.map((msg) => ({
        id: `db-${msg.id}`,
        authorEmail: msg.author?.email || "sistema@cintax.cl",
        body: msg.bodyText || stripHtmlToText(msg.bodyHtml || ""),
        createdAt: msg.createdAt.toISOString(),
        kind: "reply",
    }));
    const mergedReplies = [...legacyReplies, ...dbReplies].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return aTime - bTime;
    });
    const messages = [
        {
            id: `requester-${ticket.id_ticket}`,
            authorEmail: ticket.requesterEmail || "sin-correo@cintax.cl",
            body: base || "Sin descripcion.",
            createdAt: ticket.createdAt.toISOString(),
            kind: "requester",
        },
        ...mergedReplies,
    ];
    const detail = {
        id: ticket.id_ticket,
        number: ticket.freshdeskId ?? ticket.id_ticket,
        subject: ticket.subject || "Sin asunto",
        description: base,
        requesterEmail: ticket.requesterEmail || "Sin correo",
        group: toGroupLabel(ticket.categoria),
        status: toStatusLabel(ticket.estado),
        priority: toPriorityLabel(ticket.prioridad),
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        trabajadorId: ticket.trabajadorId ?? null,
    };
    return { ticket: detail, messages };
}
async function getTicketMessagesForUser(id, user) {
    const access = await getTicketForAccess(id, user);
    if (!access)
        return null;
    let rows = [];
    try {
        rows = await prisma_1.prisma.ticketMessage.findMany({
            where: { ticketId: id },
            orderBy: { createdAt: "asc" },
            include: {
                author: {
                    select: { id_trabajador: true, nombre: true, email: true },
                },
            },
        });
    }
    catch (err) {
        if (!isMissingTicketMessageTable(err)) {
            throw err;
        }
        console.warn("TicketMessage table missing, returning empty list.");
        rows = [];
    }
    return rows.map((row) => mapThreadMessage({
        id: row.id,
        type: row.type,
        toEmail: row.toEmail,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        bodyText: row.bodyText,
        createdAt: row.createdAt,
        author: row.author,
    }));
}
async function createTicketMessageForUser(params) {
    const { id, user, payload } = params;
    const access = await getTicketForAccess(id, user);
    if (!access)
        return null;
    const { ticket, auth } = access;
    const toEmailRaw = normalizeOptionalString(payload.toEmail);
    const cc = normalizeOptionalString(payload.cc);
    const bcc = normalizeOptionalString(payload.bcc);
    const subjectRaw = normalizeOptionalString(payload.subject);
    const toEmail = payload.type === client_1.TicketMessageType.PUBLIC_REPLY && !toEmailRaw
        ? ticket.requesterEmail || null
        : toEmailRaw;
    const subject = payload.type === client_1.TicketMessageType.FORWARD && !subjectRaw
        ? `Fwd: ${ticket.subject || "Sin asunto"}`
        : subjectRaw;
    const bodyHtml = String(payload.bodyHtml ?? "").trim();
    const bodyText = stripHtmlToText(bodyHtml);
    if (!bodyText) {
        throw new Error("Mensaje vacio o sin contenido util");
    }
    let created;
    try {
        created = await prisma_1.prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id_ticket,
                authorTrabajadorId: auth.id_trabajador,
                type: payload.type,
                toEmail,
                cc,
                bcc,
                subject,
                bodyHtml,
                bodyText: bodyText || null,
            },
            include: {
                author: {
                    select: { id_trabajador: true, nombre: true, email: true },
                },
            },
        });
    }
    catch (err) {
        if (isMissingTicketMessageTable(err)) {
            throw new TicketMessagesNotReadyError();
        }
        throw err;
    }
    return mapThreadMessage({
        id: created.id,
        type: created.type,
        toEmail: created.toEmail,
        cc: created.cc,
        bcc: created.bcc,
        subject: created.subject,
        bodyHtml: created.bodyHtml,
        bodyText: created.bodyText,
        createdAt: created.createdAt,
        author: created.author,
    });
}
async function updateTicketForUser(params) {
    const { id, user, estado, prioridad, categoria, trabajadorId } = params;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth)
        return null;
    const admin = (0, ticketAccess_1.isAdmin)(auth);
    const areaInterna = await (0, ticketAccess_1.resolveTrabajadorArea)(prisma_1.prisma, auth.id_trabajador);
    if (!admin && !areaInterna)
        return null;
    const ticket = await prisma_1.prisma.ticket.findFirst({
        where: { id_ticket: id },
        include: { trabajador: { select: { areaInterna: true } } },
    });
    if (!ticket)
        return null;
    const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
    if (!admin && (!resolved || resolved.area !== areaInterna))
        return null;
    const data = {};
    if (estado && estado.trim()) {
        data.estado = normalizeEstadoInput(estado);
    }
    if (prioridad !== undefined) {
        if (prioridad === null || prioridad === "")
            data.prioridad = null;
        else {
            const value = normalizePrioridadInput(prioridad);
            if (value !== null)
                data.prioridad = value;
        }
    }
    if (categoria !== undefined) {
        if (categoria === null) {
            data.categoria = "";
        }
        else {
            const normalizedCategoria = String(categoria).trim();
            if (normalizedCategoria) {
                data.categoria = normalizedCategoria;
            }
        }
    }
    if (trabajadorId !== undefined) {
        data.trabajadorId = trabajadorId;
    }
    if (Object.keys(data).length === 0)
        return ticket;
    return prisma_1.prisma.ticket.update({
        where: { id_ticket: id },
        data,
    });
}
