"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncMailboxInbox = exports.replyMailboxThread = exports.getMailboxThread = exports.listMailboxThreads = void 0;
const prisma_1 = require("../lib/prisma");
const gmailDelegated_service_1 = require("../services/gmailDelegated.service");
function clampInt(v, def, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return def;
    return Math.max(min, Math.min(max, Math.trunc(n)));
}
/** =========================
 * Helpers email/threading
 * ========================= */
function extractEmailFromHeader(v) {
    if (!v)
        return null;
    const s = String(v).trim();
    const m = s.match(/<([^>]+)>/);
    if (m?.[1])
        return m[1].trim();
    const m2 = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m2?.[0]?.trim() ?? (s.includes("@") ? s : null);
}
function uniqEmailList(...lists) {
    const set = new Set();
    for (const list of lists) {
        for (const v of list) {
            const e = (v ?? "").trim();
            if (!e)
                continue;
            set.add(e);
        }
    }
    return Array.from(set);
}
function normalizeEmailList(input) {
    if (!input)
        return [];
    return String(input)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => extractEmailFromHeader(s) ?? s)
        .filter(Boolean);
}
function pickClientEmailFromThread(thread, allowedDomain) {
    const msgs = thread?.messages ?? [];
    for (const raw of msgs) {
        const p = (0, gmailDelegated_service_1.parseGmailMessage)(raw);
        const from = extractEmailFromHeader(p.from);
        if (!from)
            continue;
        if (!from.toLowerCase().endsWith(`@${allowedDomain}`))
            return from;
    }
    // fallback: último from
    const last = msgs[msgs.length - 1];
    if (!last)
        return null;
    return extractEmailFromHeader((0, gmailDelegated_service_1.parseGmailMessage)(last).from);
}
function getLastThreadHeaders(thread) {
    const msgs = thread?.messages ?? [];
    if (!msgs.length)
        return { subject: null, inReplyTo: null, references: null };
    const last = msgs[msgs.length - 1];
    const parsed = (0, gmailDelegated_service_1.parseGmailMessage)(last);
    // Para threading real: In-Reply-To debería ser Message-ID del último mail
    const inReplyTo = parsed.messageIdHeader ?? null;
    // References: mantener las existentes o al menos el Message-ID base
    const references = parsed.references ?? parsed.messageIdHeader ?? null;
    const subject = parsed.subject ?? null;
    return { subject, inReplyTo, references };
}
/** =========================
 *  GET /mailbox/threads
 * ========================= */
