"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cargarTareasDesdeExcel = cargarTareasDesdeExcel;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const XLSX = __importStar(require("xlsx"));
function cleanRut(input) {
    if (input === null || input === undefined)
        return null;
    const s = String(input).trim();
    if (!s)
        return null;
    const cleaned = s
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/\./g, "")
        .replace(/[^0-9K-]/g, "");
    if (!cleaned)
        return null;
    if (!cleaned.includes("-")) {
        if (cleaned.length < 2)
            return null;
        return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
    }
    const [body, dv, ...rest] = cleaned.split("-");
    if (!body || !dv || rest.length)
        return null;
    return `${body}-${dv}`;
}
function computeRutDV(body) {
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += Number(body[i]) * mul;
        mul = mul === 7 ? 2 : mul + 1;
    }
    const mod = 11 - (sum % 11);
    if (mod === 11)
        return "0";
    if (mod === 10)
        return "K";
    return String(mod);
}
function isValidRut(cleanedRut) {
    const [body, dv] = cleanedRut.split("-");
    if (!body || !dv)
        return false;
    if (!/^\d+$/.test(body))
        return false;
    if (!/^[0-9K]$/.test(dv))
        return false;
    return computeRutDV(body) === dv;
}
function formatRutDb(cleanedRut) {
    const [body, dv] = cleanedRut.split("-");
    const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${withDots}-${dv}`;
}
function normRut(v) {
    const cleaned = cleanRut(v);
    if (!cleaned)
        return "";
    if (!isValidRut(cleaned))
        return "";
    return formatRutDb(cleaned);
}
function normNombre(v) {
    const raw = String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!raw)
        return "";
    return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normEmail(v) {
    const raw = String(v ?? "").trim().toLowerCase();
    return raw || "";
}
function normText(v) {
    return String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}
function compactText(v) {
    return normText(v).replace(/[^a-z0-9]/g, "");
}
function emailLocalPart(email) {
    const e = normEmail(email);
    const at = e.indexOf("@");
    return at > 0 ? e.slice(0, at) : e;
}
function tokenizeName(v) {
    return normText(v)
        .split(" ")
        .map((x) => x.trim())
        .filter(Boolean);
}
function parsePlantillaIds(v) {
    const raw = String(v ?? "").trim();
    if (!raw)
        return [];
    const parts = raw.split(/[,; ]+/).map((x) => x.trim()).filter(Boolean);
    const ids = parts.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    return Array.from(new Set(ids));
}
/**
 * Para columnas tipo "tarea/tareas/plantillaNombre":
 * soporta:
 * - "Tarea 1"
 * - "Tarea 1, Tarea 2"
 * - "Tarea 1;Tarea 2"
 * - "Tarea 1 / Tarea 2"
 * - líneas
 */
function parsePlantillaNombres(v) {
    const raw = String(v ?? "").trim();
    if (!raw)
        return [];
    const parts = raw
        .split(/[,;\/\n]+/g)
        .map((x) => String(x).trim())
        .filter(Boolean);
    const map = new Map();
    for (const p of parts) {
        const k = normNombre(p);
        if (!k)
            continue;
        if (!map.has(k))
            map.set(k, p);
    }
    return Array.from(map.values());
}
function parseFecha(v) {
    if (v == null || v === "")
        return null;
    if (v instanceof Date && Number.isFinite(v.getTime()))
        return v;
    if (typeof v === "number") {
        const d = XLSX.SSF.parse_date_code(v);
        if (d)
            return new Date(d.y, d.m - 1, d.d);
    }
    const d = new Date(String(v));
    return Number.isFinite(d.getTime()) ? d : null;
}
function parseBool(v) {
    if (v == null || v === "")
        return null;
    if (typeof v === "boolean")
        return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "si", "sí", "yes", "y"].includes(s))
        return true;
    if (["false", "0", "no", "n"].includes(s))
        return false;
    return null;
}
function parseIntOrNull(v) {
    if (v == null || v === "")
        return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
}
function parseFrecuencia(v) {
    const raw = String(v ?? "").trim().toUpperCase();
    if (!raw)
        return null;
    const allowed = new Set(Object.values(client_1.FrecuenciaTarea));
    if (allowed.has(raw))
        return raw;
    const alias = {
        UNICA: "UNICA",
        ÚNICA: "UNICA",
        UNICO: "UNICA",
        "ONE-TIME": "UNICA",
        MENSUAL: "MENSUAL",
        MENSUALMENTE: "MENSUAL",
        SEMANAL: "SEMANAL",
        SEMANALMENTE: "SEMANAL",
    };
    const mapped = alias[raw];
    if (mapped && allowed.has(mapped))
        return mapped;
    return null;
}
function parseArea(v) {
    const raw = String(v ?? "").trim().toUpperCase();
    if (!raw)
        return null;
    const allowed = new Set(Object.values(client_1.Area));
    return allowed.has(raw) ? raw : null;
}
function parsePresentacion(v) {
    const raw = String(v ?? "").trim().toUpperCase();
    if (!raw)
        return null;
    const allowed = new Set(Object.values(client_1.Presentacion));
    return allowed.has(raw) ? raw : null;
}
function isValidDiaMes(n) {
    return n != null && Number.isInteger(n) && n >= 1 && n <= 31;
}
function isValidDiaSemana(n) {
    return n != null && Number.isInteger(n) && n >= 1 && n <= 7;
}
const VOLATILE_DAYS = 31;
function addDays(d, days) {
    return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function makeVolatileNombreNorm(baseNorm, expiresAt, seed) {
    const y = expiresAt.getFullYear();
    const m = String(expiresAt.getMonth() + 1).padStart(2, "0");
    const day = String(expiresAt.getDate()).padStart(2, "0");
    const rnd = Math.random().toString(16).slice(2, 8);
    const safeSeed = (seed || "").replace(/[^a-z0-9]/gi, "").slice(0, 10);
    return `${baseNorm}__v__${y}${m}${day}__${safeSeed || "x"}__${rnd}`;
}
function dedupeTrabajadores(items) {
    return Array.from(new Map(items.map((item) => [item.id_trabajador, item])).values());
}
function resolveTrabajadorFlexible(params) {
    const { agenteEmail = "", responsableNombre = "", agenteId = null, clienteAgenteId = null, trabajadorEmailMap, trabajadorIdMap, trabajadorByLocalPartMap, trabajadorByCompactNameMap, } = params;
    if (agenteEmail) {
        const exact = trabajadorEmailMap.get(normEmail(agenteEmail));
        if (exact) {
            return {
                ok: true,
                trabajador: exact,
                matchedBy: "email-exacto",
            };
        }
        const lp = compactText(emailLocalPart(agenteEmail));
        if (lp) {
            const matches = Array.from(trabajadorByLocalPartMap.entries())
                .filter(([k]) => compactText(k) === lp)
                .flatMap(([, arr]) => arr);
            const uniq = dedupeTrabajadores(matches);
            if (uniq.length === 1) {
                return {
                    ok: true,
                    trabajador: uniq[0],
                    matchedBy: "email-localpart",
                };
            }
            if (uniq.length > 1) {
                return {
                    ok: false,
                    reason: `Correo ambiguo: "${agenteEmail}" coincide con múltiples trabajadores`,
                };
            }
        }
    }
    if (agenteId && trabajadorIdMap.has(agenteId)) {
        return {
            ok: true,
            trabajador: trabajadorIdMap.get(agenteId),
            matchedBy: "id",
        };
    }
    if (responsableNombre) {
        const compact = compactText(responsableNombre);
        if (compact) {
            const exactName = trabajadorByCompactNameMap.get(compact) || [];
            const uniqExact = dedupeTrabajadores(exactName);
            if (uniqExact.length === 1) {
                return {
                    ok: true,
                    trabajador: uniqExact[0],
                    matchedBy: "nombre-exacto",
                };
            }
            if (uniqExact.length > 1) {
                return {
                    ok: false,
                    reason: `Nombre ambiguo: "${responsableNombre}" coincide con múltiples trabajadores`,
                };
            }
            const tokens = tokenizeName(responsableNombre);
            if (tokens.length > 0) {
                const contains = Array.from(trabajadorIdMap.values()).filter((t) => {
                    const n = normText(t.nombre);
                    return tokens.every((tok) => n.includes(tok));
                });
                const uniqContains = dedupeTrabajadores(contains);
                if (uniqContains.length === 1) {
                    return {
                        ok: true,
                        trabajador: uniqContains[0],
                        matchedBy: "nombre-flex",
                    };
                }
                if (uniqContains.length > 1) {
                    return {
                        ok: false,
                        reason: `Nombre ambiguo: "${responsableNombre}" coincide con múltiples trabajadores`,
                    };
                }
            }
        }
    }
    if (clienteAgenteId && trabajadorIdMap.has(clienteAgenteId)) {
        return {
            ok: true,
            trabajador: trabajadorIdMap.get(clienteAgenteId),
            matchedBy: "cliente.agenteId",
        };
    }
    return {
        ok: false,
        reason: "No se pudo resolver el responsable con correo, id, nombre ni cliente.agenteId",
    };
}
async function cargarTareasDesdeExcel(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res
                .status(400)
                .json({ error: "Debes enviar un archivo .xlsx en form-data con key=archivo" });
        }
        const skipDuplicates = String(req.query.skipDuplicates ?? "true").toLowerCase() !== "false";
        const defaultFecha = req.query.fechaProgramada ? new Date(String(req.query.fechaProgramada)) : null;
        if (req.query.fechaProgramada && (!defaultFecha || Number.isNaN(defaultFecha.getTime()))) {
            return res.status(400).json({ error: "fechaProgramada en query inválida (usa YYYY-MM-DD)" });
        }
        const queryAgenteId = req.query.agenteId ? Number(req.query.agenteId) : null;
        if (req.query.agenteId && (!Number.isFinite(queryAgenteId) || queryAgenteId <= 0)) {
            return res.status(400).json({ error: "agenteId en query inválido (usa número > 0)" });
        }
        const queryAgenteEmail = req.query.agenteEmail ? normEmail(req.query.agenteEmail) : "";
        if (req.query.agenteEmail && (!queryAgenteEmail || !queryAgenteEmail.includes("@"))) {
            return res.status(400).json({ error: "agenteEmail en query inválido (usa correo válido)" });
        }
        const forceUpdateClienteAgente = String(req.query.forceUpdateClienteAgente ?? "false").toLowerCase() === "true";
        const wb = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const get = (obj, ...keys) => {
            for (const k of keys) {
                if (obj[k] != null && obj[k] !== "")
                    return obj[k];
                const found = Object.keys(obj).find((kk) => kk.toLowerCase() === k.toLowerCase());
                if (found && obj[found] != null && obj[found] !== "")
                    return obj[found];
            }
            return "";
        };
        const now = new Date();
        const volatileExpiresAt = addDays(now, VOLATILE_DAYS);
        const parsed = rows.map((r, idx) => {
            const rut = normRut(get(r, "rut", "RUT", "rutCliente", "rut_cliente", "RUT CLIENTE", "rut cliente", "R.U.T"));
            const razonSocial = String(get(r, "razonSocial", "razon social", "empresa", "razon")).trim();
            const agenteEmailRow = normEmail(get(r, "agenteEmail", "emailAgente", "correoAgente", "correo", "email", "mail", "responsableEmail", "correoResponsable"));
            const agenteEmail = agenteEmailRow || queryAgenteEmail || "";
            const responsableNombre = String(get(r, "responsableNombre", "nombreResponsable", "responsable", "agenteNombre", "nombreAgente", "encargado", "trabajador", "asignadoA") ?? "").trim();
            const agenteIdCellRaw = get(r, "agenteId", "trabajadorId", "responsableId", "agente");
            const agenteIdCell = parseIntOrNull(agenteIdCellRaw);
            const agenteId = agenteIdCell != null && agenteIdCell > 0 ? agenteIdCell : (queryAgenteId ?? null);
            const plantillaIds = parsePlantillaIds(get(r, "plantillaIds", "plantillas", "plantillaId"));
            const plantillaNombres = parsePlantillaNombres(get(r, "tarea", "tareas", "plantillaNombre", "plantilla", "nombreTarea"));
            const isVolatileRow = parseBool(get(r, "volatile", "volatil", "esVolatil", "tareaVolatil", "volatile31")) ?? false;
            const fechaProgramada = parseFecha(get(r, "vencimiento", "fechaProgramada", "fecha")) ?? defaultFecha;
            const frecuenciaRaw = get(r, "frecuencia", "frecuenciaPlantilla", "frecuencia_tarea");
            const diaMesRaw = get(r, "diaMesVencimiento", "diaMes", "dia_mes_vencimiento");
            const diaSemanaRaw = get(r, "diaSemanaVencimiento", "diaSemana", "dia_semana_vencimiento");
            const frecuenciaPlantilla = parseFrecuencia(frecuenciaRaw);
            const diaMesVencimiento = parseIntOrNull(diaMesRaw);
            const diaSemanaVencimiento = parseIntOrNull(diaSemanaRaw);
            const detallePlantilla = String(get(r, "detallePlantilla", "detalle", "detalle_tarea")).trim() ||
                "Creada desde carga masiva (Excel)";
            const areaPlantilla = parseArea(get(r, "area", "areaPlantilla")) ?? client_1.Area.ADMIN;
            const presentacionPlantilla = parsePresentacion(get(r, "presentacion", "presentacionPlantilla")) ?? client_1.Presentacion.CLIENTE;
            const requiereDriveParsed = parseBool(get(r, "requiereDrive", "drive", "requiere_drive"));
            const requiereDrivePlantilla = requiereDriveParsed ?? true;
            const codigoDocumento = String(get(r, "codigoDocumento", "codigo", "codigo_documento")).trim() || "";
            return {
                row: idx + 2,
                rut,
                razonSocial,
                agenteEmail,
                responsableNombre,
                agenteId,
                plantillaIds,
                plantillaNombres,
                fechaProgramada,
                isVolatileRow,
                plantillaConfigInline: {
                    frecuenciaPlantilla,
                    diaMesVencimiento,
                    diaSemanaVencimiento,
                    detallePlantilla,
                    areaPlantilla,
                    presentacionPlantilla,
                    requiereDrivePlantilla,
                    codigoDocumento,
                },
            };
        });
        const bad = parsed.filter((p) => !p.rut ||
            !p.fechaProgramada ||
            (p.plantillaIds.length === 0 && p.plantillaNombres.length === 0));
        if (bad.length) {
            return res.status(400).json({
                error: "Hay filas inválidas. Requiere rut + (vencimiento/fechaProgramada/fecha o query fechaProgramada) + (plantillaIds o tareas/plantillaNombre).",
                sample: bad.slice(0, 10).map((b) => ({
                    row: b.row,
                    rut: b.rut,
                    fechaProgramada: b.fechaProgramada,
                    plantillaIds: b.plantillaIds,
                    plantillaNombres: b.plantillaNombres,
                })),
            });
        }
        const trabajadores = await prisma_1.prisma.trabajador.findMany({
            select: {
                id_trabajador: true,
                email: true,
                nombre: true,
            },
        });
        const trabajadorEmailMap = new Map(trabajadores
            .filter((t) => t.email)
            .map((t) => [
            normEmail(t.email),
            {
                id_trabajador: t.id_trabajador,
                email: t.email,
                nombre: t.nombre,
            },
        ]));
        const trabajadorIdMap = new Map(trabajadores.map((t) => [
            t.id_trabajador,
            {
                id_trabajador: t.id_trabajador,
                email: t.email,
                nombre: t.nombre,
            },
        ]));
        const trabajadorByLocalPartMap = new Map();
        for (const t of trabajadores) {
            const lp = emailLocalPart(t.email || "");
            if (!lp)
                continue;
            const arr = trabajadorByLocalPartMap.get(lp) || [];
            arr.push({
                id_trabajador: t.id_trabajador,
                email: t.email,
                nombre: t.nombre,
            });
            trabajadorByLocalPartMap.set(lp, arr);
        }
        const trabajadorByCompactNameMap = new Map();
        for (const t of trabajadores) {
            const key = compactText(t.nombre);
            if (!key)
                continue;
            const arr = trabajadorByCompactNameMap.get(key) || [];
            arr.push({
                id_trabajador: t.id_trabajador,
                email: t.email,
                nombre: t.nombre,
            });
            trabajadorByCompactNameMap.set(key, arr);
        }
        if (queryAgenteEmail) {
            const resolvedQueryEmail = resolveTrabajadorFlexible({
                agenteEmail: queryAgenteEmail,
                responsableNombre: "",
                agenteId: queryAgenteId,
                clienteAgenteId: null,
                trabajadorEmailMap,
                trabajadorIdMap,
                trabajadorByLocalPartMap,
                trabajadorByCompactNameMap,
            });
            if (!resolvedQueryEmail.ok) {
                return res.status(400).json({ error: `agenteEmail no resoluble: ${resolvedQueryEmail.reason}` });
            }
        }
        const ruts = Array.from(new Set(parsed.map((p) => p.rut)));
        const clientes = await prisma_1.prisma.cliente.findMany({
            where: { rut: { in: ruts } },
            select: { rut: true, agenteId: true, activo: true, razonSocial: true },
        });
        const clienteMap = new Map(clientes.map((c) => [c.rut, c]));
        const existingRutSet = new Set(clientes.map((x) => x.rut));
        const clientesToCreate = [];
        for (const p of parsed) {
            if (clienteMap.has(p.rut))
                continue;
            const razon = p.razonSocial || `Cliente ${p.rut}`;
            const resolvedForNewClient = resolveTrabajadorFlexible({
                agenteEmail: p.agenteEmail,
                responsableNombre: p.responsableNombre,
                agenteId: p.agenteId,
                clienteAgenteId: null,
                trabajadorEmailMap,
                trabajadorIdMap,
                trabajadorByLocalPartMap,
                trabajadorByCompactNameMap,
            });
            const agenteIdForCliente = resolvedForNewClient.ok
                ? resolvedForNewClient.trabajador.id_trabajador
                : null;
            clientesToCreate.push({
                rut: p.rut,
                razonSocial: razon,
                agenteId: agenteIdForCliente,
                activo: true,
            });
        }
        if (clientesToCreate.length) {
            await prisma_1.prisma.cliente.createMany({
                data: clientesToCreate,
                skipDuplicates: true,
            });
            const clientes2 = await prisma_1.prisma.cliente.findMany({
                where: { rut: { in: ruts } },
                select: { rut: true, agenteId: true, activo: true, razonSocial: true },
            });
            clienteMap.clear();
            for (const c of clientes2)
                clienteMap.set(c.rut, c);
        }
        const allPlantillaIds = Array.from(new Set(parsed.flatMap((p) => p.plantillaIds)));
        const plantillasById = allPlantillaIds.length === 0
            ? []
            : await prisma_1.prisma.tareaPlantilla.findMany({
                where: { id_tarea_plantilla: { in: allPlantillaIds } },
                select: { id_tarea_plantilla: true, activo: true },
            });
        const plantillaIdSet = new Set(plantillasById.map((p) => p.id_tarea_plantilla));
        const allNombreNorms = Array.from(new Set(parsed
            .flatMap((p) => p.plantillaNombres)
            .map((n) => normNombre(n))
            .filter(Boolean)));
        const volatileByNombreNorm = new Map();
        for (const p of parsed) {
            if (!p.isVolatileRow)
                continue;
            for (const nombre of p.plantillaNombres) {
                const nn = normNombre(nombre);
                if (!nn)
                    continue;
                volatileByNombreNorm.set(nn, true);
            }
        }
        const plantillasFound = allNombreNorms.length === 0
            ? []
            : await prisma_1.prisma.tareaPlantilla.findMany({
                where: {
                    OR: [
                        { nombreNorm: { in: allNombreNorms } },
                        {
                            nombreBaseNorm: { in: allNombreNorms },
                            isVolatile: true,
                            activo: true,
                            expiresAt: { gt: now },
                        },
                    ],
                },
                select: {
                    id_tarea_plantilla: true,
                    nombreNorm: true,
                    nombreBaseNorm: true,
                    isVolatile: true,
                    expiresAt: true,
                    createdAt: true,
                    activo: true,
                    frecuencia: true,
                    diaMesVencimiento: true,
                    diaSemanaVencimiento: true,
                },
                orderBy: [{ createdAt: "desc" }],
            });
        const normalNameMap = new Map();
        const volatileNameMap = new Map();
        for (const pl of plantillasFound) {
            if (!pl.activo)
                continue;
            if (pl.isVolatile) {
                if (!pl.nombreBaseNorm)
                    continue;
                if (!volatileNameMap.has(pl.nombreBaseNorm))
                    volatileNameMap.set(pl.nombreBaseNorm, pl);
            }
            else {
                normalNameMap.set(pl.nombreNorm, pl);
            }
        }
        const inlineConfigMap = new Map();
        const inlineConfigConflicts = [];
        for (const p of parsed) {
            const cfgInline = p.plantillaConfigInline;
            for (const nombre of p.plantillaNombres) {
                const nn = normNombre(nombre);
                if (!nn)
                    continue;
                const hasAnyCfg = !!cfgInline.frecuenciaPlantilla ||
                    cfgInline.diaMesVencimiento != null ||
                    cfgInline.diaSemanaVencimiento != null;
                if (!hasAnyCfg)
                    continue;
                if (!cfgInline.frecuenciaPlantilla)
                    continue;
                const candidate = {
                    frecuencia: cfgInline.frecuenciaPlantilla,
                    diaMesVencimiento: cfgInline.diaMesVencimiento,
                    diaSemanaVencimiento: cfgInline.diaSemanaVencimiento,
                    detalle: cfgInline.detallePlantilla,
                    area: cfgInline.areaPlantilla,
                    presentacion: cfgInline.presentacionPlantilla,
                    requiereDrive: cfgInline.requiereDrivePlantilla,
                    codigoDocumento: cfgInline.codigoDocumento || null,
                };
                const prev = inlineConfigMap.get(nn);
                if (!prev) {
                    inlineConfigMap.set(nn, { config: candidate, fromRow: p.row });
                }
                else {
                    const a = prev.config;
                    const b = candidate;
                    const same = a.frecuencia === b.frecuencia &&
                        (a.diaMesVencimiento ?? null) === (b.diaMesVencimiento ?? null) &&
                        (a.diaSemanaVencimiento ?? null) === (b.diaSemanaVencimiento ?? null);
                    if (!same) {
                        inlineConfigConflicts.push({
                            nombreNorm: nn,
                            rows: [prev.fromRow, p.row],
                            reason: "Configuración distinta para la misma tarea (frecuencia/día)",
                        });
                    }
                }
            }
        }
        if (inlineConfigConflicts.length) {
            return res.status(400).json({
                error: "Hay conflictos de configuración para tareas nuevas (misma tarea con reglas distintas).",
                conflicts: inlineConfigConflicts.slice(0, 20),
            });
        }
        const missingConfig = [];
        for (const nn of allNombreNorms) {
            const wantsVolatile = volatileByNombreNorm.get(nn) === true;
            const existsNormal = normalNameMap.has(nn);
            const existsVolatile = volatileNameMap.has(nn);
            const existsForThisRequest = wantsVolatile ? (existsVolatile || existsNormal) : existsNormal;
            if (existsForThisRequest)
                continue;
            const cfg = inlineConfigMap.get(nn)?.config;
            if (!cfg) {
                const rowsWhere = parsed
                    .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
                    .slice(0, 5)
                    .map((p) => p.row);
                missingConfig.push({
                    tarea: parsed
                        .find((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
                        ?.plantillaNombres.find((t) => normNombre(t) === nn) ?? nn,
                    nombreNorm: nn,
                    sampleRows: rowsWhere,
                });
                continue;
            }
            if (cfg.frecuencia === client_1.FrecuenciaTarea.MENSUAL && !isValidDiaMes(cfg.diaMesVencimiento)) {
                missingConfig.push({
                    tarea: nn,
                    nombreNorm: nn,
                    sampleRows: parsed
                        .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
                        .slice(0, 5)
                        .map((p) => p.row),
                });
            }
            if (cfg.frecuencia === client_1.FrecuenciaTarea.SEMANAL && !isValidDiaSemana(cfg.diaSemanaVencimiento)) {
                missingConfig.push({
                    tarea: nn,
                    nombreNorm: nn,
                    sampleRows: parsed
                        .filter((p) => p.plantillaNombres.some((t) => normNombre(t) === nn))
                        .slice(0, 5)
                        .map((p) => p.row),
                });
            }
        }
        if (missingConfig.length) {
            return res.status(400).json({
                error: "Hay tareas NUEVAS en el Excel que requieren configuración en la MISMA hoja. " +
                    "Agrega columnas: frecuencia + (diaMesVencimiento si MENSUAL) o (diaSemanaVencimiento si SEMANAL). " +
                    "Si la tarea ya existe en el sistema, esta config se ignora.",
                sample: missingConfig.slice(0, 25),
                hint: "Ejemplo: para 'prueba 4' => frecuencia=MENSUAL y diaMesVencimiento=15 (en al menos una fila donde aparezca esa tarea).",
            });
        }
        const plantillasToCreate = [];
        const plannedNormal = new Set();
        const plannedVolatile = new Set();
        for (const p of parsed) {
            for (const nombre of p.plantillaNombres) {
                const nn = normNombre(nombre);
                if (!nn)
                    continue;
                const wantsVolatile = volatileByNombreNorm.get(nn) === true;
                const existsNormal = normalNameMap.has(nn);
                const existsVolatile = volatileNameMap.has(nn);
                const existsForThisRequest = wantsVolatile ? (existsVolatile || existsNormal) : existsNormal;
                if (existsForThisRequest)
                    continue;
                if (wantsVolatile) {
                    if (plannedVolatile.has(nn))
                        continue;
                }
                else {
                    if (plannedNormal.has(nn))
                        continue;
                }
                const cfg = inlineConfigMap.get(nn).config;
                if (wantsVolatile) {
                    const uniqueNombreNorm = makeVolatileNombreNorm(nn, volatileExpiresAt, `${p.row}_${p.rut}`);
                    plantillasToCreate.push({
                        area: cfg.area ?? client_1.Area.ADMIN,
                        nombre,
                        nombreNorm: uniqueNombreNorm,
                        nombreBaseNorm: nn,
                        detalle: cfg.detalle || "Creada desde carga masiva (Excel)",
                        frecuencia: cfg.frecuencia,
                        diaMesVencimiento: cfg.diaMesVencimiento ?? null,
                        diaSemanaVencimiento: cfg.diaSemanaVencimiento ?? null,
                        presentacion: cfg.presentacion ?? client_1.Presentacion.CLIENTE,
                        activo: true,
                        requiereDrive: cfg.requiereDrive ?? true,
                        codigoDocumento: cfg.codigoDocumento ?? null,
                        isVolatile: true,
                        expiresAt: volatileExpiresAt,
                    });
                    plannedVolatile.add(nn);
                }
                else {
                    plantillasToCreate.push({
                        area: cfg.area ?? client_1.Area.ADMIN,
                        nombre,
                        nombreNorm: nn,
                        nombreBaseNorm: null,
                        detalle: cfg.detalle || "Creada desde carga masiva (Excel)",
                        frecuencia: cfg.frecuencia,
                        diaMesVencimiento: cfg.diaMesVencimiento ?? null,
                        diaSemanaVencimiento: cfg.diaSemanaVencimiento ?? null,
                        presentacion: cfg.presentacion ?? client_1.Presentacion.CLIENTE,
                        activo: true,
                        requiereDrive: cfg.requiereDrive ?? true,
                        codigoDocumento: cfg.codigoDocumento ?? null,
                        isVolatile: false,
                        expiresAt: null,
                    });
                    plannedNormal.add(nn);
                }
            }
        }
        if (plantillasToCreate.length) {
            await prisma_1.prisma.tareaPlantilla.createMany({
                data: plantillasToCreate,
                skipDuplicates: true,
            });
            const plantillasReload = allNombreNorms.length === 0
                ? []
                : await prisma_1.prisma.tareaPlantilla.findMany({
                    where: {
                        OR: [
                            { nombreNorm: { in: allNombreNorms } },
                            {
                                nombreBaseNorm: { in: allNombreNorms },
                                isVolatile: true,
                                activo: true,
                                expiresAt: { gt: now },
                            },
                        ],
                    },
                    select: {
                        id_tarea_plantilla: true,
                        nombreNorm: true,
                        nombreBaseNorm: true,
                        isVolatile: true,
                        expiresAt: true,
                        createdAt: true,
                        activo: true,
                        frecuencia: true,
                        diaMesVencimiento: true,
                        diaSemanaVencimiento: true,
                    },
                    orderBy: [{ createdAt: "desc" }],
                });
            normalNameMap.clear();
            volatileNameMap.clear();
            for (const pl of plantillasReload) {
                if (!pl.activo)
                    continue;
                if (pl.isVolatile) {
                    if (!pl.nombreBaseNorm)
                        continue;
                    if (!volatileNameMap.has(pl.nombreBaseNorm))
                        volatileNameMap.set(pl.nombreBaseNorm, pl);
                }
                else {
                    normalNameMap.set(pl.nombreNorm, pl);
                }
            }
        }
        const results = [];
        const createData = [];
        const clienteUpdates = [];
        for (const p of parsed) {
            const errors = [];
            const c = clienteMap.get(p.rut);
            const clienteStatus = existingRutSet.has(p.rut) ? "existing" : "created";
            if (!c) {
                results.push({ row: p.row, rut: p.rut, error: "Cliente no pudo resolverse/crearse" });
                continue;
            }
            if (c.activo === false) {
                results.push({ row: p.row, rut: p.rut, error: "Cliente está inactivo" });
                continue;
            }
            const resolvedTrabajador = resolveTrabajadorFlexible({
                agenteEmail: p.agenteEmail,
                responsableNombre: p.responsableNombre,
                agenteId: p.agenteId,
                clienteAgenteId: c.agenteId ?? null,
                trabajadorEmailMap,
                trabajadorIdMap,
                trabajadorByLocalPartMap,
                trabajadorByCompactNameMap,
            });
            if (!resolvedTrabajador.ok) {
                results.push({
                    row: p.row,
                    rut: p.rut,
                    error: `No se pudo resolver responsable: ${resolvedTrabajador.reason}`,
                });
                continue;
            }
            const trabajadorId = resolvedTrabajador.trabajador.id_trabajador;
            const assignedTo = resolvedTrabajador.matchedBy === "email-exacto" || resolvedTrabajador.matchedBy === "email-localpart"
                ? { by: "email", value: resolvedTrabajador.trabajador.email || p.agenteEmail || "-" }
                : resolvedTrabajador.matchedBy === "cliente.agenteId"
                    ? { by: "cliente.agenteId", value: String(trabajadorId) }
                    : { by: "id", value: String(trabajadorId) };
            if (forceUpdateClienteAgente && clienteStatus === "existing") {
                const desired = trabajadorId ?? null;
                if (desired && c.agenteId !== desired) {
                    clienteUpdates.push({ rut: p.rut, agenteId: desired });
                }
            }
            const invalidIds = p.plantillaIds.filter((id) => !plantillaIdSet.has(id));
            if (invalidIds.length)
                errors.push(`Plantillas inválidas por ID: ${invalidIds.join(",")}`);
            const resolvedByNameIds = [];
            for (const nombre of p.plantillaNombres) {
                const nn = normNombre(nombre);
                const wantsVolatile = p.isVolatileRow || volatileByNombreNorm.get(nn) === true;
                const pl = wantsVolatile ? (volatileNameMap.get(nn) ?? normalNameMap.get(nn)) : normalNameMap.get(nn);
                if (!pl) {
                    errors.push(wantsVolatile
                        ? `No se pudo resolver/crear plantilla VOLÁTIL (o normal fallback) para: "${nombre}"`
                        : `No se pudo resolver/crear plantilla para: "${nombre}"`);
                    continue;
                }
                resolvedByNameIds.push(pl.id_tarea_plantilla);
            }
            const resolvedIds = Array.from(new Set([...p.plantillaIds, ...resolvedByNameIds])).filter((n) => n > 0);
            if (resolvedIds.length === 0) {
                results.push({
                    row: p.row,
                    rut: p.rut,
                    error: errors.join(" | ") || "Sin plantillas válidas",
                });
                continue;
            }
            const fecha = p.fechaProgramada;
            if (!fecha || Number.isNaN(fecha.getTime())) {
                results.push({
                    row: p.row,
                    rut: p.rut,
                    error: "Fecha inválida (usa vencimiento/fechaProgramada/fecha o query fechaProgramada)",
                });
                continue;
            }
            for (const pid of resolvedIds) {
                createData.push({
                    tareaPlantillaId: pid,
                    rutCliente: p.rut,
                    trabajadorId,
                    estado: client_1.EstadoTarea.PENDIENTE,
                    fechaProgramada: fecha,
                });
            }
            results.push({
                row: p.row,
                rut: p.rut,
                cliente: clienteStatus,
                plantillas: {
                    by: p.plantillaIds.length ? "id" : "nombre",
                    requested: p.plantillaIds.length + p.plantillaNombres.length,
                    resolved: resolvedIds.length,
                    created: 0,
                },
                tareasRequested: resolvedIds.length,
                tareasCreatedApprox: resolvedIds.length,
                assignedTo,
                errors,
            });
        }
        if (createData.length === 0) {
            return res.status(200).json({
                ok: false,
                message: "No hay registros válidos para crear.",
                results,
            });
        }
        if (forceUpdateClienteAgente && clienteUpdates.length) {
            const lastByRut = new Map();
            for (const u of clienteUpdates)
                lastByRut.set(u.rut, u.agenteId);
            for (const [rut, agenteId] of Array.from(lastByRut.entries())) {
                await prisma_1.prisma.cliente.update({
                    where: { rut },
                    data: { agenteId },
                });
            }
        }
        const created = await prisma_1.prisma.tareaAsignada.createMany({
            data: createData,
            skipDuplicates,
        });
        const requested = createData.length;
        return res.json({
            ok: true,
            sheet: sheetName,
            requested,
            created: created.count,
            skipped: requested - created.count,
            results,
            note: skipDuplicates
                ? "Con skipDuplicates=true, skipped es global. El detalle por fila requiere consultar existentes antes de crear."
                : null,
            rules: "El responsable se resuelve de forma estricta por correo, id, nombre o cliente.agenteId. " +
                "Si no se puede identificar de forma única, la fila NO se crea. " +
                "Si una tarea (plantilla) NO existe, debes incluir en la MISMA hoja su configuración: frecuencia + día (mensual/semanal). " +
                "Si la tarea ya existe en el sistema, se ignora la config del Excel y NO se actualiza. " +
                `Si marca volatile=true en la fila, la plantilla se crea como VOLÁTIL y expira en ${VOLATILE_DAYS} días (requiere campos isVolatile/expiresAt/nombreBaseNorm/createdAt en TareaPlantilla).`,
        });
    }
    catch (e) {
        console.error("[cargarTareasDesdeExcel] error:", e);
        return res.status(500).json({ error: "Error interno cargando tareas desde Excel" });
    }
}
//# sourceMappingURL=tareas.masivo.excel.controller.js.map