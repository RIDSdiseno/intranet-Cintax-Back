import { Area } from "@prisma/client";

export type TicketArea = {
  area: Area;
  slug: string;
  name: string;
};

const AREA_UI_MAP: Record<Area, TicketArea> = {
  CONTA: { area: Area.CONTA, slug: "contabilidad", name: "Contabilidad" },
  RRHH: { area: Area.RRHH, slug: "recursos-humanos", name: "Recursos Humanos" },
  TRIBUTARIO: {
    area: Area.TRIBUTARIO,
    slug: "comercial-y-marketing",
    name: "Comercial y Marketing",
  },
  ADMIN: { area: Area.ADMIN, slug: "admin", name: "Admin" },
};

const DEFAULT_KEYWORDS: Record<Area, string[]> = {
  CONTA: ["factura", "pago", "f29", "rcv", "contabilidad"],
  RRHH: ["rrhh", "recursos humanos", "contrato", "vacaciones"],
  TRIBUTARIO: ["tributario", "impuestos", "marketing", "comercial"],
  ADMIN: [],
};

const CATEGORIA_MAP: Array<{ area: Area; values: string[] }> = [
  {
    area: Area.CONTA,
    values: ["conta", "contabilidad", "contable", "administrativo"],
  },
  {
    area: Area.RRHH,
    values: ["rrhh", "recursos humanos", "recursos-humanos", "personas"],
  },
  {
    area: Area.TRIBUTARIO,
    values: [
      "tributario",
      "tributaria",
      "comercial",
      "marketing",
      "comercial y marketing",
      "comercial-y-marketing",
      "ventas",
    ],
  },
  {
    area: Area.ADMIN,
    values: ["admin", "administracion", "gerencia"],
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function loadEmailMap(): Record<string, Area> {
  const raw = process.env.TICKETS_AREA_EMAIL_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Area>;
    const out: Record<string, Area> = {};
    Object.entries(parsed).forEach(([email, area]) => {
      if (!email || !area) return;
      out[normalize(email)] = area;
    });
    return out;
  } catch {
    return {};
  }
}

const EMAIL_MAP = loadEmailMap();

function resolveByEmail(destinations: string[]): TicketArea | null {
  for (const email of destinations) {
    const area = EMAIL_MAP[normalize(email)];
    if (area && AREA_UI_MAP[area]) return AREA_UI_MAP[area];
  }
  return null;
}

function resolveByCategoria(categoria?: string | null): TicketArea | null {
  const normalized = normalize(String(categoria ?? ""));
  if (!normalized) return null;

  const directEnum = normalized.toUpperCase() as Area;
  if (AREA_UI_MAP[directEnum]) return AREA_UI_MAP[directEnum];

  for (const entry of CATEGORIA_MAP) {
    if (entry.values.some((value) => normalized === value)) {
      return AREA_UI_MAP[entry.area];
    }
  }

  return null;
}

function resolveByKeywords(subject?: string | null, description?: string | null) {
  const text = `${subject ?? ""} ${description ?? ""}`.toLowerCase();
  if (!text.trim()) return null;

  const entries = Object.entries(DEFAULT_KEYWORDS) as Array<[Area, string[]]>;
  for (const [area, keywords] of entries) {
    if (!keywords.length) continue;
    if (keywords.some((keyword) => text.includes(keyword))) {
      return AREA_UI_MAP[area];
    }
  }
  return null;
}

function getDestinationEmails(ticket: Record<string, unknown>): string[] {
  const candidates = [
    "toEmail",
    "to_email",
    "recipientEmail",
    "recipient",
    "inbox",
    "inboxEmail",
    "destinatario",
    "destinatarioEmail",
  ];

  const emails: string[] = [];
  for (const key of candidates) {
    const value = ticket[key];
    if (typeof value === "string" && value.trim()) {
      emails.push(value);
    }
  }

  return emails;
}

export function resolveTicketArea(ticket: {
  trabajador?: { areaInterna?: Area | null } | null;
  categoria?: string | null;
  subject?: string | null;
  description?: string | null;
  [key: string]: unknown;
}): TicketArea | null {
  const areaInterna = ticket.trabajador?.areaInterna ?? null;
  if (areaInterna && AREA_UI_MAP[areaInterna]) {
    return AREA_UI_MAP[areaInterna];
  }

  const byCategoria = resolveByCategoria(ticket.categoria ?? null);
  if (byCategoria) return byCategoria;

  const byEmail = resolveByEmail(getDestinationEmails(ticket as Record<string, unknown>));
  if (byEmail) return byEmail;

  const byKeywords = resolveByKeywords(ticket.subject ?? null, ticket.description ?? null);
  if (byKeywords) return byKeywords;

  return null;
}

export function getAreaChips(): TicketArea[] {
  return [AREA_UI_MAP.CONTA, AREA_UI_MAP.RRHH, AREA_UI_MAP.TRIBUTARIO];
}

export function areaFromSlug(slug: string) {
  return getAreaChips().find((area) => area.slug === slug) || null;
}

export function areaToSlug(area?: Area | null) {
  if (!area) return null;
  return AREA_UI_MAP[area]?.slug ?? null;
}
