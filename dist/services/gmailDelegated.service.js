"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailAsUser = sendEmailAsUser;
exports.listTicketThreads = listTicketThreads;
exports.getTicketThread = getTicketThread;
exports.markThreadAsRead = markThreadAsRead;
exports.parseGmailMessage = parseGmailMessage;
exports.getMessageAsUser = getMessageAsUser;
// src/services/gmailDelegated.service.ts
const googleapis_1 = require("googleapis");
require("dotenv/config");
/**
 * IMPORTANTE
 * - Para ticketera, idealmente usa GOOGLE_GMAIL_CLIENT_EMAIL / GOOGLE_GMAIL_PRIVATE_KEY
 * - Si aún estás usando GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY, esto igual funciona.
 *   (Puedes migrar después sin romper nada.)
 */
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_GMAIL_CLIENT_EMAIL ?? process.env.GOOGLE_CLIENT_EMAIL;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_GMAIL_PRIVATE_KEY ?? process.env.GOOGLE_PRIVATE_KEY;
const ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";
const TICKETS_MAILBOX = process.env.TICKETS_MAILBOX;
if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_KEY) {
    throw new Error("Faltan GOOGLE_GMAIL_CLIENT_EMAIL/GOOGLE_GMAIL_PRIVATE_KEY (o GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY)");
}
const GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
];
// Normaliza la key por si viene con \\n
function getPrivateKey() {
    return SERVICE_ACCOUNT_KEY.replace(/\\n/g, "\n");
}
// Crea un cliente Gmail impersonando a un usuario @cintax.cl
function getDelegatedGmail(userEmail) {
    if (!userEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
        throw new Error(`Solo se pueden impersonar usuarios del dominio ${ALLOWED_DOMAIN}`);
    }
    const jwtClient = new googleapis_1.google.auth.JWT({
        email: SERVICE_ACCOUNT_EMAIL,
        key: getPrivateKey(),
        scopes: GMAIL_SCOPES,
        subject: userEmail, // usuario que impersonamos
    });
    return googleapis_1.google.gmail({
        version: "v1",
        auth: jwtClient,
    });
}
/** =========================
 *  Helpers seguros (headers + MIME)
 *  ========================= */
// evita CRLF injection en headers (To/Cc/Subject/etc.)
function sanitizeHeaderValue(v) {
    return String(v ?? "").replace(/(\r|\n)/g, " ").trim();
}
// RFC 2045: base64 envuelto a 76 chars (mejor compatibilidad)
function chunk76(b64) {
    return b64.replace(/.{1,76}/g, (m) => m + "\r\n").trim();
}
// RFC 2047 para Subject con tildes/ñ/etc.
function encodeSubjectUtf8(subject) {
    const clean = sanitizeHeaderValue(subject);
    const base64 = Buffer.from(clean, "utf-8").toString("base64");
    return `=?UTF-8?B?${base64}?=`;
}
// filename seguro en headers (por ahora sanitiza; si necesitas RFC2231 después, lo agregamos)
function safeFilename(name) {
    return sanitizeHeaderValue(name).replace(/"/g, "'");
}
/**
 * Construye un From válido:
 * - si no hay fromName => "correo@dominio"
 * - si hay fromName    => "Nombre Visible <correo@dominio>"
 */
function buildFromHeader(fromUserEmail, fromName) {
    const email = sanitizeHeaderValue(fromUserEmail);
    const name = sanitizeHeaderValue(fromName ?? "");
    if (!name)
        return email;
    return `${name} <${email}>`;
}
async function sendEmailAsUser({ fromUserEmail, fromName, // ✅ NUEVO
to, cc, 
// bcc, // (no usar en raw)
subject, bodyText, attachments = [], replyTo, threadId, inReplyTo, references, }) {
    const gmail = getDelegatedGmail(fromUserEmail);
    const boundary = "cintax_boundary_" + Date.now().toString(16);
    const fromHeader = buildFromHeader(fromUserEmail, fromName);
    const lines = [
        // ✅ From con nombre visible
        `From: ${fromHeader}`,
        // ✅ Sender recomendado (mejor compatibilidad con algunos clientes)
        `Sender: ${sanitizeHeaderValue(fromUserEmail)}`,
        `To: ${sanitizeHeaderValue(to)}`,
        ...(cc ? [`Cc: ${sanitizeHeaderValue(cc)}`] : []),
        // ✅ Subject correcto con UTF-8 (tildes / ñ)
        `Subject: ${encodeSubjectUtf8(subject)}`,
        "MIME-Version: 1.0",
        // ✅ clave: que las respuestas vayan a soporte@...
        ...(replyTo ? [`Reply-To: ${sanitizeHeaderValue(replyTo)}`] : []),
        // ✅ headers de reply para mantener conversación (cuando respondas en thread)
        ...(inReplyTo ? [`In-Reply-To: ${sanitizeHeaderValue(inReplyTo)}`] : []),
        ...(references ? [`References: ${sanitizeHeaderValue(references)}`] : []),
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 7bit",
        "",
        bodyText || "",
    ];
    for (const att of attachments) {
        const filename = safeFilename(att.filename);
        const base64Content = chunk76(att.content.toString("base64"));
        lines.push("", `--${boundary}`, `Content-Type: ${sanitizeHeaderValue(att.mimeType)}; name="${filename}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${filename}"`, "", base64Content);
    }
    lines.push("", `--${boundary}--`, "");
    const message = lines.join("\r\n");
    const encodedMessage = Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: encodedMessage,
            ...(threadId ? { threadId } : {}),
        },
    });
    return res.data; // contiene id, threadId, labelIds, etc.
}
/** =========================
 *  Ticket mailbox helpers
 *  ========================= */
