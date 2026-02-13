import { Prisma, TicketMessageType } from "@prisma/client";
import type { AuthJwtPayload } from "../../middlewares/auth.middleware";
import { prisma } from "../../lib/prisma";
import type {
  TicketGroup,
  TicketRow,
  TicketMessage,
  TicketDetail,
  TicketThreadMessage,
} from "./dto";
import {
  enforceArea,
  getAuthTrabajador,
  getUserContext,
  isAdmin,
} from "./access/ticketAccess";
import {
  areaFromSlug,
  resolveTicketArea,
} from "./routing/ticketRouting";
import { logTicketInfo } from "./tickets.logger";

function buildStatusWhere(status: string): Prisma.TicketWhereInput | null {
  const key = status.trim().toLowerCase();
  const map: Record<string, string[]> = {
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
  if (!values) return null;

  return {
    OR: values.map((value) => ({
      estado: { equals: value, mode: "insensitive" },
    })),
  };
}

function buildPriorityWhere(priority: string): Prisma.TicketWhereInput | null {
  const key = priority.trim().toLowerCase();
  const map: Record<string, number> = {
    baja: 1,
    media: 2,
    alta: 3,
    urgente: 4,
  };

  const value = map[key];
  if (!value) return null;

  return { prioridad: value };
}

function toStatusLabel(raw: string | null | undefined): string {
  const rawStr = String(raw ?? "").trim();
  const rawLower = rawStr.toLowerCase();
  const rawNum = Number(rawStr);

  if (rawNum === 3) return "Pendiente";
  if (rawNum === 4) return "Resuelto";
  if (rawNum === 5) return "Cerrado";
  if (rawNum === 6 || rawNum === 7) return "Pendiente";

  if (["open", "abierto", "abierta"].includes(rawLower)) return "Abierto";
  if (["resolved", "resuelto"].includes(rawLower)) return "Resuelto";
  if (["closed", "cerrado"].includes(rawLower)) return "Cerrado";
  if (rawLower.includes("pendiente")) return "Pendiente";

  return "Abierto";
}

function normalizeEstadoInput(raw: string): string {
  const key = String(raw ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
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

function toPriorityLabel(raw: number | null | undefined): string {
  if (raw === 4) return "Urgente";
  if (raw === 3) return "Alta";
  if (raw === 2) return "Media";
  if (raw === 1) return "Baja";
  return "Media";
}

function normalizePrioridadInput(raw: string | number): number | null {
  if (typeof raw === "number") {
    if (Number.isInteger(raw) && raw >= 1 && raw <= 4) return raw;
    return null;
  }

  const key = String(raw ?? "").trim().toLowerCase();
  const map: Record<string, number> = {
    baja: 1,
    media: 2,
    alta: 3,
    urgente: 4,
  };

  if (map[key]) return map[key];

  const parsed = Number(key);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 4) return parsed;
  return null;
}

function toGroupLabel(categoria: string | null | undefined): string {
  return categoria || "Sin grupo";
}

function buildPreview(description: string | null | undefined): string {
  const text = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function normalizeOptionalString(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function getSlaHours() {
  const parse = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  };

  return {
    firstResponse: parse(process.env.SLA_FIRST_RESPONSE_HOURS, 24),
    resolution: parse(process.env.SLA_RESOLUTION_HOURS, 72),
  };
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function stripHtmlToText(raw: string) {
  const html = String(raw ?? "");
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n");
  const withoutScripts = withBreaks
    .replace(/<\s*script[^>]*>[\s\S]*?<\/\s*script\s*>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\/\s*style\s*>/gi, "");
  const withoutTags = withoutScripts.replace(/<[^>]*>/g, "");
  return withoutTags.replace(/\s+/g, " ").trim();
}

export function coerceMessageType(
  raw: string
): TicketMessageType | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (value === "PUBLIC_REPLY") return TicketMessageType.PUBLIC_REPLY;
  if (value === "INTERNAL_NOTE") return TicketMessageType.INTERNAL_NOTE;
  if (value === "FORWARD") return TicketMessageType.FORWARD;
  return null;
}

export class TicketMessagesNotReadyError extends Error {
  constructor() {
    super("TicketMessage table is not available");
    this.name = "TicketMessagesNotReadyError";
  }
}

function isMissingTicketMessageTable(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2021") return false;
  const table = String((err.meta as { table?: string } | undefined)?.table ?? "");
  return table.includes("TicketMessage");
}

const REPLIES_MARKER = "\n\n[[TICKET_REPLIES]]\n";

type StoredReply = {
  id: string;
  authorId: number | null;
  authorEmail: string;
  body: string;
  createdAt: string;
};

function splitDescription(raw: string | null) {
  const description = raw ?? "";
  const markerIndex = description.indexOf(REPLIES_MARKER);
  if (markerIndex === -1) {
    return { base: description, replies: [] as StoredReply[] };
  }

  const base = description.slice(0, markerIndex);
  const jsonPart = description.slice(markerIndex + REPLIES_MARKER.length);
  if (!jsonPart.trim()) {
    return { base, replies: [] as StoredReply[] };
  }

  try {
    const parsed = JSON.parse(jsonPart);
    if (Array.isArray(parsed)) {
      return { base, replies: parsed as StoredReply[] };
    }
  } catch {
    // ignore parsing errors
  }

  return { base, replies: [] as StoredReply[] };
}

async function getTicketForAccess(
  id: number,
  user?: AuthJwtPayload
) {
  const ctx = await getUserContext(prisma, user);
  if (!ctx) return null;
  const auth = getAuthTrabajador(user);
  if (!auth) return null;

  const ticket = await prisma.ticket.findFirst({
    where: { id_ticket: id },
    include: { trabajador: { select: { areaInterna: true } } },
  });

  if (!ticket) return null;

  const enforcedArea = enforceArea(ctx, "all");
  if (!ctx.isAdmin && !ticketMatchesEffectiveArea(ticket, enforcedArea.effectiveArea, false)) {
    return null;
  }

  return { ticket, auth, admin: ctx.isAdmin, areaInterna: ctx.areaInterna };
}

function mapThreadMessage(row: {
  id: number;
  type: TicketMessageType;
  toEmail: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  createdAt: Date;
  author: { id_trabajador: number; nombre: string; email: string } | null;
}): TicketThreadMessage {
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

function ticketMatchesEffectiveArea(
  ticket: {
    trabajador?: { areaInterna?: unknown } | null;
    subject?: string | null;
    description?: string | null;
  },
  effectiveArea: string,
  isAdminUser: boolean
) {
  const resolved = resolveTicketArea(ticket as any);

  if (effectiveArea === "all") {
    if (isAdminUser) return true;
    return Boolean(resolved);
  }

  return Boolean(resolved && resolved.slug === effectiveArea);
}

export async function getGroupsForUser(params: {
  user?: AuthJwtPayload;
  requestId?: string;
}) {
  const { user, requestId } = params;
  const ctx = await getUserContext(prisma, user);
  if (!ctx) {
    return { totalAll: 0, groups: [] as TicketGroup[] };
  }

  const candidates = await prisma.ticket.findMany({
    include: { trabajador: { select: { areaInterna: true } } },
  });

  const allCount = candidates.filter((ticket) =>
    ticketMatchesEffectiveArea(
      ticket,
      ctx.isAdmin ? "all" : ctx.userAreaSlug ?? "all",
      ctx.isAdmin
    )
  ).length;

  const groups = ctx.allowedAreas.map((slug) => {
    if (slug === "all") {
      return { slug: "all", name: "Todos", count: allCount };
    }

    const area = areaFromSlug(slug);
    const count = candidates.filter((ticket) =>
      ticketMatchesEffectiveArea(ticket, slug, ctx.isAdmin)
    ).length;

    return {
      slug,
      name: area?.name ?? slug,
      count,
    };
  });

  logTicketInfo({
    action: "tickets_groups",
    requestId,
    userId: ctx.userId,
    role: ctx.role,
    meta: {
      isAdmin: ctx.isAdmin,
      areaInterna: ctx.areaInterna,
      allowedAreas: ctx.allowedAreas,
      groupsCount: groups.length,
      counts: groups.map((g) => ({ slug: g.slug, count: g.count })),
    },
  });

  return {
    totalAll: allCount,
    groups,
  };
}

export async function getTicketsForUser(params: {
  user?: AuthJwtPayload;
  area?: string;
  q?: string;
  status?: string;
  priority?: string;
  requestId?: string;
}) {
  const { user, area, q, status, priority, requestId } = params;
  const ctx = await getUserContext(prisma, user);
  if (!ctx) return [] as TicketRow[];

  const forcedArea = enforceArea(ctx, area);
  if (!forcedArea.effectiveArea) return [] as TicketRow[];

  const filters: Prisma.TicketWhereInput[] = [];

  if (q && q.trim()) {
    const search = q.trim();
    const orFilters: Prisma.TicketWhereInput[] = [
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
    if (statusWhere) filters.push(statusWhere);
  }

  if (priority) {
    const priorityWhere = buildPriorityWhere(priority);
    if (priorityWhere) filters.push(priorityWhere);
  }

  const where = filters.length > 0 ? { AND: filters } : undefined;

  const rows = await prisma.ticket.findMany({
    where,
    include: { trabajador: { select: { areaInterna: true } } },
    orderBy: { createdAt: "desc" },
  });

  const requestedArea = forcedArea.requestedArea;
  const effectiveArea = forcedArea.effectiveArea;

  const results: TicketRow[] = [];
  rows.forEach((ticket) => {
    if (!ticketMatchesEffectiveArea(ticket, effectiveArea, ctx.isAdmin)) return;
    const resolved = resolveTicketArea(ticket);

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

  logTicketInfo({
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
    },
  });

  return results;
}
export async function getInboxForUser(params: {
  user?: AuthJwtPayload;
  area?: string;
  q?: string;
  status?: string;
  priority?: string;
  limit?: number;
  requestId?: string;
}) {
  const { user, area, q, status, priority, limit = 20, requestId } = params;
  const ctx = await getUserContext(prisma, user);
  if (!ctx) return [] as TicketRow[];

  const forcedArea = enforceArea(ctx, area);
  if (!forcedArea.effectiveArea) return [] as TicketRow[];

  const filters: Prisma.TicketWhereInput[] = [];

  if (q && q.trim()) {
    const search = q.trim();
    const orFilters: Prisma.TicketWhereInput[] = [
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
    if (statusWhere) filters.push(statusWhere);
  }

  if (priority) {
    const priorityWhere = buildPriorityWhere(priority);
    if (priorityWhere) filters.push(priorityWhere);
  }

  const where = filters.length > 0 ? { AND: filters } : undefined;

  const rows = await prisma.ticket.findMany({
    where,
    include: { trabajador: { select: { areaInterna: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const requestedArea = forcedArea.requestedArea;
  const effectiveArea = forcedArea.effectiveArea;

  const results: TicketRow[] = [];
  rows.forEach((ticket) => {
    if (!ticketMatchesEffectiveArea(ticket, effectiveArea, ctx.isAdmin)) return;
    const resolved = resolveTicketArea(ticket);

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

  logTicketInfo({
    action: "tickets_inbox",
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
    },
  });

  return results;
}
export async function getInboxDiagnosticForAdmin(params: {
  user?: AuthJwtPayload;
  limit?: number;
}) {
  const { user, limit = 20 } = params;
  const auth = getAuthTrabajador(user);
  if (!auth || !isAdmin(auth)) return null;

  const totalTickets = await prisma.ticket.count();
  const latest = await prisma.ticket.findMany({
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

export async function getTicketAgentsForUser(params: {
  user?: AuthJwtPayload;
  requestId?: string;
}) {
  const { user, requestId } = params;
  const auth = getAuthTrabajador(user);
  if (!auth) return [];

  if (!["ADMIN", "SUPERVISOR", "AGENTE"].includes(auth.role)) {
    return [];
  }

  const agents = await prisma.trabajador.findMany({
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

  logTicketInfo({
    action: "tickets_agents_list",
    requestId,
    userId: auth.id_trabajador,
    role: auth.role,
    meta: { count: agents.length },
  });

  return agents;
}

export async function getTicketDetailForUser(
  id: number,
  user?: AuthJwtPayload
) {
  const access = await getTicketForAccess(id, user);
  if (!access) return null;
  const { ticket } = access;

  const { base, replies } = splitDescription(ticket.description);

  let dbMessages: Array<{
    id: number;
    type: TicketMessageType;
    toEmail: string | null;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    createdAt: Date;
    author: { id_trabajador: number; nombre: string; email: string } | null;
  }> = [];

  try {
    dbMessages = await prisma.ticketMessage.findMany({
      where: { ticketId: ticket.id_ticket },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: { id_trabajador: true, nombre: true, email: true },
        },
      },
    });
  } catch (err) {
    if (!isMissingTicketMessageTable(err)) {
      throw err;
    }
    console.warn(
      "TicketMessage table missing, returning legacy thread only."
    );
    dbMessages = [];
  }

  let hasFirstPublicReply = false;
  try {
    const firstReply = await prisma.ticketMessage.findFirst({
      where: { ticketId: ticket.id_ticket, type: TicketMessageType.PUBLIC_REPLY },
      select: { id: true },
    });
    hasFirstPublicReply = Boolean(firstReply);
  } catch (err) {
    if (!isMissingTicketMessageTable(err)) {
      throw err;
    }
    hasFirstPublicReply = false;
  }

  const slaHours = getSlaHours();
  const firstResponseDueAt = addHours(
    ticket.createdAt,
    slaHours.firstResponse
  ).toISOString();
  const resolutionDueAt = addHours(
    ticket.createdAt,
    slaHours.resolution
  ).toISOString();
  const normalizedEstado = normalizeEstadoInput(ticket.estado);
  const resolutionStatus = normalizedEstado === "CERRADO" ? "OK" : "PENDIENTE";
  const firstResponseStatus = hasFirstPublicReply ? "OK" : "PENDIENTE";

  const legacyReplies = replies.map((reply) => ({
    id: reply.id,
    authorEmail: reply.authorEmail || "sin-correo@cintax.cl",
    body: reply.body,
    createdAt: reply.createdAt,
    kind: "reply" as const,
  }));

  const dbReplies = dbMessages.map((msg) => ({
    id: `db-${msg.id}`,
    authorEmail: msg.author?.email || "sistema@cintax.cl",
    body: msg.bodyText || stripHtmlToText(msg.bodyHtml || ""),
    createdAt: msg.createdAt.toISOString(),
    kind: "reply" as const,
  }));

  const mergedReplies = [...legacyReplies, ...dbReplies].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return aTime - bTime;
  });

  const messages: TicketMessage[] = [
    {
      id: `requester-${ticket.id_ticket}`,
      authorEmail: ticket.requesterEmail || "sin-correo@cintax.cl",
      body: base || "Sin descripcion.",
      createdAt: ticket.createdAt.toISOString(),
      kind: "requester",
    },
    ...mergedReplies,
  ];

  const detail: TicketDetail = {
    id: ticket.id_ticket,
    number: ticket.freshdeskId ?? ticket.id_ticket,
    subject: ticket.subject || "Sin asunto",
    description: base,
    requesterEmail: ticket.requesterEmail || "Sin correo",
    group: toGroupLabel(ticket.categoria),
    categoria: ticket.categoria ?? null,
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

  return { ticket: detail, messages };
}

export type CreateTicketMessageInput = {
  type: TicketMessageType;
  toEmail?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  bodyHtml: string;
};

export async function getTicketMessagesForUser(
  id: number,
  user?: AuthJwtPayload
) {
  const access = await getTicketForAccess(id, user);
  if (!access) return null;

  let rows: Array<{
    id: number;
    type: TicketMessageType;
    toEmail: string | null;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    createdAt: Date;
    author: { id_trabajador: number; nombre: string; email: string } | null;
  }> = [];

  try {
    rows = await prisma.ticketMessage.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: { id_trabajador: true, nombre: true, email: true },
        },
      },
    });
  } catch (err) {
    if (!isMissingTicketMessageTable(err)) {
      throw err;
    }
    console.warn("TicketMessage table missing, returning empty list.");
    rows = [];
  }

  return rows.map((row) =>
    mapThreadMessage({
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
    })
  );
}

export async function createTicketMessageForUser(params: {
  id: number;
  user?: AuthJwtPayload;
  payload: CreateTicketMessageInput;
}) {
  const { id, user, payload } = params;
  const access = await getTicketForAccess(id, user);
  if (!access) return null;
  const { ticket, auth } = access;

  const toEmailRaw = normalizeOptionalString(payload.toEmail);
  const cc = normalizeOptionalString(payload.cc);
  const bcc = normalizeOptionalString(payload.bcc);
  const subjectRaw = normalizeOptionalString(payload.subject);

  const toEmail =
    payload.type === TicketMessageType.PUBLIC_REPLY && !toEmailRaw
      ? ticket.requesterEmail || null
      : toEmailRaw;

  const subject =
    payload.type === TicketMessageType.FORWARD && !subjectRaw
      ? `Fwd: ${ticket.subject || "Sin asunto"}`
      : subjectRaw;

  const bodyHtml = String(payload.bodyHtml ?? "").trim();
  const bodyText = stripHtmlToText(bodyHtml);
  if (!bodyText) {
    throw new Error("Mensaje vacio o sin contenido util");
  }

  let created: {
    id: number;
    type: TicketMessageType;
    toEmail: string | null;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    createdAt: Date;
    author: { id_trabajador: number; nombre: string; email: string } | null;
  };

  try {
    created = await prisma.ticketMessage.create({
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
  } catch (err) {
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

export async function updateTicketForUser(params: {
  id: number;
  user?: AuthJwtPayload;
  estado?: string;
  prioridad?: string | number | null;
  categoria?: string | null;
  trabajadorId?: number | null;
}) {
  const { id, user, estado, prioridad, categoria, trabajadorId } = params;
  const ctx = await getUserContext(prisma, user);
  if (!ctx) return null;

  const ticket = await prisma.ticket.findFirst({
    where: { id_ticket: id },
    include: { trabajador: { select: { areaInterna: true } } },
  });
  if (!ticket) return null;

  const enforcedArea = enforceArea(ctx, "all");
  if (!ctx.isAdmin && !ticketMatchesEffectiveArea(ticket, enforcedArea.effectiveArea, false)) {
    return null;
  }

  const data: Prisma.TicketUncheckedUpdateInput = {};

  if (estado && estado.trim()) {
    data.estado = normalizeEstadoInput(estado);
  }

  if (prioridad !== undefined) {
    if (prioridad === null || prioridad === "") data.prioridad = null;
    else {
      const value = normalizePrioridadInput(prioridad);
      if (value !== null) data.prioridad = value;
    }
  }

  if (categoria !== undefined) {
    if (categoria === null) {
      data.categoria = "";
    } else {
      const normalizedCategoria = String(categoria).trim();
      if (normalizedCategoria) {
        data.categoria = normalizedCategoria;
      }
    }
  }

  if (trabajadorId !== undefined) {
    data.trabajadorId = trabajadorId;
  }

  if (Object.keys(data).length === 0) return ticket;

  return prisma.ticket.update({
    where: { id_ticket: id },
    data,
  });
}



