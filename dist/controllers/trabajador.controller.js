"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTrabajador = exports.listTrabajadores = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/* =========================
   Helpers mapeo (UI)
========================= */
const mapCategoriaFromArea = (area) => {
    switch (area) {
        case client_1.Area.CONTA:
            return "Contabilidad";
        case client_1.Area.TRIBUTARIO:
            return "Tributario";
        default:
            return "Entre otros";
    }
};
const mapAreaFromTipoRelacion = (tipo) => {
    switch (tipo) {
        case client_1.TipoRelacion.CLIENTES:
            return "Clientes";
        case client_1.TipoRelacion.PROVEEDORES:
            return "Proveedores";
        case client_1.TipoRelacion.INTERNO:
        default:
            return "Interno";
    }
};
const mapRolFromTipoRelacion = (tipo) => {
    switch (tipo) {
        case client_1.TipoRelacion.CLIENTES:
            return "Clientes";
        case client_1.TipoRelacion.PROVEEDORES:
            return "Proveedores";
        case client_1.TipoRelacion.INTERNO:
            return "Interno";
        default:
            return "Sin rol";
    }
};
function asString(v) {
    return typeof v === "string" ? v : "";
}
function canEditUsers(role) {
    return role === "ADMIN" || role === "SUPERVISOR";
}
/* =========================
   GET /api/trabajadores
========================= */
const listTrabajadores = async (req, res) => {
    try {
        const search = asString(req.query.search);
        const categoria = asString(req.query.categoria);
        const area = asString(req.query.area);
        const estado = asString(req.query.estado);
        const trabajadores = await prisma.trabajador.findMany({
            select: {
                id_trabajador: true,
                nombre: true,
                email: true,
                tipoRelacion: true,
                areaInterna: true,
                carpetaDriveCodigo: true,
                status: true,
                lastActivityAt: true,
                tareasAsignadas: {
                    select: { estado: true },
                },
            },
            orderBy: { nombre: "asc" },
        });
        let personas = trabajadores.map((t) => {
            const categoriaFront = mapCategoriaFromArea(t.areaInterna ?? null);
            const areaFront = mapAreaFromTipoRelacion(t.tipoRelacion ?? null);
            const estadoFront = t.status ? "Activo" : "Inactivo";
            const rolFront = mapRolFromTipoRelacion(t.tipoRelacion ?? null);
            const proyectosActivos = (t.tareasAsignadas || []).filter((ta) => ta.estado === client_1.EstadoTarea.PENDIENTE ||
                ta.estado === client_1.EstadoTarea.EN_PROCESO).length;
            return {
                id: t.id_trabajador, // compat
                id_trabajador: t.id_trabajador,
                nombre: t.nombre,
                email: t.email,
                areaInterna: t.areaInterna ?? null,
                carpetaDriveCodigo: t.carpetaDriveCodigo ?? null,
                tipoRelacion: t.tipoRelacion ?? null, // ✅ clave para edición
                rol: rolFront,
                area: areaFront,
                categoria: categoriaFront,
                estado: estadoFront,
                activo: t.status,
                ultimoLogin: t.lastActivityAt ?? null,
                proyectosActivos,
            };
        });
        // Filtro por categoría
        if (categoria === "Contabilidad" ||
            categoria === "Tributario" ||
            categoria === "Entre otros") {
            personas = personas.filter((p) => p.categoria === categoria);
        }
        // Filtro por área
        if (area === "Clientes" || area === "Proveedores" || area === "Interno") {
            personas = personas.filter((p) => p.area === area);
        }
        // Filtro por estado
        if (estado === "Activo" || estado === "Inactivo") {
            personas = personas.filter((p) => p.estado === estado);
        }
        // Filtro por búsqueda libre
        if (search && search.trim() !== "") {
            const q = search.trim().toLowerCase();
            personas = personas.filter((p) => p.nombre.toLowerCase().includes(q) ||
                p.email.toLowerCase().includes(q) ||
                p.area.toLowerCase().includes(q) ||
                p.rol.toLowerCase().includes(q) ||
                p.categoria.toLowerCase().includes(q) ||
                p.estado.toLowerCase().includes(q) ||
                (p.areaInterna ?? "").toString().toLowerCase().includes(q) ||
                (p.carpetaDriveCodigo ?? "").toLowerCase().includes(q) ||
                (p.tipoRelacion ?? "").toString().toLowerCase().includes(q));
        }
        return res.json(personas);
    }
    catch (err) {
        console.error("listTrabajadores error:", err);
        return res
            .status(500)
            .json({ error: "Error interno listando trabajadores" });
    }
};
exports.listTrabajadores = listTrabajadores;
/* =========================
   PATCH /api/trabajadores/:id
   (solo ADMIN / SUPERVISOR)
   - permite editar TODO menos email
========================= */
const updateTrabajador = async (req, res) => {
    try {
        const actor = req.user;
        if (!actor?.id)
            return res.status(401).json({ error: "No autenticado" });
        if (!canEditUsers(actor.role)) {
            return res.status(403).json({ error: "No autorizado" });
        }
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const target = await prisma.trabajador.findUnique({
            where: { id_trabajador: id },
            select: {
                id_trabajador: true,
                email: true,
                areaInterna: true,
            },
        });
        if (!target) {
            return res.status(404).json({ error: "Trabajador no encontrado" });
        }
        // Body permitido (NO email)
        const body = req.body;
        // 🔒 Reglas anti-escalamiento
        if (actor.role === "SUPERVISOR") {
            // Supervisor no edita Admin
            if (target.areaInterna === client_1.Area.ADMIN) {
                return res
                    .status(403)
                    .json({ error: "Supervisor no puede editar usuarios ADMIN" });
            }
            // Supervisor no asigna Admin
            if (body.areaInterna === client_1.Area.ADMIN) {
                return res
                    .status(403)
                    .json({ error: "Supervisor no puede asignar rol ADMIN" });
            }
        }
        // Construimos data solo con lo permitido
        const data = {};
        if (body.nombre !== undefined)
            data.nombre = String(body.nombre).trim();
        if (body.status !== undefined)
            data.status = Boolean(body.status);
        if (body.tipoRelacion !== undefined) {
            // permite null
            data.tipoRelacion = body.tipoRelacion ?? null;
        }
        if (body.areaInterna !== undefined) {
            // permite null
            data.areaInterna = body.areaInterna ?? null;
        }
        if (body.carpetaDriveCodigo !== undefined) {
            data.carpetaDriveCodigo = body.carpetaDriveCodigo ?? null;
        }
        // (opcional) si quieres rechazar cambios de email explícitamente:
        // if (body.email !== undefined) {
        //   return res.status(400).json({ error: "El email no se puede modificar" });
        // }
        const updated = await prisma.trabajador.update({
            where: { id_trabajador: id },
            data,
            select: {
                id_trabajador: true,
                nombre: true,
                email: true,
                tipoRelacion: true,
                areaInterna: true,
                carpetaDriveCodigo: true,
                status: true,
                lastActivityAt: true,
                createdAt: true,
            },
        });
        return res.json({ trabajador: updated });
    }
    catch (err) {
        console.error("updateTrabajador error:", err);
        return res
            .status(500)
            .json({ error: "Error interno actualizando trabajador" });
    }
};
exports.updateTrabajador = updateTrabajador;