function getTicketsGmail() {
    if (!TICKETS_MAILBOX)
        throw new Error("Falta TICKETS_MAILBOX en .env");
    return getDelegatedGmail(TICKETS_MAILBOX);
}
/** =========================
 *  Listar / leer threads (ticketera)
 *  ========================= */
async function listTicketThreads(params) {
    const gmail = getTicketsGmail();
    const res = await gmail.users.threads.list({
        userId: "me",
        q: params?.q ?? "in:inbox",
        maxResults: params?.maxResults ?? 10,
        pageToken: params?.pageToken,
    });
    return {
        threads: res.data.threads ?? [],
        nextPageToken: res.data.nextPageToken ?? null,
        resultSizeEstimate: res.data.resultSizeEstimate ?? 0,
    };
}
async function getTicketThread(threadId) {
    const gmail = getTicketsGmail();
    const res = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
    });
    return res.data;
}
async function markThreadAsRead(threadId) {
    const gmail = getTicketsGmail();
    const res = await gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: { removeLabelIds: ["UNREAD"] },
    });
    return res.data;
}
/** =========================
 *  Parsing helpers (body + headers)
 *  ========================= */
function getHeader(headers, name) {
    const h = (headers ?? []).find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
    return h?.value ?? null;
}
function decodeBase64Url(data) {
    if (!data)
        return "";
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return Buffer.from(b64 + pad, "base64").toString("utf-8");
}
function findBodyPart(payload, mime) {
    if (!payload)
        return null;
    if (payload.mimeType === mime && payload.body?.data) {
        return decodeBase64Url(payload.body.data);
    }
    const parts = payload.parts ?? [];
    for (const p of parts) {
        const found = findBodyPart(p, mime);
        if (found)
            return found;
    }
    return null;
}
function parseGmailMessage(msg) {
    const headers = msg.payload?.headers ?? [];
    const subject = getHeader(headers, "Subject");
    const from = getHeader(headers, "From");
    const to = getHeader(headers, "To");
    const cc = getHeader(headers, "Cc");
    const date = getHeader(headers, "Date");
    const messageIdHeader = getHeader(headers, "Message-ID");
    const inReplyTo = getHeader(headers, "In-Reply-To");
    const references = getHeader(headers, "References");
    const replyTo = getHeader(headers, "Reply-To");
    const bodyText = findBodyPart(msg.payload, "text/plain") ?? "";
    const bodyHtml = findBodyPart(msg.payload, "text/html") ?? "";
    return {
        gmailId: msg.id ?? null,
        threadId: msg.threadId ?? null,
        snippet: msg.snippet ?? null,
        subject,
        from,
        to,
        cc,
        replyTo,
        date,
        messageIdHeader,
        inReplyTo,
        references,
        bodyText,
        bodyHtml,
    };
}
async function getMessageAsUser(fromUserEmail, messageId) {
    const gmail = getDelegatedGmail(fromUserEmail);
    const res = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
    });
    return res.data;
}
