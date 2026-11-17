// src/controllers/mailbox.controller.ts
//
// ====================================================================
// CODIGO DESMONTADO — NO SE EJECUTA (desde 2026-11-13)
// ====================================================================
// Webmail crudo de la casilla de soporte, anterior a la ticketera. Su router
// esta comentado en `src/routes.ts`, asi que ninguna de estas funciones
// corre: `/api/mailbox/*` responde 404.
//
// Importa si llegaste buscando `markThreadAsRead`: la llamada de mas abajo
// **no se ejecuta**. La unica ingesta viva es
// `src/modules/tickets/email/ingestInbox.ts`, que por defecto no marca nada.
// ====================================================================

import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  listTicketThreads,
  getTicketThread,
  parseGmailMessage,
  markThreadAsRead,
  sendEmailAsUser,        //  NUEVO
} from "../services/gmailDelegated.service";

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** =========================
 * Helpers email/threading
 * ========================= */

function extractEmailFromHeader(v?: string | null) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/<([^>]+)>/);
  if (m?.[1]) return m[1].trim();
  const m2 = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m2?.[0]?.trim() ?? (s.includes("@") ? s : null);
}

function uniqEmailList(...lists: Array<Array<string | null | undefined>>) {
  const set = new Set<string>();
  for (const list of lists) {
    for (const v of list) {
      const e = (v ?? "").trim();
      if (!e) continue;
      set.add(e);
    }
  }
  return Array.from(set);
}

function normalizeEmailList(input?: string | null): string[] {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => extractEmailFromHeader(s) ?? s)
    .filter(Boolean);
}

function pickClientEmailFromThread(thread: any, allowedDomain: string) {
  const msgs = thread?.messages ?? [];
  for (const raw of msgs) {
    const p = parseGmailMessage(raw);
    const from = extractEmailFromHeader(p.from);
    if (!from) continue;
    if (!from.toLowerCase().endsWith(`@${allowedDomain}`)) return from;
  }
  // fallback: último from
  const last = msgs[msgs.length - 1];
  if (!last) return null;
  return extractEmailFromHeader(parseGmailMessage(last).from);
}

function getLastThreadHeaders(thread: any) {
  const msgs = thread?.messages ?? [];
  if (!msgs.length) return { subject: null as string | null, inReplyTo: null as string | null, references: null as string | null };

  const last = msgs[msgs.length - 1];
  const parsed = parseGmailMessage(last);

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
export const listMailboxThreads = async (req: Request, res: Response) => {
  try {
    const qBase = (req.query.q as string) || "in:inbox";
    const unreadOnly = String(req.query.unreadOnly ?? "").toLowerCase() === "true";
    const includeSpamTrash =
      String(req.query.includeSpamTrash ?? "").toLowerCase() === "true";

    // includeSpamTrash: usa in:anywhere (incluye spam/trash)
    const base = includeSpamTrash ? qBase.replace(/\bin:inbox\b/g, "in:anywhere") : qBase;

    const q = unreadOnly ? `${base} is:unread` : base;

    const maxResults = clampInt(req.query.max ?? 10, 10, 1, 50);
    const pageToken =
      typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;

    const data = await listTicketThreads({
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
  } catch (err: any) {
    console.error("listMailboxThreads error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
  }
};

/** =========================
 *  GET /mailbox/threads/:threadId
 * ========================= */
export const getMailboxThread = async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const markRead = String(req.query.markRead ?? "").toLowerCase() === "true";
    const raw = String(req.query.raw ?? "").toLowerCase() === "true";

    const thread = await getTicketThread(threadId);
    const parsed = (thread.messages ?? []).map(parseGmailMessage);

    const messages = parsed
      .map((m, i) => ({ ...m, index: i }))
      .sort((a, b) => {
        const da = a.date ? Date.parse(a.date) : NaN;
        const db = b.date ? Date.parse(b.date) : NaN;
        if (!Number.isFinite(da) || !Number.isFinite(db)) return a.index - b.index;
        return da - db;
      });

    if (markRead) {
      try {
        await markThreadAsRead(threadId);
      } catch (e) {
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
  } catch (err: any) {
    console.error("getMailboxThread error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
  }
};

/** =========================
 *  POST /mailbox/threads/:threadId/reply
 *  (Responder desde agente, CC soporte+agente, Reply-To soporte)
 * ========================= */
export const replyMailboxThread = async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const { bodyText, cc } = req.body as { bodyText: string; cc?: string };

    if (!threadId) {
      return res.status(400).json({ ok: false, error: "threadId es obligatorio" });
    }
    if (!bodyText?.trim()) {
      return res.status(400).json({ ok: false, error: "bodyText es obligatorio" });
    }

    const fromUserEmail = (req as any).user?.email as string | undefined;
    const trabajadorIdRaw =
      (req as any).user?.id ?? (req as any).user?.id_trabajador ?? null;

    if (!fromUserEmail) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const trabajadorId =
      trabajadorIdRaw !== null && trabajadorIdRaw !== undefined
        ? Number(trabajadorIdRaw)
        : null;

    const mailbox = process.env.TICKETS_MAILBOX; // soporte@cintax.cl
    if (!mailbox) {
      return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
    }

    const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";

    // 1) Trae thread desde soporte
    const thread = await getTicketThread(threadId);

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
    const files = (req.files as Express.Multer.File[]) ?? [];
    const attachments = files.map((f) => ({
      filename: f.originalname,
      mimeType: f.mimetype,
      content: f.buffer,
    }));

    // 6) Enviar como agente
    const sendRes = await sendEmailAsUser({
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

    const gmailMessageId = (sendRes as any)?.id ?? null;

    // 7) (opcional) guardar en BD como TicketMessage asociado al ticket por gmailThreadId
    //    Si el ticket no existe todavía, no fallamos: solo respondemos por correo.
    try {
      const ticket = await (prisma as any).ticket.findFirst({
        where: { gmailThreadId: threadId },
      });

      if (ticket?.id_ticket) {
        // Si luego agregas columnas messageIdHeader/references/etc. puedes guardarlas aquí.
        await (prisma as any).ticketMessage.create({
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
    } catch (e) {
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
  } catch (err: any) {
    console.error("replyMailboxThread error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Error" });
  }
};
