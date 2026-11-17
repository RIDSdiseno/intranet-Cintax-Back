"use strict";
// src/modules/tickets/email/ingestInbox.ts
//
// Ingesta de correo -> tickets.
//
// Unico punto de ingesta: lee la bandeja de TICKETS_MAILBOX y sincroniza
// hilos -> tickets. El hilo que todavia no tiene ticket **crea uno**, que es
// lo que hace que la ticketera se alimente sola desde soporte@cintax.cl.
//
// Reemplaza al antiguo POST /api/mailbox/sync, que solo adjuntaba mensajes a
// tickets ya existentes (match por gmailThreadId) y descartaba lo demas.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestInbox = ingestInbox;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../lib/prisma");
const gmailDelegated_service_1 = require("../../../services/gmailDelegated.service");
const tickets_service_1 = require("../tickets.service");
const rut_1 = require("../../../utils/rut");
const tickets_logger_1 = require("../tickets.logger");
/** Extrae el correo de un header tipo `Nombre <mail@dominio.cl>`. */
function extractEmail(header) {
    const raw = String(header ?? "").trim();
    if (!raw)
        return null;
    const first = raw.split(",")[0]?.trim() ?? "";
    const match = first.match(/<([^>]+)>/);
    const candidate = (match?.[1] ?? first).trim().toLowerCase();
    return candidate.includes("@") ? candidate : null;
}
function isInternal(email, domain) {
    if (!email)
        return false;
    return email.endsWith(`@${domain}`);
}
/** Adivina el area a partir del destinatario (soporte-conta@, rrhh@, etc.). */
function areaFromRecipients(to, cc) {
    const haystack = `${to} ${cc}`.toLowerCase();
    if (/conta|contabilidad/.test(haystack))
        return client_1.Area.CONTA;
    if (/rrhh|recursos.?humanos|personas/.test(haystack))
        return client_1.Area.RRHH;
    if (/tributar|impuesto/.test(haystack))
        return client_1.Area.TRIBUTARIO;
    return null;
}
/**
 * Lee la bandeja de TICKETS_MAILBOX y sincroniza hilos -> tickets.
 * Es idempotente: deduplica por gmailThreadId y gmailMessageId.
 */
