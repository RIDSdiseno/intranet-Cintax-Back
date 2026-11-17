"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClienteBitacora = createClienteBitacora;
exports.listClienteBitacoras = listClienteBitacoras;
exports.getClienteBitacoraById = getClienteBitacoraById;
exports.updateClienteBitacoraById = updateClienteBitacoraById;
exports.deleteClienteBitacoraById = deleteClienteBitacoraById;
exports.listClienteBitacorasEquipo = listClienteBitacorasEquipo;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function ok(res, data, status = 200) {
    const body = { ok: true, data };
    return res.status(status).json(body);
}
function fail(res, status, message, code) {
    const body = { ok: false, error: { message, code } };
    return res.status(status).json(body);
}
function mustUser(req) {
    const u = req.user;
    if (!u)
        throw Object.assign(new Error("No autenticado"), { status: 401 });
    return u;
}
function isPrivileged(u) {
    return (u.role === "ADMIN" ||
        u.role === "SUPERVISOR" ||
        u.isSupervisorOrAdmin === true ||
        u.isAdmin === true);
}
function parseId(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function startOfDayLocal(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDayLocal(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}
/** Acepta YYYY-MM-DD o ISO */
function parseDate(input) {
    if (!input)
        return new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        const [y, m, d] = input.split("-").map(Number);
        return new Date(y, m - 1, d);
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
        throw Object.assign(new Error("Fecha inválida"), { status: 400 });
    }
    return parsed;
}
function normalizeNullableTitle(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    const s = String(value).trim();
    return s || null;
}
/**
 * Verifica acceso al cliente:
 * - ADMIN/SUPERVISOR: acceso total
 * - AGENTE: solo si el cliente está asignado a él
 */
async function canAccessCliente(user, clienteId) {
    const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: {
            id: true,
            rut: true,
            razonSocial: true,
            alias: true,
            activo: true,
            agenteId: true,
            codigoCartera: true,
        },
    });
    if (!cliente) {
        return {
            ok: false,
            status: 404,
            message: "Cliente no encontrado.",
        };
    }
    if (isPrivileged(user)) {
        return { ok: true, cliente };
    }
    if (cliente.agenteId !== user.id) {
        return {
            ok: false,
            status: 403,
            message: "No autorizado para acceder a este cliente.",
        };
    }
    return { ok: true, cliente };
}
/**
 * POST /api/clientes/:id/bitacoras
 * body: {
 *   titulo?: string | null,
 *   contenido: string,
 *   fechaGestion?: string
 * }
 */
async function createClienteBitacora(req, res, next) {
    try {
        const user = mustUser(req);
        const clienteId = parseId(req.params.id);
        if (!clienteId)
            return fail(res, 400, "clienteId inválido.");
        const access = await canAccessCliente(user, clienteId);
        if (!access.ok)
            return fail(res, access.status, access.message);
        const { titulo, contenido, fechaGestion } = req.body ?? {};
        if (typeof contenido !== "string" || !contenido.trim()) {
            return fail(res, 400, "El campo 'contenido' es obligatorio.");
        }
        const created = await prisma.bitacoraCliente.create({
            data: {
                clienteId,
                trabajadorId: user.id,
                titulo: normalizeNullableTitle(titulo) ?? null,
                contenido: contenido.trim(),
                fechaGestion: parseDate(typeof fechaGestion === "string" ? fechaGestion : undefined),
            },
            include: {
                cliente: {
                    select: {
                        id: true,
                        rut: true,
                        razonSocial: true,
                        alias: true,
                        activo: true,
                        agenteId: true,
                        codigoCartera: true,
                    },
                },
                trabajador: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                        areaInterna: true,
                        isSupervisor: true,
                    },
                },
            },
        });
        return ok(res, created, 201);
    }
    catch (err) {
        next(err);
    }
}
/**
 * GET /api/clientes/:id/bitacoras?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 */
