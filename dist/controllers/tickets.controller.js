"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyTicketByEmail = exports.createEmailTicket = void 0;
const prisma_1 = require("../lib/prisma");
const gmailDelegated_service_1 = require("../services/gmailDelegated.service");
/** Helpers */
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
    return (fullName && String(fullName).trim()) ? String(fullName).trim() : fallbackEmail;
}
function withSignature(body, authorName) {
    const cleanBody = String(body ?? "").trim();
    const signature = `\n\n--\n${authorName}\nSoporte Cintax`;
    return cleanBody + signature;
}
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
        // ✅ Ticket se asigna SOLO en backend (no se elige grupo/agent en UI)
        const ticket = await prisma_1.prisma.ticket.create({
            data: {
                subject,
                description: bodyText.slice(0, 5000),
                categoria: categoria ?? "GENERAL",
                estado: "open",
                prioridad: null,
                requesterEmail,
                // ✅ agente (asignado) = actor
                trabajadorId: actorId,
                // ✅ grupo = area del actor
                areaAsignada: actorArea,
                // ✅ origen
                source: "EMAIL",
            },
        });
        // Enviar desde soporte, mostrar nombre del actor, y copiar al actor para registro interno
        const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
            fromUserEmail: mailbox,
            fromName,
            to,
            cc: actorEmail, // copia al actor (interno)
            subject,
            bodyText: bodyWithSig,
            attachments,
            replyTo: mailbox,
        });
        const threadId = sendRes?.threadId ?? null;
        const gmailMessageId = sendRes?.id ?? null;
        // Guardar threadId del buzón soporte
        if (threadId) {
            await prisma_1.prisma.ticket.update({
                where: { id_ticket: ticket.id_ticket },
                data: { gmailThreadId: threadId },
            });
        }
        // Guardar TicketMessage OUTBOUND con author = actor
        let messageIdHeader = null;
        let referencesHeader = null;
        try {
            if (gmailMessageId) {
                const rawMsg = await (0, gmailDelegated_service_1.getMessageAsUser)(mailbox, gmailMessageId);
                const parsed = (0, gmailDelegated_service_1.parseGmailMessage)(rawMsg);
                messageIdHeader = parsed.messageIdHeader ?? null;
                referencesHeader = parsed.references ?? null;
            }
        }
        catch { }
        await prisma_1.prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id_ticket,
                authorTrabajadorId: actorId,
                type: "PUBLIC_REPLY",
                direction: "OUTBOUND",
                gmailMessageId,
                subject,
                bodyHtml: "",
                bodyText: bodyWithSig,
                // Opcional si agregaste columnas:
                // messageIdHeader,
                // references: referencesHeader,
                // toEmail: to,
                // cc: actorEmail,
            },
        });
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
        // ✅ Auto-asignación: al responder, el ticket queda asignado al actor y a su grupo
        await prisma_1.prisma.ticket.update({
            where: { id_ticket: ticket.id_ticket },
            data: {
                trabajadorId: actorId,
                areaAsignada: actorArea,
            },
        });
        // Threading básico: usa threadId si existe
        const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
            fromUserEmail: mailbox,
            fromName,
            to: ticket.requesterEmail,
            cc: actorEmail, // copia al actor
            subject,
            bodyText: bodyWithSig,
            attachments,
            replyTo: mailbox,
            threadId: ticket.gmailThreadId ?? undefined,
        });
        const gmailMessageId = sendRes?.id ?? null;
        await prisma_1.prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id_ticket,
                authorTrabajadorId: actorId,
                type: "PUBLIC_REPLY",
                direction: "OUTBOUND",
                gmailMessageId,
                subject,
                bodyHtml: "",
                bodyText: bodyWithSig,
            },
        });
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