async function ingestInbox(options = {}) {
    const days = Number.isFinite(options.days) ? Number(options.days) : 7;
    // La ingesta NO toca la casilla de soporte salvo que se pida expresamente.
    // Marcar como leido es un efecto sobre el correo real de la empresa, visible
    // para quien lo lea desde Gmail y sin vuelta atras, y la sincronizacion no
    // necesita hacerlo para funcionar: la deduplicacion es por `gmailThreadId` y
    // `gmailMessageId` en la base, no por el estado leido/no leido del hilo.
    //
    // `unreadOnly` va amarrado al mismo flag a proposito. Son dos caras de una
    // sola estrategia: "no leido" solo sirve como criterio de busqueda si algo
    // despues marca los hilos como leidos. Sin eso, cada corrida volveria a
    // traer los mismos hilos viejos, llenaria el cupo de `maxThreads` y los
    // correos nuevos quedarian fuera. Apagados los dos, el criterio pasa a ser
    // "lo que entro en los ultimos N dias", que no se atasca.
    //
    // TICKETS_MARK_READ=true restaura el comportamiento anterior sin tocar
    // codigo. Los parametros explicitos de la llamada siguen mandando sobre todo
    // esto.
    const marcarLeidos = process.env.TICKETS_MARK_READ === "true";
    const unreadOnly = options.unreadOnly ?? marcarLeidos;
    const markRead = options.markRead ?? marcarLeidos;
    const maxThreads = Math.max(1, Math.min(50, Number(options.maxThreads) || 25));
    const domain = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";
    const mailbox = (process.env.TICKETS_MAILBOX || "").toLowerCase();
    const qParts = ["in:inbox", `newer_than:${days}d`];
    if (unreadOnly)
        qParts.push("is:unread");
    const { threads } = await (0, gmailDelegated_service_1.listTicketThreads)({
        q: qParts.join(" "),
        maxResults: maxThreads,
    });
    const result = {
        scannedThreads: 0,
        createdTickets: 0,
        updatedThreads: 0,
        createdMessages: 0,
        duplicates: 0,
        errors: 0,
    };
    for (const threadRef of threads ?? []) {
        const threadId = threadRef.id;
        if (!threadId)
            continue;
        result.scannedThreads++;
        try {
            const thread = await (0, gmailDelegated_service_1.getTicketThread)(threadId);
            const mensajes = (thread.messages ?? []).map(gmailDelegated_service_1.parseGmailMessage);
            if (mensajes.length === 0)
                continue;
            let ticket = await prisma_1.prisma.ticket.findFirst({
                where: { gmailThreadId: threadId },
            });
            // ---- Hilo nuevo: nace el ticket ----
            if (!ticket) {
                // El solicitante es el primer remitente externo del hilo.
                const primeroExterno = mensajes.find((m) => {
                    const from = extractEmail(m.from);
                    return from && from !== mailbox && !isInternal(from, domain);
                }) ?? mensajes[0];
                const requesterEmail = extractEmail(primeroExterno.from) ?? "desconocido@sin-correo.cl";
                const texto = `${primeroExterno.subject ?? ""} ${primeroExterno.bodyText ?? ""}`;
                // Solo se engancha el Cliente cuando el RUT aparece explicito en el
                // correo. Adivinar por dominio del remitente da falsos positivos
                // (dominios genericos, razones sociales parecidas) y en un CRM
                // asociar un ticket a la empresa equivocada es peor que no asociarlo:
                // el agente siempre puede asignarlo a mano despues.
                const clienteIdFinal = await (0, tickets_service_1.resolveClienteIdByRut)((0, rut_1.findRutInText)(texto));
                ticket = await prisma_1.prisma.ticket.create({
                    data: {
                        subject: primeroExterno.subject?.trim() || "(Sin asunto)",
                        description: primeroExterno.bodyText?.trim() ||
                            primeroExterno.snippet ||
                            "(Sin contenido)",
                        categoria: "",
                        estado: "ABIERTO",
                        prioridad: 2,
                        requesterEmail,
                        gmailThreadId: threadId,
                        source: client_1.TicketSource.EMAIL,
                        areaAsignada: areaFromRecipients(primeroExterno.to ?? "", primeroExterno.cc ?? ""),
                        clienteId: clienteIdFinal,
                    },
                });
                result.createdTickets++;
                await (0, tickets_service_1.recordTicketEvent)({
                    ticketId: ticket.id_ticket,
                    type: "TICKET_CREADO",
                    actorTrabajadorId: null,
                    meta: { source: "EMAIL", threadId, requesterEmail },
                });
            }
            else {
                result.updatedThreads++;
            }
            // ---- Mensajes del hilo ----
            for (const mensaje of mensajes) {
                const gmailMessageId = mensaje.gmailId ?? null;
                if (gmailMessageId) {
                    const yaExiste = await prisma_1.prisma.ticketMessage.findFirst({
                        where: { gmailMessageId },
                        select: { id: true },
                    });
                    if (yaExiste) {
                        result.duplicates++;
                        continue;
                    }
                }
                const fromEmail = extractEmail(mensaje.from);
                const direction = fromEmail && (fromEmail === mailbox || isInternal(fromEmail, domain))
                    ? "OUTBOUND"
                    : "INBOUND";
                await prisma_1.prisma.ticketMessage.create({
                    data: {
                        ticketId: ticket.id_ticket,
                        type: client_1.TicketMessageType.PUBLIC_REPLY,
                        direction,
                        gmailMessageId,
                        subject: mensaje.subject ?? ticket.subject,
                        bodyHtml: mensaje.bodyHtml || "",
                        bodyText: mensaje.bodyText || null,
                        toEmail: mensaje.to ?? null,
                        cc: mensaje.cc ?? null,
                    },
                });
                result.createdMessages++;
            }
            if (markRead) {
                try {
                    await (0, gmailDelegated_service_1.markThreadAsRead)(threadId);
                }
                catch {
                    // No es critico: el hilo ya quedo sincronizado.
                }
            }
        }
        catch (err) {
            result.errors++;
            console.error(`[tickets:ingest] Error en thread ${threadId}:`, err);
        }
    }
    (0, tickets_logger_1.logTicketInfo)({
        action: "tickets_email_ingest",
        requestId: options.requestId ?? null,
        userId: options.userId ?? null,
        meta: { ...result, days, unreadOnly, maxThreads },
    });
    return result;
}
//# sourceMappingURL=ingestInbox.js.map