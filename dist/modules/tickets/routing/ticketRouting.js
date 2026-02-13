"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTicketArea = resolveTicketArea;
exports.getAreaChips = getAreaChips;
exports.areaFromSlug = areaFromSlug;
const client_1 = require("@prisma/client");
const AREA_UI_MAP = {
    CONTA: { area: client_1.Area.CONTA, slug: "contabilidad", name: "Contabilidad" },
    RRHH: { area: client_1.Area.RRHH, slug: "recursos-humanos", name: "Recursos Humanos" },
    TRIBUTARIO: {
        area: client_1.Area.TRIBUTARIO,
        slug: "comercial-y-marketing",
        name: "Comercial y Marketing",
    },
    ADMIN: { area: client_1.Area.ADMIN, slug: "admin", name: "Admin" },
};
const DEFAULT_KEYWORDS = {
    CONTA: ["factura", "pago", "f29", "rcv", "contabilidad"],
    RRHH: ["rrhh", "recursos humanos", "contrato", "vacaciones"],
    TRIBUTARIO: ["tributario", "impuestos", "marketing", "comercial"],
    ADMIN: [],
};
function normalize(value) {
    return value.trim().toLowerCase();
}
function loadEmailMap() {
    const raw = process.env.TICKETS_AREA_EMAIL_MAP;
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        const out = {};
        Object.entries(parsed).forEach(([email, area]) => {
            if (!email || !area)
                return;
            out[normalize(email)] = area;
        });
        return out;
    }
    catch {
        return {};
    }
}
const EMAIL_MAP = loadEmailMap();
function resolveByEmail(destinations) {
    for (const email of destinations) {
        const area = EMAIL_MAP[normalize(email)];
        if (area && AREA_UI_MAP[area])
            return AREA_UI_MAP[area];
    }
    return null;
}
function resolveByKeywords(subject, description) {
    const text = `${subject ?? ""} ${description ?? ""}`.toLowerCase();
    if (!text.trim())
        return null;
    const entries = Object.entries(DEFAULT_KEYWORDS);
    for (const [area, keywords] of entries) {
        if (!keywords.length)
            continue;
        if (keywords.some((keyword) => text.includes(keyword))) {
            return AREA_UI_MAP[area];
        }
    }
    return null;
}
function getDestinationEmails(ticket) {
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
    const emails = [];
    for (const key of candidates) {
        const value = ticket[key];
        if (typeof value === "string" && value.trim()) {
            emails.push(value);
        }
    }
    return emails;
}
function resolveTicketArea(ticket) {
    const areaInterna = ticket.trabajador?.areaInterna ?? null;
    if (areaInterna && AREA_UI_MAP[areaInterna]) {
        return AREA_UI_MAP[areaInterna];
    }
    const byEmail = resolveByEmail(getDestinationEmails(ticket));
    if (byEmail)
        return byEmail;
    const byKeywords = resolveByKeywords(ticket.subject ?? null, ticket.description ?? null);
    if (byKeywords)
        return byKeywords;
    return null;
}
function getAreaChips() {
    return [AREA_UI_MAP.CONTA, AREA_UI_MAP.RRHH, AREA_UI_MAP.TRIBUTARIO];
}
function areaFromSlug(slug) {
    return getAreaChips().find((area) => area.slug === slug) || null;
}