async function listClienteBitacoras(req, res, next) {
    try {
        const user = mustUser(req);
        const clienteId = parseId(req.params.id);
        if (!clienteId)
            return fail(res, 400, "clienteId inválido.");
        const access = await canAccessCliente(user, clienteId);
        if (!access.ok)
            return fail(res, access.status, access.message);
        const desde = typeof req.query.desde === "string"
            ? startOfDayLocal(parseDate(req.query.desde))
            : undefined;
        const hasta = typeof req.query.hasta === "string"
            ? endOfDayLocal(parseDate(req.query.hasta))
            : undefined;
        const where = { clienteId };
        if (desde || hasta) {
            where.fechaGestion = {};
            if (desde)
                where.fechaGestion.gte = desde;
            if (hasta)
                where.fechaGestion.lte = hasta;
        }
        const rows = await prisma.bitacoraCliente.findMany({
            where,
            include: {
                cliente: {
                    select: {
                        id: true,
                        rut: true,
                        razonSocial: true,
                        alias: true,
                        activo: true,
                        agenteId: true,
                        codigoCartera: true,
                    },
                },
                trabajador: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                        areaInterna: true,
                        isSupervisor: true,
                    },
                },
            },
            orderBy: [
                { fechaGestion: "desc" },
                { updatedAt: "desc" },
                { id: "desc" },
            ],
        });
        return ok(res, rows);
    }
    catch (err) {
        next(err);
    }
}
/**
 * GET /api/clientes/bitacoras/:bitacoraId
 * dueño o ADMIN/SUPERVISOR
 */
async function getClienteBitacoraById(req, res, next) {
    try {
        const user = mustUser(req);
        const id = parseId(req.params.bitacoraId);
        if (!id)
            return fail(res, 400, "bitacoraId inválido.");
        const row = await prisma.bitacoraCliente.findUnique({
            where: { id },
            include: {
                cliente: {
                    select: {
                        id: true,
                        rut: true,
                        razonSocial: true,
                        alias: true,
                        activo: true,
                        agenteId: true,
                        codigoCartera: true,
                    },
                },
                trabajador: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                        areaInterna: true,
                        isSupervisor: true,
                    },
                },
            },
        });
        if (!row)
            return fail(res, 404, "Bitácora no encontrada.");
        const owner = row.trabajadorId === user.id;
        if (!owner && !isPrivileged(user)) {
            const access = await canAccessCliente(user, row.clienteId);
            if (!access.ok)
                return fail(res, 403, "No autorizado.");
        }
        return ok(res, row);
    }
    catch (err) {
        next(err);
    }
}
/**
 * PUT /api/clientes/bitacoras/:bitacoraId
 * body: {
 *   titulo?: string | null,
 *   contenido?: string,
 *   fechaGestion?: string
 * }
 *
 * - AGENTE: solo sus propias bitácoras
 * - ADMIN/SUPERVISOR: cualquiera
 */
