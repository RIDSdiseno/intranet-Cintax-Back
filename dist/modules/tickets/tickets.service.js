"use strict";
// src/modules/tickets/tickets.service.ts
//
// Capa de datos de la ticketera: listado con permisos por area, detalle,
// hilo de mensajes (con envio por Gmail), actualizacion y auditoria.
//
// Depende de las columnas de Ticket agregadas en
// prisma/manual/20261109_ticket_columnas.sql (clienteId, tags,
// firstResponseAt, resolvedAt). Si el editor marca esas propiedades como
// inexistentes, el cliente Prisma esta desactualizado: `npx prisma generate`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.THREAD_MESSAGE_INCLUDE = exports.TicketMessagesNotReadyError = void 0;
exports.coerceMessageType = coerceMessageType;
exports.getGroupsForUser = getGroupsForUser;
exports.getSummaryForUser = getSummaryForUser;
exports.getTicketsForUser = getTicketsForUser;
exports.getInboxDiagnosticForAdmin = getInboxDiagnosticForAdmin;
exports.getTicketAgentsForUser = getTicketAgentsForUser;
exports.getTicketDetailForUser = getTicketDetailForUser;
exports.getTicketMessagesForUser = getTicketMessagesForUser;
exports.createTicketMessageForUser = createTicketMessageForUser;
exports.updateTicketForUser = updateTicketForUser;
exports.recordTicketEvent = recordTicketEvent;
exports.getTicketEventsForUser = getTicketEventsForUser;
exports.createTicketForUser = createTicketForUser;
exports.resolveClienteIdByRut = resolveClienteIdByRut;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const ticketAccess_1 = require("./access/ticketAccess");
const ticketRouting_1 = require("./routing/ticketRouting");
const tickets_logger_1 = require("./tickets.logger");
const gmailDelegated_service_1 = require("../../services/gmailDelegated.service");
const rut_1 = require("../../utils/rut");
/**
 * Los filtros tienen que calzar con la ETIQUETA, no con el dato crudo.
 *
 * `toPriorityLabel` traduce null a "Media", y los tickets que nacen del correo
 * llegan sin prioridad. Si el filtro buscara solo el valor exacto, el usuario
 * veria treinta tickets rotulados "Media", filtraria por Media y le quedaria
 * uno: el unico con un 2 de verdad en la base. Por eso el caso "media"
 * incluye tambien los nulos, y el filtro devuelve lo que estaba a la vista.
 *
 * La alternativa seria rellenar esa columna en la base, pero eso es cambiar
 * datos existentes para acomodar la UI, y la etiqueta por defecto es una
 * decision de presentacion: su lugar es aca.
 *
 * `buildStatusWhere` no necesita lo mismo porque `estado` no admite nulos en
 * el esquema. Si aparecieran estados fuera de los listados abajo, se verian
 * como "Abierto" y el filtro no los traeria: ahi si habria que revisar esto.
 */
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
    // "Media" es lo que muestra toPriorityLabel cuando la prioridad viene nula.
    if (value === 2) {
        return { OR: [{ prioridad: 2 }, { prioridad: null }] };
    }
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
function getSlaHours() {
    const parse = (value, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0)
            return fallback;
        return Math.floor(n);
    };
    return {
        firstResponse: parse(process.env.SLA_FIRST_RESPONSE_HOURS, 24),
        resolution: parse(process.env.SLA_RESOLUTION_HOURS, 72),
    };
}
function addHours(date, hours) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
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
/**
 * Descripcion del ticket sin la cola de respuestas que el formato antiguo
 * dejaba embebida como JSON despues de REPLIES_MARKER.
 *
 * Esas respuestas antiguas ya no se leen: el hilo vive en TicketMessage y se
 * sirve desde GET /:id/messages.
 */