const listMailboxThreads = async (req, res) => {
    try {
        const qBase = req.query.q || "in:inbox";
        const unreadOnly = String(req.query.unreadOnly ?? "").toLowerCase() === "true";
        const includeSpamTrash = String(req.query.includeSpamTrash ?? "").toLowerCase() === "true";
        // ✅ includeSpamTrash: usa in:anywhere (incluye spam/trash)
        const base = includeSpamTrash ? qBase.replace(/\bin:inbox\b/g, "in:anywhere") : qBase;
        const q = unreadOnly ? `${base} is:unread` : base;
        const maxResults = clampInt(req.query.max ?? 10, 10, 1, 50);
        const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
        const data = await (0, gmailDelegated_service_1.listTicketThreads)({
            q,
            maxResults,
            pageToken,
        });
        return res.json({
            ok: true,
            q,
            maxResults,
            includeSpamTrash,
            ...data,
        });
    }
    catch (err) {
        console.error("listMailboxThreads error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
    }
};
exports.listMailboxThreads = listMailboxThreads;
/** =========================
 *  GET /mailbox/threads/:threadId
 * ========================= */
const getMailboxThread = async (req, res) => {
    try {
        const { threadId } = req.params;
        const markRead = String(req.query.markRead ?? "").toLowerCase() === "true";
        const raw = String(req.query.raw ?? "").toLowerCase() === "true";
        const thread = await (0, gmailDelegated_service_1.getTicketThread)(threadId);
        const parsed = (thread.messages ?? []).map(gmailDelegated_service_1.parseGmailMessage);
        const messages = parsed
            .map((m, i) => ({ ...m, index: i }))
            .sort((a, b) => {
            const da = a.date ? Date.parse(a.date) : NaN;
            const db = b.date ? Date.parse(b.date) : NaN;
            if (!Number.isFinite(da) || !Number.isFinite(db))
                return a.index - b.index;
            return da - db;
        });
        if (markRead) {
            try {
                await (0, gmailDelegated_service_1.markThreadAsRead)(threadId);
            }
            catch (e) {
                console.warn("[getMailboxThread] No se pudo marcar como leído:", e);
            }
        }
        return res.json({
            ok: true,
            threadId,
            messagesCount: messages.length,
            messages,
            ...(raw ? { thread } : {}),
        });
    }
    catch (err) {
        console.error("getMailboxThread error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
    }
};
exports.getMailboxThread = getMailboxThread;
/** =========================
 *  POST /mailbox/threads/:threadId/reply
 *  (Responder desde agente, CC soporte+agente, Reply-To soporte)
 * ========================= */
const replyMailboxThread = async (req, res) => {
    try {
        const { threadId } = req.params;
        const { bodyText, cc } = req.body;
        if (!threadId) {
            return res.status(400).json({ ok: false, error: "threadId es obligatorio" });
        }
        if (!bodyText?.trim()) {
            return res.status(400).json({ ok: false, error: "bodyText es obligatorio" });
        }
        const fromUserEmail = req.user?.email;
        const trabajadorIdRaw = req.user?.id ?? req.user?.id_trabajador ?? null;
        if (!fromUserEmail) {
            return res.status(401).json({ ok: false, error: "No autenticado" });
        }
        const trabajadorId = trabajadorIdRaw !== null && trabajadorIdRaw !== undefined
            ? Number(trabajadorIdRaw)
            : null;
        const mailbox = process.env.TICKETS_MAILBOX; // soporte@cintax.cl
        if (!mailbox) {
            return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
        }
        const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";
        // 1) Trae thread desde soporte
        const thread = await (0, gmailDelegated_service_1.getTicketThread)(threadId);
        // 2) Determina cliente (destinatario)
        const to = pickClientEmailFromThread(thread, allowedDomain);
        if (!to) {
            return res.status(400).json({
                ok: false,
                error: "No se pudo determinar el email del cliente desde el thread",
            });
        }
        // 3) Threading headers
        const { subject: lastSubject, inReplyTo, references } = getLastThreadHeaders(thread);
        const subjectBase = lastSubject || `Ticket ${threadId}`;
        const subject = subjectBase.toLowerCase().startsWith("re:")
            ? subjectBase
            : `Re: ${subjectBase}`;
        // 4) CC: soporte + agente + cc extra si llega
        const ccReq = normalizeEmailList(cc);
        const ccFinal = uniqEmailList([mailbox], [fromUserEmail], ccReq).join(", ");
        // 5) Adjuntos
        const files = req.files ?? [];
        const attachments = files.map((f) => ({
            filename: f.originalname,
            mimeType: f.mimetype,
            content: f.buffer,
        }));
        // 6) Enviar como agente
        const sendRes = await (0, gmailDelegated_service_1.sendEmailAsUser)({
            fromUserEmail,
            to,
            cc: ccFinal,
            subject,
            bodyText,
            attachments,
            replyTo: mailbox,
            inReplyTo: inReplyTo ?? undefined,
            references: references ?? undefined,
            // threadId: NO, porque threadId de soporte no sirve en el buzón del agente
        });
        const gmailMessageId = sendRes?.id ?? null;
        // 7) (opcional) guardar en BD como TicketMessage asociado al ticket por gmailThreadId
        //    Si el ticket no existe todavía, no fallamos: solo respondemos por correo.
        try {
            const ticket = await prisma_1.prisma.ticket.findFirst({
                where: { gmailThreadId: threadId },
            });
            if (ticket?.id_ticket) {
                // Si luego agregas columnas messageIdHeader/references/etc. puedes guardarlas aquí.
                await prisma_1.prisma.ticketMessage.create({
                    data: {
                        ticketId: ticket.id_ticket,
                        authorTrabajadorId: trabajadorId,
                        type: "PUBLIC_REPLY",
                        direction: "OUTBOUND",
                        gmailMessageId,
                        subject,
                        bodyHtml: "",
                        bodyText,
                        toEmail: to,
                        cc: ccFinal,
                    },
                });
            }
        }
        catch (e) {
            // no crítico
            console.warn("[replyMailboxThread] No se pudo registrar TicketMessage:", e);
        }
        return res.status(201).json({
            ok: true,
            threadId,
            to,
            ccFinal,
            replyTo: mailbox,
            gmail: sendRes,
        });
    }
    catch (err) {
        console.error("replyMailboxThread error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
    }
};
exports.replyMailboxThread = replyMailboxThread;
/** =========================
 *  POST /mailbox/sync
 * ========================= */
const syncMailboxInbox = async (req, res) => {
    try {
        const days = Number(req.query.days ?? 7);
        const unreadOnly = String(req.query.unreadOnly ?? "true").toLowerCase() === "true";
        const markRead = String(req.query.markRead ?? "true").toLowerCase() === "true";
        const maxThreads = Math.max(1, Math.min(50, Number(req.query.maxThreads ?? 25)));
        const qParts = [`in:inbox`, `newer_than:${Number.isFinite(days) ? days : 7}d`];
        if (unreadOnly)
            qParts.push("is:unread");
        const q = qParts.join(" ");
        const { threads } = await (0, gmailDelegated_service_1.listTicketThreads)({ q, maxResults: maxThreads });
        const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";
        let scannedThreads = 0;
        let matchedTickets = 0;
        let createdMessages = 0;
        let skippedMessages = 0;
        let skippedThreadsNoTicket = 0;
        for (const th of threads ?? []) {
            const threadId = th.id;
            if (!threadId)
                continue;
            scannedThreads++;
            const ticket = await prisma_1.prisma.ticket.findFirst({
                where: { gmailThreadId: threadId },
            });
            if (!ticket?.id_ticket) {
                skippedThreadsNoTicket++;
                continue;
            }
            matchedTickets++;
            const thread = await (0, gmailDelegated_service_1.getTicketThread)(threadId);
            const msgs = (thread.messages ?? []).map(gmailDelegated_service_1.parseGmailMessage);
            for (const m of msgs) {
                const gmailMessageId = m.gmailId ?? null;
                if (gmailMessageId) {
                    try {
                        const exists = await prisma_1.prisma.ticketMessage.findFirst({
                            where: { gmailMessageId },
                        });
                        if (exists) {
                            skippedMessages++;
                            continue;
                        }
                    }
                    catch {
                        // si no existe campo/tabla, sigue
                    }
                }
                // Heurística dirección según dominio interno
                const fromEmail = extractEmailFromHeader(m.from) ?? (m.from ?? "");
                const fromLower = String(fromEmail).toLowerCase();
                const direction = fromLower.endsWith(`@${allowedDomain}`) ? "OUTBOUND" : "INBOUND";
                try {
                    await prisma_1.prisma.ticketMessage.create({
                        data: {
                            ticketId: ticket.id_ticket,
                            type: "PUBLIC_REPLY",
                            direction,
                            gmailMessageId,
                            subject: m.subject ?? ticket.subject ?? "",
                            bodyText: m.bodyText ?? "",
                            bodyHtml: m.bodyHtml ?? "",
                            toEmail: m.to ?? null,
                            cc: m.cc ?? null,
                            // tu schema no tiene fromEmail, etc. (si lo agregas, aquí se completa)
                        },
                    });
                    createdMessages++;
                }
                catch {
                    try {
                        await prisma_1.prisma.ticketMessage.create({
                            data: {
                                ticketId: ticket.id_ticket,
                                type: "PUBLIC_REPLY",
                                subject: m.subject ?? ticket.subject ?? "",
                                bodyText: m.bodyText ?? "",
                                bodyHtml: m.bodyHtml ?? "",
                            },
                        });
                        createdMessages++;
                    }
                    catch {
                        skippedMessages++;
                    }
                }
            }
            if (markRead) {
                try {
                    await (0, gmailDelegated_service_1.markThreadAsRead)(threadId);
                }
                catch {
                    // no crítico
                }
            }
        }
        return res.json({
            ok: true,
            q,
            scannedThreads,
            matchedTickets,
            skippedThreadsNoTicket,
            createdMessages,
            skippedMessages,
        });
    }
    catch (err) {
        console.error("syncMailboxInbox error:", err);
        return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
    }
};
exports.syncMailboxInbox = syncMailboxInbox;
