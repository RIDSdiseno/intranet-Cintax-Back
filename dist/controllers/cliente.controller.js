"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setClienteActivo = exports.deleteCliente = exports.bulkAssignAgente = exports.assignAgenteToCliente = exports.updateCliente = exports.createCliente = exports.getClienteById = exports.listClientes = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Helpers
 */
function parseIdParam(req) {
    const raw = req.params.id;
    const id = Number(raw);
    if (!raw || Number.isNaN(id))
        return null;
    return id;
}
function isPrivileged(req) {
    const role = req.user?.role;
    return role === "ADMIN" || role === "SUPERVISOR";
}
function isAdmin(req) {
    const role = req.user?.role;
    return role === "ADMIN";
}
async function ensureAgenteExists(agenteId) {
    // Ajusta el modelo si no se llama "trabajador"
    const agente = await prisma.trabajador.findUnique({
        where: { id_trabajador: agenteId },
        select: { id_trabajador: true, nombre: true, email: true, status: true },
    });
    if (!agente)
        return { ok: false, error: "Agente no existe" };
    if (!agente.status)
        return { ok: false, error: "Agente está inactivo" };
    return { ok: true, agente };
}
function asTrimmedString(v) {
    if (v === null || v === undefined)
        return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
}
function asNullableTrimmedString(v) {
    if (v === undefined)
        return undefined; // no viene => no tocar
    if (v === null)
        return null; // viene null => set null
    const s = String(v).trim();
    return s.length ? s : null; // viene "" => null
}
function parseNullableNumber(v) {
    if (v === undefined)
        return undefined; // no viene => no tocar
    if (v === null || v === "")
        return null; // viene vacío => null
    const n = Number(v);
    if (!Number.isFinite(n))
        return NaN; // marcador de inválido
    return n;
}
/**
 * GET /api/clientes
 *
 * Query params:
 *  - search?: string      -> busca por rut o razón social
 *  - cartera?: string     -> filtra por codigoCartera (ej: "CONTA/A01")
 *  - agenteId?: number    -> filtra por id del ejecutivo
 *  - soloActivos?: "true" -> solo clientes activos
 *  - limit?: number       -> máximo de registros (default 200)
 *  - skip?: number        -> offset (para paginación)
 */