function descriptionBase(raw) {
    const description = raw ?? "";
    const markerIndex = description.indexOf(REPLIES_MARKER);
    return markerIndex === -1 ? description : description.slice(0, markerIndex);
}
async function getTicketForAccess(id, user) {
    const ctx = await (0, ticketAccess_1.getUserContext)(prisma_1.prisma, user);
    if (!ctx)
        return null;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth)
        return null;
    const ticket = await prisma_1.prisma.ticket.findFirst({
        where: { id_ticket: id },
        include: { trabajador: { select: { areaInterna: true } } },
    });
    if (!ticket)
        return null;
    const enforcedArea = (0, ticketAccess_1.enforceArea)(ctx, "all");
    if (!ctx.isAdmin && !ticketMatchesEffectiveArea(ticket, enforcedArea.effectiveArea, false)) {
        return null;
    }
    return { ticket, auth, admin: ctx.isAdmin, areaInterna: ctx.areaInterna };
}
/** Lo que hay que traer de TicketMessage para armar un mensaje del hilo. */
exports.THREAD_MESSAGE_INCLUDE = {
    author: { select: { id_trabajador: true, nombre: true, email: true } },
    attachments: {
        select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            url: true,
            createdAt: true,
        },
    },
};
function mapThreadMessage(row) {
    return {
        id: row.id,
        type: row.type,
        // La UI separa burbujas del cliente y del agente con este flag.
        isInbound: row.direction === "INBOUND",
        toEmail: row.toEmail,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        bodyText: row.bodyText,
        attachments: (row.attachments ?? []).map((file) => ({
            id: file.id,
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            url: file.url,
            createdAt: file.createdAt.toISOString(),
        })),
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
function ticketMatchesEffectiveArea(ticket, effectiveArea, isAdminUser) {
    const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
    if (effectiveArea === "all") {
        if (isAdminUser)
            return true;
        return Boolean(resolved);
    }
    return Boolean(resolved && resolved.slug === effectiveArea);
}
async function getGroupsForUser(params) {
    const { user, view, requestId } = params;
    const ctx = await (0, ticketAccess_1.getUserContext)(prisma_1.prisma, user);
    if (!ctx) {
        return { totalAll: 0, groups: [] };
    }
    // Los contadores tienen que mirar el mismo conjunto que el listado: si la
    // vista es "Mis tickets", la pestana no puede seguir contando toda el area.
    const soloMios = view === "mine";
    const candidates = await prisma_1.prisma.ticket.findMany({
        where: soloMios ? { trabajadorId: ctx.userId } : undefined,
        include: { trabajador: { select: { areaInterna: true } } },
    });
    const allCount = candidates.filter((ticket) => ticketMatchesEffectiveArea(ticket, ctx.isAdmin ? "all" : ctx.userAreaSlug ?? "all", ctx.isAdmin)).length;
    const groups = ctx.allowedAreas.map((slug) => {
        if (slug === "all") {
            return { slug: "all", name: "Todos", count: allCount };
        }
        const area = (0, ticketRouting_1.areaFromSlug)(slug);
        const count = candidates.filter((ticket) => ticketMatchesEffectiveArea(ticket, slug, ctx.isAdmin)).length;
        return {
            slug,
            name: area?.name ?? slug,
            count,
        };
    });
    (0, tickets_logger_1.logTicketInfo)({
        action: "tickets_groups",
        requestId,
        userId: ctx.userId,
        role: ctx.role,
        meta: {
            isAdmin: ctx.isAdmin,
            areaInterna: ctx.areaInterna,
            allowedAreas: ctx.allowedAreas,
            view: soloMios ? "mine" : "all",
            groupsCount: groups.length,
            counts: groups.map((g) => ({ slug: g.slug, count: g.count })),
        },
    });
    return {
        totalAll: allCount,
        groups,
    };
}
/**
 * Filtros SQL de alcance compartidos por el listado y el resumen:
 * "Mis tickets" + descarte de tickets con OTRA area explicita.
 * El area definitiva se termina de resolver en memoria con
 * ticketMatchesEffectiveArea (resolveTicketArea cae en heuristicas cuando
 * areaAsignada es null), pero descartar en SQL lo que ya tiene otra area
 * es seguro: ese ticket nunca va a calzar.
 */
function buildScopeFilters(params) {
    const { userId, area, view, effectiveArea } = params;
    const filters = [];
    // "Mis tickets": el front lo manda como view=mine o area=mine.
    if (view === "mine" || area === "mine") {
        filters.push({ trabajadorId: userId ?? -1 });
    }
    if (effectiveArea !== "all") {
        const areaPedida = (0, ticketRouting_1.areaFromSlug)(effectiveArea);
        if (areaPedida) {
            filters.push({
                OR: [{ areaAsignada: areaPedida.area }, { areaAsignada: null }],
            });
        }
    }
    return filters;
}
/**
 * Resumen de la ticketera (totales + SLA global) sobre los tickets que el
 * usuario puede ver en el area pedida. Solo lectura.
 *
 * Fuentes de verdad:
 * - 1ra respuesta: `firstResponseAt`; respaldo = primer PUBLIC_REPLY OUTBOUND.
 * - Cierre: `resolvedAt`; respaldo = ultimo ESTADO_CAMBIADO a CERRADO/RESUELTO.
 * Los tickets cerrados sin ninguno de esos datos (p. ej. importados) no se
 * cuentan en el SLA, para no inventar tiempos.
 */
async function getSummaryForUser(params) {
    const { user, area, view, requestId } = params;
    const slaHours = getSlaHours();
    const emptyMetric = (targetHours) => ({
        percent: null,
        evaluated: 0,
        breached: 0,
        pending: 0,
        avgMinutes: null,
        targetHours,
    });
    const empty = {
        total: 0,
        abiertos: 0,
        pendientes: 0,
        cerrados: 0,
        urgentes: 0,
        slaFirstResponse: emptyMetric(slaHours.firstResponse),
        slaResolution: emptyMetric(slaHours.resolution),
    };
    const ctx = await (0, ticketAccess_1.getUserContext)(prisma_1.prisma, user);
    if (!ctx)
        return empty;
    const forcedArea = (0, ticketAccess_1.enforceArea)(ctx, area);
    const effectiveArea = forcedArea.effectiveArea;
    if (!effectiveArea)
        return empty;
    const filters = buildScopeFilters({
        userId: ctx.userId,
        area,
        view,
        effectiveArea,
    });
    const rows = await prisma_1.prisma.ticket.findMany({
        where: filters.length > 0 ? { AND: filters } : undefined,
        select: {
            id_ticket: true,
            estado: true,
            prioridad: true,
            createdAt: true,
            firstResponseAt: true,
            resolvedAt: true,
            areaAsignada: true,
            categoria: true,
            subject: true,
            description: true,
            trabajador: { select: { areaInterna: true } },
        },
    });
    const scoped = rows.filter((t) => ticketMatchesEffectiveArea(t, effectiveArea, ctx.isAdmin));
    const ids = scoped.map((t) => t.id_ticket);
    // Respaldo 1ra respuesta: primer PUBLIC_REPLY saliente por ticket.
    const firstReplyByTicket = new Map();
    if (ids.length > 0) {
        try {
            const replies = await prisma_1.prisma.ticketMessage.groupBy({
                by: ["ticketId"],
                where: {
                    ticketId: { in: ids },
                    type: client_1.TicketMessageType.PUBLIC_REPLY,
                    direction: client_1.TicketMessageDirection.OUTBOUND,
                },
                _min: { createdAt: true },
            });
            replies.forEach((r) => {
                if (r._min.createdAt)
                    firstReplyByTicket.set(r.ticketId, r._min.createdAt);
            });
        }
        catch (err) {
            if (!isMissingTicketMessageTable(err))
                throw err;
        }
    }
    // Respaldo cierre: ultimo cambio de estado a CERRADO/RESUELTO.
    const closedAtByTicket = new Map();
    if (ids.length > 0) {
        const events = await prisma_1.prisma.ticketEvent.findMany({
            where: { ticketId: { in: ids }, type: "ESTADO_CAMBIADO" },
            select: { ticketId: true, createdAt: true, meta: true },
            orderBy: { createdAt: "asc" },
        });
        events.forEach((ev) => {
            const meta = (ev.meta ?? {});
            const label = toStatusLabel(String(meta.a ?? ""));
            if (label === "Cerrado" || label === "Resuelto") {
                closedAtByTicket.set(ev.ticketId, ev.createdAt);
            }
        });
    }
    const now = Date.now();
    const acc = () => ({ evaluated: 0, breached: 0, pending: 0, sumMs: 0, n: 0 });
    const fr = acc();
    const rs = acc();
    let abiertos = 0;
    let pendientes = 0;
    let cerrados = 0;
    let urgentes = 0;
    const measure = (bucket, createdAt, doneAt, isOpen, targetHours) => {
        const dueMs = createdAt.getTime() + targetHours * 3_600_000;
        if (doneAt) {
            const took = Math.max(0, doneAt.getTime() - createdAt.getTime());
            bucket.evaluated++;
            bucket.sumMs += took;
            bucket.n++;
            if (doneAt.getTime() > dueMs)
                bucket.breached++;
            return;
        }
        if (!isOpen)
            return; // cerrado sin dato: no se puede medir
        bucket.pending++;
        if (now > dueMs) {
            bucket.evaluated++;
            bucket.breached++;
        }
    };
    scoped.forEach((t) => {
        const label = toStatusLabel(t.estado);
        const isClosed = label === "Cerrado" || label === "Resuelto";
        if (isClosed)
            cerrados++;
        else if (label === "Pendiente")
            pendientes++;
        else
            abiertos++;
        if (!isClosed && t.prioridad === 4)
            urgentes++;
        measure(fr, t.createdAt, t.firstResponseAt ?? firstReplyByTicket.get(t.id_ticket) ?? null, !isClosed, slaHours.firstResponse);
        measure(rs, t.createdAt, t.resolvedAt ?? (isClosed ? closedAtByTicket.get(t.id_ticket) ?? null : null), !isClosed, slaHours.resolution);
    });
    const toMetric = (b, targetHours) => ({
        percent: b.evaluated > 0
            ? Math.round(((b.evaluated - b.breached) / b.evaluated) * 100)
            : null,
        evaluated: b.evaluated,
        breached: b.breached,
        pending: b.pending,
        avgMinutes: b.n > 0 ? Math.round(b.sumMs / b.n / 60_000) : null,
        targetHours,
    });
    const summary = {
        total: scoped.length,
        abiertos,
        pendientes,
        cerrados,
        urgentes,
        slaFirstResponse: toMetric(fr, slaHours.firstResponse),
        slaResolution: toMetric(rs, slaHours.resolution),
    };
    (0, tickets_logger_1.logTicketInfo)({
        action: "tickets_summary",
        requestId,
        userId: ctx.userId,
        role: ctx.role,
        meta: { effectiveArea, total: summary.total },
    });
    return summary;
}
async function getTicketsForUser(params) {
    const { user, area, view, q, keywords, status, priority, asignado, solicitante, requestId, } = params;
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(Number(params.pageSize) || 50)));
    const empty = { items: [], total: 0, page, pageSize };
    const ctx = await (0, ticketAccess_1.getUserContext)(prisma_1.prisma, user);
    if (!ctx)
        return empty;
    const forcedArea = (0, ticketAccess_1.enforceArea)(ctx, area);
    if (!forcedArea.effectiveArea)
        return empty;
    const requestedArea = forcedArea.requestedArea;
    const effectiveArea = forcedArea.effectiveArea;
    const filters = buildScopeFilters({
        userId: ctx.userId,
        area,
        view,
        effectiveArea,
    });
    if (asignado && asignado.trim()) {
        const value = asignado.trim().toLowerCase();
        // La UI manda "none" para "Agente: No asignado" (BarraFiltrosTickets).
        const sinAsignar = ["none", "unassigned", "no-asignado", "sin-asignar"];
        if (sinAsignar.includes(value)) {
            filters.push({ trabajadorId: null });
        }
        else if (value !== "all" && value !== "todos") {
            const parsed = Number(value);
            if (Number.isInteger(parsed) && parsed > 0) {
                filters.push({ trabajadorId: parsed });
            }
        }
    }
    if (solicitante && solicitante.trim()) {
        filters.push({
            requesterEmail: { contains: solicitante.trim(), mode: "insensitive" },
        });
    }
    if (keywords && keywords.trim()) {
        const kw = keywords.trim();
        filters.push({
            OR: [
                { subject: { contains: kw, mode: "insensitive" } },
                { description: { contains: kw, mode: "insensitive" } },
            ],
        });
    }
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
    const where = filters.length > 0 ? { AND: filters } : undefined;
    const rows = await prisma_1.prisma.ticket.findMany({
        where,
        include: { trabajador: { select: { areaInterna: true } } },
        orderBy: { createdAt: "desc" },
    });
    const results = [];
    rows.forEach((ticket) => {
        if (!ticketMatchesEffectiveArea(ticket, effectiveArea, ctx.isAdmin))
            return;
        const resolved = (0, ticketRouting_1.resolveTicketArea)(ticket);
        results.push({
            id: ticket.id_ticket,
            number: ticket.id_ticket,
            subject: ticket.subject || "Sin asunto",
            requester: ticket.requesterEmail || "Sin correo",
            requesterEmail: ticket.requesterEmail || "Sin correo",
            preview: buildPreview(ticket.description),
            group: toGroupLabel(ticket.categoria),
            areaDetected: (0, ticketRouting_1.areaToDetected)(ticket.areaAsignada ?? resolved?.area ?? null),
            areaSlug: resolved?.slug ?? null,
            areaLabel: resolved?.name ?? null,
            categoria: ticket.categoria ?? null,
            tags: ticket.tags ?? [],
            trabajadorId: ticket.trabajadorId ?? null,
            status: toStatusLabel(ticket.estado),
            priority: toPriorityLabel(ticket.prioridad),
            createdAt: ticket.createdAt.toISOString(),
        });
    });
    (0, tickets_logger_1.logTicketInfo)({
        action: "tickets_list",
        requestId,
        userId: ctx.userId,
        role: ctx.role,
        meta: {
            isAdmin: ctx.isAdmin,
            allowedAreas: ctx.allowedAreas,
            requestedArea,
            effectiveArea,
            forced: forcedArea.forced,
            resultCount: results.length,
            page,
            pageSize,
        },
    });
    // El filtro por area se resuelve en memoria (depende del area del asignado),
    // asi que la paginacion se aplica sobre el conjunto ya filtrado.
    const start = (page - 1) * pageSize;
    return {
        items: results.slice(start, start + pageSize),
        total: results.length,
        page,
        pageSize,
    };
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
async function getTicketAgentsForUser(params) {
    const { user, requestId } = params;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    if (!auth)
        return [];
    if (!["ADMIN", "SUPERVISOR", "AGENTE"].includes(auth.role)) {
        return [];
    }
    const agents = await prisma_1.prisma.trabajador.findMany({
        where: {
            areaInterna: { not: null },
            status: true,
        },
        select: {
            id_trabajador: true,
            nombre: true,
            email: true,
            areaInterna: true,
        },
        orderBy: [{ areaInterna: "asc" }, { nombre: "asc" }],
    });
    (0, tickets_logger_1.logTicketInfo)({
        action: "tickets_agents_list",
        requestId,
        userId: auth.id_trabajador,
        role: auth.role,
        meta: { count: agents.length },
    });
    return agents;
}
async function getTicketDetailForUser(id, user) {
    const access = await getTicketForAccess(id, user);
    if (!access)
        return null;
    const { ticket } = access;
    // El hilo NO se arma aca: la UI lo pide aparte con GET /:id/messages.
    const base = descriptionBase(ticket.description);
    // `firstResponseAt` es la fuente de verdad. Solo se busca el primer
    // PUBLIC_REPLY como respaldo, para tickets anteriores a esa columna.
    let hasFirstPublicReply = Boolean(ticket.firstResponseAt);
    if (!hasFirstPublicReply) {
        try {
            const firstReply = await prisma_1.prisma.ticketMessage.findFirst({
                where: {
                    ticketId: ticket.id_ticket,
                    type: client_1.TicketMessageType.PUBLIC_REPLY,
                },
                select: { id: true },
            });
            hasFirstPublicReply = Boolean(firstReply);
        }
        catch (err) {
            if (!isMissingTicketMessageTable(err)) {
                throw err;
            }
            hasFirstPublicReply = false;
        }
    }
    const slaHours = getSlaHours();
    const firstResponseDueAt = addHours(ticket.createdAt, slaHours.firstResponse).toISOString();
    const resolutionDueAt = addHours(ticket.createdAt, slaHours.resolution).toISOString();
    const normalizedEstado = normalizeEstadoInput(ticket.estado);
    // Igual que arriba: manda `resolvedAt`, y el estado queda de respaldo.
    // RESUELTO tambien cuenta como resuelto, no solo CERRADO.
    const resolutionStatus = ticket.resolvedAt ||
        normalizedEstado === "CERRADO" ||
        normalizedEstado === "RESUELTO"
        ? "OK"
        : "PENDIENTE";
    const firstResponseStatus = hasFirstPublicReply ? "OK" : "PENDIENTE";
    const detail = {
        id: ticket.id_ticket,
        number: ticket.freshdeskId ?? ticket.id_ticket,
        subject: ticket.subject || "Sin asunto",
        description: base,
        requesterEmail: ticket.requesterEmail || "Sin correo",
        group: toGroupLabel(ticket.categoria),
        categoria: ticket.categoria ?? null,
        areaDetected: (0, ticketRouting_1.areaToDetected)(ticket.areaAsignada ?? null),
        tags: ticket.tags ?? [],
        clienteId: ticket.clienteId ?? null,
        status: toStatusLabel(ticket.estado),
        estado: ticket.estado ?? null,
        priority: toPriorityLabel(ticket.prioridad),
        prioridad: ticket.prioridad ?? null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        trabajadorId: ticket.trabajadorId ?? null,
        firstResponseDueAt,
        resolutionDueAt,
        firstResponseStatus,
        resolutionStatus,
    };
    return { ticket: detail };
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
            include: exports.THREAD_MESSAGE_INCLUDE,
        });
    }
    catch (err) {
        if (!isMissingTicketMessageTable(err)) {
            throw err;
        }
        console.warn("TicketMessage table missing, returning empty list.");
        rows = [];
    }
    // Se pasa la fila completa: copiarla campo por campo ya dejo fuera
    // `direction` y `attachments` una vez, y el hilo perdio el color de los
    // correos entrantes y la lista de adjuntos al recargar.
    return rows.map(mapThreadMessage);
}
/** Firma al pie del cuerpo, igual que el flujo anterior. */
function withSignature(body, authorName) {
    const cleanBody = String(body ?? "").trim();
    const signature = `\n\n--\n${authorName}\nSoporte Cintax`;
    return cleanBody ? cleanBody + signature : signature;
}
function splitEmailList(raw) {
    if (!raw)
        return [];
    const seen = new Set();
    const out = [];
    for (const part of String(raw).split(/[;,]/g)) {
        const value = part.trim().toLowerCase();
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}
async function createTicketMessageForUser(params) {
    const { id, user, payload } = params;
    const files = params.attachments ?? [];
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
                // Lo escribe un agente desde la intranet: siempre saliente, aunque
                // el envio del correo falle despues.
                direction: "OUTBOUND",
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
    // Adjuntos: se registran siempre, con url placeholder (van por correo,
    // todavia no se suben a Drive).
    if (files.length > 0) {
        try {
            await prisma_1.prisma.ticketAttachment.createMany({
                data: files.map((file) => ({
                    messageId: created.id,
                    filename: file.originalname,
                    mimeType: file.mimetype,
                    size: file.buffer?.length ?? 0,
                    url: `email://${created.id}/${file.originalname}`,
                })),
            });
        }
        catch (err) {
            console.error("createTicketMessageForUser attachments error:", err);
        }
    }
    // Los adjuntos se insertan despues del mensaje, asi que se releen para que
    // la respuesta ya los traiga y la UI pueda listarlos sin recargar el hilo.
    if (files.length > 0) {
        const withAttachments = await prisma_1.prisma.ticketMessage.findUnique({
            where: { id: created.id },
            include: exports.THREAD_MESSAGE_INCLUDE,
        });
        if (withAttachments)
            created = withAttachments;
    }
    const mapped = mapThreadMessage(created);
    // Las notas internas nunca salen por correo.
    if (payload.type === client_1.TicketMessageType.INTERNAL_NOTE) {
        await recordTicketEvent({
            ticketId: ticket.id_ticket,
            type: "NOTA_INTERNA",
            actorTrabajadorId: auth.id_trabajador,
            meta: { messageId: created.id },
        });
        return { message: mapped, emailStatus: "SKIPPED", emailError: null };
    }
    const mailbox = process.env.TICKETS_MAILBOX;
    const destinatarios = splitEmailList(toEmail);
    if (!mailbox || destinatarios.length === 0) {
        return {
            message: mapped,
            emailStatus: "FAILED",
            emailError: !mailbox
                ? "Falta TICKETS_MAILBOX en el entorno"
                : "No hay destinatario para el correo",
        };
    }
    const authorName = auth.email;
    const subjectToSend = payload.type === client_1.TicketMessageType.FORWARD
        ? subject || `Fwd: ${ticket.subject ?? "Sin asunto"}`
        : ticket.subject?.startsWith("Re:")
            ? ticket.subject
            : `Re: ${ticket.subject ?? "Sin asunto"}`;
    try {
        const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
            fromUserEmail: mailbox,
            fromName: "Soporte Cintax",
            to: destinatarios.join(", "),
            cc: cc ?? undefined,
            bcc: bcc ?? undefined,
            subject: subjectToSend,
            bodyText: withSignature(bodyText, authorName),
            attachments: files.map((file) => ({
                filename: file.originalname,
                mimeType: file.mimetype,
                content: file.buffer,
            })),
            replyTo: mailbox,
            threadId: ticket.gmailThreadId ?? undefined,
        });
        const gmailMessageId = sendRes?.id ?? null;
        const threadId = sendRes?.threadId ?? null;
        // Primer envio del ticket: queda enganchado al hilo de Gmail.
        if (threadId && !ticket.gmailThreadId) {
            await prisma_1.prisma.ticket.update({
                where: { id_ticket: ticket.id_ticket },
                data: { gmailThreadId: threadId },
            });
        }
        await prisma_1.prisma.ticketMessage.update({
            where: { id: created.id },
            data: { gmailMessageId, subject: subjectToSend },
        });
        // Primera respuesta publica: marca el SLA de primera respuesta.
        if (payload.type === client_1.TicketMessageType.PUBLIC_REPLY &&
            !ticket.firstResponseAt) {
            await prisma_1.prisma.ticket.update({
                where: { id_ticket: ticket.id_ticket },
                data: { firstResponseAt: new Date() },
            });
        }
        await recordTicketEvent({
            ticketId: ticket.id_ticket,
            type: payload.type === client_1.TicketMessageType.FORWARD
                ? "CORREO_REENVIADO"
                : "CORREO_ENVIADO",
            actorTrabajadorId: auth.id_trabajador,
            meta: { messageId: created.id, to: destinatarios },
        });
        return {
            message: { ...mapped, subject: subjectToSend },
            emailStatus: "SENT",
            emailError: null,
        };
    }
    catch (err) {
        // El mensaje ya quedo guardado: se informa el fallo sin perderlo.
        console.error("createTicketMessageForUser send error:", err);
        return {
            message: mapped,
            emailStatus: "FAILED",
            emailError: err instanceof Error ? err.message : "Error enviando correo",
        };
    }
}
async function updateTicketForUser(params) {
    const { id, user, estado, prioridad, categoria, trabajadorId, tags, areaDetected, clienteId, } = params;
    const ctx = await (0, ticketAccess_1.getUserContext)(prisma_1.prisma, user);
    if (!ctx)
        return null;
    const ticket = await prisma_1.prisma.ticket.findFirst({
        where: { id_ticket: id },
        include: { trabajador: { select: { areaInterna: true } } },
    });
    if (!ticket)
        return null;
    const enforcedArea = (0, ticketAccess_1.enforceArea)(ctx, "all");
    if (!ctx.isAdmin && !ticketMatchesEffectiveArea(ticket, enforcedArea.effectiveArea, false)) {
        return null;
    }
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
    if (tags !== undefined) {
        data.tags = normalizeTags(tags);
    }
    if (areaDetected !== undefined) {
        data.areaAsignada = (0, ticketRouting_1.areaFromDetected)(areaDetected);
    }
    if (clienteId !== undefined) {
        data.clienteId = clienteId;
    }
    // Timestamps de SLA derivados del cambio de estado.
    const nuevoEstado = typeof data.estado === "string" ? data.estado : null;
    if (nuevoEstado === "RESUELTO" || nuevoEstado === "CERRADO") {
        if (!ticket.resolvedAt)
            data.resolvedAt = new Date();
    }
    else if (nuevoEstado && ticket.resolvedAt) {
        // Si se reabre, se limpia la marca de resolucion.
        data.resolvedAt = null;
    }
    if (Object.keys(data).length === 0)
        return ticket;
    const updated = await prisma_1.prisma.ticket.update({
        where: { id_ticket: id },
        data,
    });
    // Auditoria: un evento por cada cambio relevante.
    if (nuevoEstado && nuevoEstado !== ticket.estado) {
        await recordTicketEvent({
            ticketId: id,
            type: "ESTADO_CAMBIADO",
            actorTrabajadorId: ctx.userId,
            meta: { de: ticket.estado, a: nuevoEstado },
        });
    }
    if (trabajadorId !== undefined && trabajadorId !== ticket.trabajadorId) {
        await recordTicketEvent({
            ticketId: id,
            type: "AGENTE_ASIGNADO",
            actorTrabajadorId: ctx.userId,
            meta: { de: ticket.trabajadorId, a: trabajadorId },
        });
    }
    if (areaDetected !== undefined &&
        data.areaAsignada !== ticket.areaAsignada) {
        await recordTicketEvent({
            ticketId: id,
            type: "AREA_CAMBIADA",
            actorTrabajadorId: ctx.userId,
            meta: { de: ticket.areaAsignada, a: data.areaAsignada },
        });
    }
    return updated;
}
/** Normaliza tags que pueden venir como array o como string separado por comas. */
function normalizeTags(raw) {
    if (raw === null || raw === undefined)
        return [];
    const list = Array.isArray(raw) ? raw : String(raw).split(",");
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const value = String(item ?? "").trim();
        if (!value)
            continue;
        const key = value.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}
