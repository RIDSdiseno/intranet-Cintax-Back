import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  sendEmailAsUser,
  getMessageAsUser,
  parseGmailMessage,
} from "../services/gmailDelegated.service";

/** Helpers */
function extractFirstEmail(input: string): string | null {
  if (!input) return null;
  const first = input.split(",")[0]?.trim();
  if (!first) return null;

  const match = first.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();

  return first.includes("@") ? first : null;
}

function buildAuthorName(req: Request, fallbackEmail: string) {
  const fullName =
    ((req as any).user?.nombre as string | undefined) ||
    ((req as any).user?.full_name as string | undefined) ||
    ((req as any).user?.name as string | undefined);

  return (fullName && String(fullName).trim()) ? String(fullName).trim() : fallbackEmail;
}

function withSignature(body: string, authorName: string) {
  const cleanBody = String(body ?? "").trim();
  const signature = `\n\n--\n${authorName}\nSoporte Cintax`;
  return cleanBody + signature;
}

export const createEmailTicket = async (req: Request, res: Response) => {
  try {
    const { to, subject, bodyText, categoria } = req.body as {
      to: string;
      subject: string;
      bodyText: string;
      categoria?: string;
      cc?: string; // lo ignoramos para asignación; si quieres, lo puedes usar como CC externo
    };

    if (!to || !subject || !bodyText) {
      return res.status(400).json({
        ok: false,
        error: "to, subject y bodyText son obligatorios",
      });
    }

    const actorEmail = (req as any).user?.email as string | undefined;
    const actorIdRaw =
      (req as any).user?.id_trabajador ?? (req as any).user?.id ?? null;

    if (!actorEmail || !actorIdRaw) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const actorId = Number(actorIdRaw);
    const actorArea = ((req as any).user?.areaInterna ?? null) as
      | "CONTA"
      | "ADMIN"
      | "RRHH"
      | "TRIBUTARIO"
      | null;

    const mailbox = process.env.TICKETS_MAILBOX;
    if (!mailbox) {
      return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
    }

    const authorName = buildAuthorName(req, actorEmail);
    const fromName = `Soporte Cintax — ${authorName}`;
    const bodyWithSig = withSignature(bodyText, authorName);

    const files = (req.files as Express.Multer.File[]) ?? [];
    const attachments = files.map((f) => ({
      filename: f.originalname,
      mimeType: f.mimetype,
      content: f.buffer,
    }));

    const requesterEmail = extractFirstEmail(to) ?? to;

    // ✅ Ticket se asigna SOLO en backend (no se elige grupo/agent en UI)
    const ticket = await prisma.ticket.create({
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
    const sendRes = await sendEmailAsUser({
      fromUserEmail: mailbox,
      fromName,
      to,
      cc: actorEmail, // copia al actor (interno)
      subject,
      bodyText: bodyWithSig,
      attachments,
      replyTo: mailbox,
    });

    const threadId = (sendRes as any)?.threadId ?? null;
    const gmailMessageId = (sendRes as any)?.id ?? null;

    // Guardar threadId del buzón soporte
    if (threadId) {
      await prisma.ticket.update({
        where: { id_ticket: ticket.id_ticket },
        data: { gmailThreadId: threadId },
      });
    }

    // Guardar TicketMessage OUTBOUND con author = actor
    let messageIdHeader: string | null = null;
    let referencesHeader: string | null = null;

    try {
      if (gmailMessageId) {
        const rawMsg = await getMessageAsUser(mailbox, gmailMessageId);
        const parsed = parseGmailMessage(rawMsg);
        messageIdHeader = parsed.messageIdHeader ?? null;
        referencesHeader = parsed.references ?? null;
      }
    } catch {}

    await prisma.ticketMessage.create({
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
  } catch (err: any) {
    console.error("createEmailTicket error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
  }
};

export const replyTicketByEmail = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { bodyText } = req.body as { bodyText: string };

    if (!bodyText?.trim()) {
      return res.status(400).json({ ok: false, error: "bodyText es obligatorio" });
    }

    const actorEmail = (req as any).user?.email as string | undefined;
    const actorIdRaw =
      (req as any).user?.id_trabajador ?? (req as any).user?.id ?? null;

    if (!actorEmail || !actorIdRaw) {
      return res.status(401).json({ ok: false, error: "No autenticado" });
    }

    const actorId = Number(actorIdRaw);
    const actorArea = ((req as any).user?.areaInterna ?? null) as
      | "CONTA"
      | "ADMIN"
      | "RRHH"
      | "TRIBUTARIO"
      | null;

    const mailbox = process.env.TICKETS_MAILBOX;
    if (!mailbox) {
      return res.status(500).json({ ok: false, error: "Falta TICKETS_MAILBOX" });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id_ticket: Number(ticketId) },
    });

    if (!ticket) return res.status(404).json({ ok: false, error: "Ticket no encontrado" });
    if (!ticket.requesterEmail)
      return res.status(400).json({ ok: false, error: "Ticket sin requesterEmail" });

    const authorName = buildAuthorName(req, actorEmail);
    const fromName = `Soporte Cintax — ${authorName}`;
    const bodyWithSig = withSignature(bodyText, authorName);

    const files = (req.files as Express.Multer.File[]) ?? [];
    const attachments = files.map((f) => ({
      filename: f.originalname,
      mimeType: f.mimetype,
      content: f.buffer,
    }));

    const subject = ticket.subject?.startsWith("Re:") ? ticket.subject : `Re: ${ticket.subject}`;

    // ✅ Auto-asignación: al responder, el ticket queda asignado al actor y a su grupo
    await prisma.ticket.update({
      where: { id_ticket: ticket.id_ticket },
      data: {
        trabajadorId: actorId,
        areaAsignada: actorArea,
      },
    });

    // Threading básico: usa threadId si existe
    const sendRes = await sendEmailAsUser({
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

    const gmailMessageId = (sendRes as any)?.id ?? null;

    await prisma.ticketMessage.create({
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
  } catch (err: any) {
    console.error("replyTicketByEmail error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Error interno" });
  }
};