const listClientes = async (req, res) => {
    try {
        const { search, cartera, agenteId, soloActivos, limit, skip } = req.query;
        const where = {};
        if (soloActivos === "true")
            where.activo = true;
        if (cartera && cartera.trim() !== "")
            where.codigoCartera = cartera.trim();
        if (agenteId) {
            const parsed = Number(agenteId);
            if (!Number.isNaN(parsed))
                where.agenteId = parsed;
        }
        if (search && search.trim() !== "") {
            const q = search.trim();
            where.OR = [
                { rut: { contains: q, mode: "insensitive" } },
                { razonSocial: { contains: q, mode: "insensitive" } },
                { alias: { contains: q, mode: "insensitive" } },
            ];
        }
        const take = limit && !Number.isNaN(Number(limit)) ? Math.min(Number(limit), 1000) : 200;
        const sk = skip && !Number.isNaN(Number(skip)) ? Math.max(0, Number(skip)) : 0;
        const [clientes, total] = await Promise.all([
            prisma.cliente.findMany({
                where,
                orderBy: [{ razonSocial: "asc" }, { rut: "asc" }],
                take,
                skip: sk,
                select: {
                    id: true,
                    rut: true,
                    razonSocial: true,
                    alias: true,
                    codigoCartera: true,
                    agenteId: true,
                    activo: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.cliente.count({ where }),
        ]);
        return res.json({ items: clientes, total, take, skip: sk });
    }
    catch (err) {
        console.error("listClientes error:", err);
        return res.status(500).json({ error: "Error interno listando clientes" });
    }
};
exports.listClientes = listClientes;
/**
 * GET /api/clientes/:id
 */
const getClienteById = async (req, res) => {
    try {
        const id = parseIdParam(req);
        if (!id)
            return res.status(400).json({ error: "ID inválido" });
        const cliente = await prisma.cliente.findUnique({
            where: { id },
            select: {
                id: true,
                rut: true,
                razonSocial: true,
                alias: true,
                codigoCartera: true,
                agenteId: true,
                activo: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!cliente)
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.json(cliente);
    }
    catch (err) {
        console.error("getClienteById error:", err);
        return res.status(500).json({ error: "Error interno obteniendo cliente" });
    }
};
exports.getClienteById = getClienteById;
/**
 * POST /api/clientes
 * body: { rut, razonSocial, alias?, codigoCartera?, agenteId?, activo? }
 *
 * ✅ Regla sugerida:
 * - ADMIN / SUPERVISOR: puede crear y asignar agenteId
 */
const createCliente = async (req, res) => {
    try {
        if (!isPrivileged(req)) {
            return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
        }
        const body = req.body;
        const rut = (body.rut ?? "").trim();
        const razonSocial = (body.razonSocial ?? "").trim();
        if (!rut || !razonSocial) {
            return res.status(400).json({ error: "rut y razonSocial son obligatorios" });
        }
        const agenteId = body.agenteId === null || body.agenteId === undefined || body.agenteId === ""
            ? null
            : Number(body.agenteId);
        if (agenteId !== null && Number.isNaN(agenteId)) {
            return res.status(400).json({ error: "agenteId inválido" });
        }
        if (agenteId !== null) {
            const chk = await ensureAgenteExists(agenteId);
            if (!chk.ok)
                return res.status(400).json({ error: chk.error });
        }
        const exists = await prisma.cliente.findFirst({ where: { rut } });
        if (exists)
            return res.status(409).json({ error: "Ya existe un cliente con ese RUT" });
        const created = await prisma.cliente.create({
            data: {
                rut,
                razonSocial,
                alias: body.alias ?? null,
                codigoCartera: body.codigoCartera ?? null,
                agenteId,
                activo: body.activo ?? true,
            },
            select: {
                id: true,
                rut: true,
                razonSocial: true,
                alias: true,
                codigoCartera: true,
                agenteId: true,
                activo: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return res.status(201).json(created);
    }
    catch (err) {
        console.error("createCliente error:", err);
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Cliente duplicado (unique constraint)" });
        }
        return res.status(500).json({ error: "Error interno creando cliente" });
    }
};
exports.createCliente = createCliente;
/**
 * PATCH /api/clientes/:id
 * body: { rut?, razonSocial?, alias?, codigoCartera?, agenteId?, activo? }
 *
 * ✅ Permisos:
 * - ADMIN/SUPERVISOR: puede editar todo (incluye agenteId)
 * - AGENTE: puede editar SOLO alias / codigoCartera (si quieres) y NO puede tocar agenteId ni activo.
 *
 * Ajusta la whitelist según tu regla real.
 */
const updateCliente = async (req, res) => {
    try {
        const id = parseIdParam(req);
        if (!id)
            return res.status(400).json({ error: "ID inválido" });
        const role = req.user?.role;
        const body = req.body;
        const data = {};
        // ---- Campos "sensibles" (rut/razonSocial/activo/agenteId) ----
        const wantsRut = body.rut !== undefined;
        const wantsRazon = body.razonSocial !== undefined;
        const wantsActivo = body.activo !== undefined;
        const wantsAgenteId = body.agenteId !== undefined;
        const isPriv = isPrivileged(req);
        // Si es AGENTE, bloquea cambios sensibles (puedes ajustar esta regla)
        if (!isPriv && (wantsRut || wantsRazon || wantsActivo || wantsAgenteId)) {
            return res.status(403).json({
                error: "Sin permisos para modificar rut/razonSocial/activo/agenteId (solo admin/supervisor)",
            });
        }
        // rut
        if (wantsRut) {
            const rut = asTrimmedString(body.rut);
            if (!rut)
                return res.status(400).json({ error: "rut no puede ser vacío" });
            data.rut = rut;
        }
        // razonSocial
        if (wantsRazon) {
            const rs = asTrimmedString(body.razonSocial);
            if (!rs)
                return res.status(400).json({ error: "razonSocial no puede ser vacío" });
            data.razonSocial = rs;
        }
        // alias / codigoCartera (permitidos para todos por defecto)
        const alias = asNullableTrimmedString(body.alias);
        if (alias !== undefined)
            data.alias = alias;
        const codigoCartera = asNullableTrimmedString(body.codigoCartera);
        if (codigoCartera !== undefined)
            data.codigoCartera = codigoCartera;
        // agenteId (solo priv)
        if (wantsAgenteId) {
            if (!isPriv) {
                return res.status(403).json({ error: "Sin permisos para reasignar agente" });
            }
            const parsed = parseNullableNumber(body.agenteId);
            if (parsed === NaN)
                return res.status(400).json({ error: "agenteId inválido" });
            if (parsed === null) {
                data.agenteId = null;
            }
            else if (typeof parsed === "number") {
                const chk = await ensureAgenteExists(parsed);
                if (!chk.ok)
                    return res.status(400).json({ error: chk.error });
                data.agenteId = parsed;
            }
        }
        // activo (solo priv)
        if (wantsActivo) {
            if (!isPriv) {
                return res
                    .status(403)
                    .json({ error: "Sin permisos para cambiar estado (solo admin/supervisor)" });
            }
            data.activo = Boolean(body.activo);
        }
        // nada que actualizar
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "No hay campos válidos para actualizar" });
        }
        const updated = await prisma.cliente.update({
            where: { id },
            data,
            select: {
                id: true,
                rut: true,
                razonSocial: true,
                alias: true,
                codigoCartera: true,
                agenteId: true,
                activo: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        console.error("updateCliente error:", err);
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Cliente no encontrado" });
        if (err?.code === "P2002")
            return res.status(409).json({ error: "rut duplicado (unique constraint)" });
        return res.status(500).json({ error: "Error interno actualizando cliente" });
    }
};
exports.updateCliente = updateCliente;
/**
 * PATCH /api/clientes/:id/asignar-agente
 * body: { agenteId: number | null }
 *
 * ✅ endpoint explícito para reasignar (admin/supervisor)
 */
const assignAgenteToCliente = async (req, res) => {
    try {
        if (!isPrivileged(req)) {
            return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
        }
        const id = parseIdParam(req);
        if (!id)
            return res.status(400).json({ error: "ID inválido" });
        const { agenteId } = req.body;
        if (agenteId !== null && agenteId !== undefined) {
            if (typeof agenteId !== "number" || Number.isNaN(agenteId)) {
                return res.status(400).json({ error: "agenteId inválido" });
            }
            const chk = await ensureAgenteExists(agenteId);
            if (!chk.ok)
                return res.status(400).json({ error: chk.error });
        }
        const updated = await prisma.cliente.update({
            where: { id },
            data: { agenteId: agenteId ?? null },
            select: {
                id: true,
                rut: true,
                razonSocial: true,
                alias: true,
                codigoCartera: true,
                agenteId: true,
                activo: true,
                updatedAt: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        console.error("assignAgenteToCliente error:", err);
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.status(500).json({ error: "Error interno reasignando agente" });
    }
};
exports.assignAgenteToCliente = assignAgenteToCliente;
/**
 * PATCH /api/clientes/reasignar-masivo
 * body: { clienteIds: number[], agenteId: number | null }
 *
 * ✅ reasignación masiva (admin/supervisor)
 */
const bulkAssignAgente = async (req, res) => {
    try {
        if (!isPrivileged(req)) {
            return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
        }
        const { clienteIds, agenteId } = req.body;
        if (!Array.isArray(clienteIds) || clienteIds.length === 0) {
            return res.status(400).json({ error: "clienteIds debe ser un array con elementos" });
        }
        const ids = clienteIds.map(Number).filter((n) => Number.isFinite(n));
        if (ids.length !== clienteIds.length) {
            return res.status(400).json({ error: "clienteIds contiene valores inválidos" });
        }
        if (agenteId !== null && agenteId !== undefined) {
            if (typeof agenteId !== "number" || Number.isNaN(agenteId)) {
                return res.status(400).json({ error: "agenteId inválido" });
            }
            const chk = await ensureAgenteExists(agenteId);
            if (!chk.ok)
                return res.status(400).json({ error: chk.error });
        }
        const result = await prisma.cliente.updateMany({
            where: { id: { in: ids } },
            data: { agenteId: agenteId ?? null },
        });
        return res.json({ updatedCount: result.count });
    }
    catch (err) {
        console.error("bulkAssignAgente error:", err);
        return res.status(500).json({ error: "Error interno reasignando masivo" });
    }
};
exports.bulkAssignAgente = bulkAssignAgente;
/**
 * DELETE /api/clientes/:id
 * (Hard delete)
 *
 * ✅ Solo ADMIN
 */
const deleteCliente = async (req, res) => {
    try {
        if (!isAdmin(req)) {
            return res.status(403).json({ error: "Solo ADMIN puede eliminar clientes" });
        }
        const id = parseIdParam(req);
        if (!id)
            return res.status(400).json({ error: "ID inválido" });
        await prisma.cliente.delete({ where: { id } });
        return res.status(204).send();
    }
    catch (err) {
        console.error("deleteCliente error:", err);
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.status(500).json({ error: "Error interno eliminando cliente" });
    }
};
exports.deleteCliente = deleteCliente;
/**
 * PATCH /api/clientes/:id/estado
 * body: { activo: boolean }
 *
 * ✅ admin/supervisor
 */
const setClienteActivo = async (req, res) => {
    try {
        if (!isPrivileged(req)) {
            return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
        }
        const id = parseIdParam(req);
        if (!id)
            return res.status(400).json({ error: "ID inválido" });
        const { activo } = req.body;
        if (typeof activo !== "boolean") {
            return res.status(400).json({ error: "activo debe ser boolean" });
        }
        const updated = await prisma.cliente.update({
            where: { id },
            data: { activo },
            select: {
                id: true,
                rut: true,
                razonSocial: true,
                alias: true,
                codigoCartera: true,
                agenteId: true,
                activo: true,
                updatedAt: true,
            },
        });
        return res.json(updated);
    }
    catch (err) {
        console.error("setClienteActivo error:", err);
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.status(500).json({ error: "Error interno cambiando estado" });
    }
};
exports.setClienteActivo = setClienteActivo;