async function updateClienteBitacoraById(req, res, next) {
    try {
        const user = mustUser(req);
        const id = parseId(req.params.bitacoraId);
        if (!id)
            return fail(res, 400, "bitacoraId inválido.");
        const row = await prisma.bitacoraCliente.findUnique({
            where: { id },
            include: {
                cliente: {
                    select: {
                        id: true,
                        agenteId: true,
                    },
                },
            },
        });
        if (!row)
            return fail(res, 404, "Bitácora no encontrada.");
        const owner = row.trabajadorId === user.id;
        if (!owner && !isPrivileged(user)) {
            return fail(res, 403, "No autorizado.");
        }
        const { titulo, contenido, fechaGestion } = req.body ?? {};
        const data = {};
        if (titulo !== undefined) {
            data.titulo = normalizeNullableTitle(titulo) ?? null;
        }
        if (contenido !== undefined) {
            if (typeof contenido !== "string" || !contenido.trim()) {
                return fail(res, 400, "El campo 'contenido' no puede quedar vacío.");
            }
            data.contenido = contenido.trim();
        }
        if (fechaGestion !== undefined) {
            if (fechaGestion === null || fechaGestion === "") {
                return fail(res, 400, "fechaGestion inválida.");
            }
            data.fechaGestion = parseDate(String(fechaGestion));
        }
        if (!("titulo" in data) && !("contenido" in data) && !("fechaGestion" in data)) {
            return fail(res, 400, "Nada para actualizar.");
        }
        const updated = await prisma.bitacoraCliente.update({
            where: { id },
            data,
            include: {
                cliente: {
                    select: {
                        id: true,
                        rut: true,
                        razonSocial: true,
                        alias: true,
                        activo: true,
                        agenteId: true,
                        codigoCartera: true,
                    },
                },
                trabajador: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                        areaInterna: true,
                        isSupervisor: true,
                    },
                },
            },
        });
        return ok(res, updated);
    }
    catch (err) {
        next(err);
    }
}
/**
 * DELETE /api/clientes/bitacoras/:bitacoraId
 * - AGENTE: solo su propia bitácora
 * - ADMIN/SUPERVISOR: cualquiera
 */
async function deleteClienteBitacoraById(req, res, next) {
    try {
        const user = mustUser(req);
        const id = parseId(req.params.bitacoraId);
        if (!id)
            return fail(res, 400, "bitacoraId inválido.");
        const row = await prisma.bitacoraCliente.findUnique({
            where: { id },
        });
        if (!row)
            return fail(res, 404, "Bitácora no encontrada.");
        const owner = row.trabajadorId === user.id;
        if (!owner && !isPrivileged(user)) {
            return fail(res, 403, "No autorizado.");
        }
        await prisma.bitacoraCliente.delete({
            where: { id },
        });
        return ok(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}
async function listClienteBitacorasEquipo(req, res, next) {
    try {
        const user = mustUser(req);
        if (!isPrivileged(user)) {
            return fail(res, 403, "No autorizado.");
        }
        const desde = typeof req.query.desde === "string"
            ? startOfDayLocal(parseDate(req.query.desde))
            : undefined;
        const hasta = typeof req.query.hasta === "string"
            ? endOfDayLocal(parseDate(req.query.hasta))
            : undefined;
        const trabajadorId = typeof req.query.trabajadorId === "string"
            ? parseId(req.query.trabajadorId)
            : undefined;
        const clienteId = typeof req.query.clienteId === "string"
            ? parseId(req.query.clienteId)
            : undefined;
        if (req.query.trabajadorId !== undefined && !trabajadorId) {
            return fail(res, 400, "trabajadorId inválido.");
        }
        if (req.query.clienteId !== undefined && !clienteId) {
            return fail(res, 400, "clienteId inválido.");
        }
        const where = {};
        if (typeof trabajadorId === "number") {
            where.trabajadorId = trabajadorId;
        }
        if (typeof clienteId === "number") {
            where.clienteId = clienteId;
        }
        if (desde || hasta) {
            where.fechaGestion = {};
            if (desde)
                where.fechaGestion.gte = desde;
            if (hasta)
                where.fechaGestion.lte = hasta;
        }
        const rows = await prisma.bitacoraCliente.findMany({
            where,
            include: {
                cliente: {
                    select: {
                        id: true,
                        rut: true,
                        razonSocial: true,
                        alias: true,
                        activo: true,
                        agenteId: true,
                        codigoCartera: true,
                    },
                },
                trabajador: {
                    select: {
                        id_trabajador: true,
                        nombre: true,
                        email: true,
                        areaInterna: true,
                        isSupervisor: true,
                    },
                },
            },
            orderBy: [
                { fechaGestion: "desc" },
                { updatedAt: "desc" },
                { id: "desc" },
            ],
        });
        return ok(res, rows);
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=clienteBitacora.controller.js.map