/**
 * Registra un evento de auditoria del ticket.
 * Nunca hace fallar la operacion principal: si el insert falla, solo se loguea.
 */
async function recordTicketEvent(params) {
    try {
        await prisma_1.prisma.ticketEvent.create({
            data: {
                ticketId: params.ticketId,
                type: params.type,
                actorTrabajadorId: params.actorTrabajadorId ?? null,
                meta: params.meta ?? client_1.Prisma.JsonNull,
            },
        });
    }
    catch (err) {
        console.error("recordTicketEvent error:", err);
    }
}
async function getTicketEventsForUser(id, user) {
    const access = await getTicketForAccess(id, user);
    if (!access)
        return null;
    const events = await prisma_1.prisma.ticketEvent.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: "asc" },
        include: {
            actor: { select: { id_trabajador: true, nombre: true, email: true } },
        },
    });
    return events.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.createdAt.toISOString(),
        actor: event.actor ?? null,
        payload: event.meta ?? null,
    }));
}
/**
 * Crea un ticket manual (POST /api/tickets).
 * El area sale de areaDetected; si no viene, del area del agente asignado.
 */
async function createTicketForUser(params) {
    const { user, payload, requestId } = params;
    const ctx = await (0, ticketAccess_1.getUserContext)(prisma_1.prisma, user);
    if (!ctx)
        return null;
    const auth = (0, ticketAccess_1.getAuthTrabajador)(user);
    const subject = String(payload.subject ?? "").trim();
    const description = String(payload.description ?? "").trim();
    if (!subject)
        throw new Error("El asunto es obligatorio");
    if (!description)
        throw new Error("La descripcion es obligatoria");
    const requesterEmail = normalizeOptionalString(payload.requesterEmail) ?? auth?.email ?? "";
    let areaAsignada = (0, ticketRouting_1.areaFromDetected)(payload.areaDetected);
    // Sin area explicita, se hereda la del agente asignado.
    if (!areaAsignada && payload.trabajadorId) {
        const agente = await prisma_1.prisma.trabajador.findUnique({
            where: { id_trabajador: payload.trabajadorId },
            select: { areaInterna: true },
        });
        areaAsignada = agente?.areaInterna ?? null;
    }
    // Y si tampoco hay agente, la del propio creador.
    if (!areaAsignada)
        areaAsignada = ctx.areaInterna;
    // El RUT puede venir explicito o escrito dentro de la descripcion, que es
    // como llega hoy desde el modal de creacion (no tiene selector de cliente).
    const rutCliente = normalizeOptionalString(payload.rutCliente) ??
        (0, rut_1.findRutInText)(`${subject} ${description}`);
    const clienteId = await resolveClienteIdByRut(rutCliente);
    const created = await prisma_1.prisma.ticket.create({
        data: {
            subject,
            description,
            categoria: normalizeOptionalString(payload.categoria) ?? "",
            estado: "ABIERTO",
            prioridad: payload.prioridad === undefined || payload.prioridad === null
                ? 2
                : normalizePrioridadInput(payload.prioridad) ?? 2,
            requesterEmail,
            trabajadorId: payload.trabajadorId ?? null,
            areaAsignada,
            clienteId,
            tags: normalizeTags(payload.tags),
            source: client_1.TicketSource.MANUAL,
        },
        include: { trabajador: { select: { areaInterna: true } } },
    });
    await recordTicketEvent({
        ticketId: created.id_ticket,
        type: "TICKET_CREADO",
        actorTrabajadorId: ctx.userId,
        meta: { source: "MANUAL" },
    });
    (0, tickets_logger_1.logTicketInfo)({
        action: "tickets_create",
        requestId,
        userId: ctx.userId,
        role: ctx.role,
        meta: { ticketId: created.id_ticket, areaAsignada },
    });
    const resolved = (0, ticketRouting_1.resolveTicketArea)(created);
    const row = {
        id: created.id_ticket,
        number: created.id_ticket,
        subject: created.subject,
        requester: created.requesterEmail || "Sin correo",
        requesterEmail: created.requesterEmail || "Sin correo",
        preview: buildPreview(created.description),
        group: toGroupLabel(created.categoria),
        areaDetected: (0, ticketRouting_1.areaToDetected)(created.areaAsignada ?? null),
        areaSlug: resolved?.slug ?? null,
        areaLabel: resolved?.name ?? null,
        categoria: created.categoria ?? null,
        tags: created.tags ?? [],
        trabajadorId: created.trabajadorId ?? null,
        status: toStatusLabel(created.estado),
        priority: toPriorityLabel(created.prioridad),
        createdAt: created.createdAt.toISOString(),
    };
    return row;
}
/** Busca el Cliente por RUT, tolerando los formatos que conviven en la base. */
async function resolveClienteIdByRut(rut) {
    const candidates = (0, rut_1.rutCandidates)(rut);
    if (candidates.length === 0)
        return null;
    const cliente = await prisma_1.prisma.cliente.findFirst({
        where: { rut: { in: candidates } },
        select: { id: true },
    });
    return cliente?.id ?? null;
}
//# sourceMappingURL=tickets.service.js.map