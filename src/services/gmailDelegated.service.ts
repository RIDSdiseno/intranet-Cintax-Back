// src/services/gmailDelegated.service.ts
import { google } from "googleapis";
import "dotenv/config";

/**
 * IMPORTANTE
 * - Para ticketera, idealmente usa GOOGLE_GMAIL_CLIENT_EMAIL / GOOGLE_GMAIL_PRIVATE_KEY
 * - Si aún estás usando GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY, esto igual funciona.
 *   (Puedes migrar después sin romper nada.)
 */
const SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_GMAIL_CLIENT_EMAIL ?? process.env.GOOGLE_CLIENT_EMAIL;

const SERVICE_ACCOUNT_KEY =
  process.env.GOOGLE_GMAIL_PRIVATE_KEY ?? process.env.GOOGLE_PRIVATE_KEY;

const ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";
const TICKETS_MAILBOX = process.env.TICKETS_MAILBOX;

if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_KEY) {
  throw new Error(
    "Faltan GOOGLE_GMAIL_CLIENT_EMAIL/GOOGLE_GMAIL_PRIVATE_KEY (o GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY)"
  );
}

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

// Normaliza la key por si viene con \\n
function getPrivateKey(): string {
  return SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n");
}

// Crea un cliente Gmail impersonando a un usuario @cintax.cl
function getDelegatedGmail(userEmail: string) {
  if (!userEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new Error(
      `Solo se pueden impersonar usuarios del dominio ${ALLOWED_DOMAIN}`
    );
  }

  const jwtClient = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: getPrivateKey(),
    scopes: GMAIL_SCOPES,
    subject: userEmail, // usuario que impersonamos
  });

  return google.gmail({
    version: "v1",
    auth: jwtClient,
  });
}

/** =========================
 *  Tipos
 *  ========================= */
export type AttachmentInput = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

/** =========================
 *  Helpers seguros (headers + MIME)
 *  ========================= */

// evita CRLF injection en headers (To/Cc/Subject/etc.)
function sanitizeHeaderValue(v: string) {
  return String(v ?? "").replace(/(\r|\n)/g, " ").trim();
}

// RFC 2045: base64 envuelto a 76 chars (mejor compatibilidad)
function chunk76(b64: string) {
  return b64.replace(/.{1,76}/g, (m) => m + "\r\n").trim();
}

// RFC 2047 para Subject con tildes/ñ/etc.
function encodeSubjectUtf8(subject: string) {
  const clean = sanitizeHeaderValue(subject);
  const base64 = Buffer.from(clean, "utf-8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

// filename seguro en headers (por ahora sanitiza; si necesitas RFC2231 después, lo agregamos)
function safeFilename(name: string) {
  return sanitizeHeaderValue(name).replace(/"/g, "'");
}

/**
 * Construye un From válido:
 * - si no hay fromName => "correo@dominio"
 * - si hay fromName    => "Nombre Visible <correo@dominio>"
 */
function buildFromHeader(fromUserEmail: string, fromName?: string) {
  const email = sanitizeHeaderValue(fromUserEmail);
  const name = sanitizeHeaderValue(fromName ?? "");
  if (!name) return email;
  return `${name} <${email}>`;
}

/** =========================
 *  Enviar correo como usuario (delegado)
 *  ========================= */
export type SendDelegatedEmailParams = {
  fromUserEmail: string;

  // ✅ NUEVO: nombre visible del remitente (display name)
  // Ej: "Soporte Cintax — Juan Pérez"
  fromName?: string;

  to: string;
  cc?: string;

  // ⚠️ Recomendación: NO enviar Bcc como header en raw (puede filtrarse).
  // Si lo necesitas sí o sí, lo conversamos y lo implementamos con cuidado.
  bcc?: string;

  subject: string;
  bodyText: string;
  attachments?: AttachmentInput[];

  // ✅ Para que el cliente responda SIEMPRE a soporte
  replyTo?: string;

  // ✅ para mantener conversación en un thread
  threadId?: string;
  inReplyTo?: string; // Message-ID header del email previo
  references?: string; // References header del thread
};

export async function sendEmailAsUser({
  fromUserEmail,
  fromName, // ✅ NUEVO
  to,
  cc,
  // bcc, // (no usar en raw)
  subject,
  bodyText,
  attachments = [],
  replyTo,
  threadId,
  inReplyTo,
  references,
}: SendDelegatedEmailParams) {
  const gmail = getDelegatedGmail(fromUserEmail);

  const boundary = "cintax_boundary_" + Date.now().toString(16);

  const fromHeader = buildFromHeader(fromUserEmail, fromName);

  const lines: string[] = [
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

    lines.push(
      "",
      `--${boundary}`,
      `Content-Type: ${sanitizeHeaderValue(att.mimeType)}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      base64Content
    );
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
  if (!TICKETS_MAILBOX) throw new Error("Falta TICKETS_MAILBOX en .env");
  return getDelegatedGmail(TICKETS_MAILBOX);
}

/** =========================
 *  Listar / leer threads (ticketera)
 *  ========================= */
export async function listTicketThreads(params?: {
  q?: string;
  maxResults?: number;
  pageToken?: string;
}) {
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

export async function getTicketThread(threadId: string) {
  const gmail = getTicketsGmail();

  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  return res.data;
}

export async function markThreadAsRead(threadId: string) {
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
function getHeader(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string
) {
  const h = (headers ?? []).find(
    (x) => (x.name ?? "").toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? null;
}

function decodeBase64Url(data?: string | null) {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf-8");
}

function findBodyPart(payload: any, mime: string): string | null {
  if (!payload) return null;

  if (payload.mimeType === mime && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts ?? [];
  for (const p of parts) {
    const found = findBodyPart(p, mime);
    if (found) return found;
  }

  return null;
}

export function parseGmailMessage(msg: any) {
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

export async function getMessageAsUser(fromUserEmail: string, messageId: string) {
  const gmail = getDelegatedGmail(fromUserEmail);

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return res.data;
}
