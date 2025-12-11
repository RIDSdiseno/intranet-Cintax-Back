"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTrabajadores = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
const listTrabajadores = async (req, res) => {
    try {
        const { search, categoria, area, estado } = req.query;
        const trabajadores = await prisma.trabajador.findMany({
            select: {
                id_trabajador: true,
                nombre: true,
                email: true,
                tipoRelacion: true,
                areaInterna: true,
                status: true,
                lastActivityAt: true,
                tareasAsignadas: {
                    select: {
                        estado: true,
                    },
                },
            },
            orderBy: { nombre: "asc" },
        });
        let personas = trabajadores.map((t) => {
            const categoriaFront = mapCategoriaFromArea(t.areaInterna ?? null);
            const areaFront = mapAreaFromTipoRelacion(t.tipoRelacion ?? null);
            const estadoFront = t.status ? "Activo" : "Inactivo";
            const rolFront = mapRolFromTipoRelacion(t.tipoRelacion ?? null);
            const proyectosActivos = t.tareasAsignadas.filter((ta) => ta.estado === client_1.EstadoTarea.PENDIENTE ||
                ta.estado === client_1.EstadoTarea.EN_PROCESO).length;
            return {
                id: t.id_trabajador,
                nombre: t.nombre,
                email: t.email,
                rol: rolFront,
                area: areaFront, // Área “humana”
                categoria: categoriaFront, // Contabilidad / Tributario / Entre otros
                estado: estadoFront,
                activo: t.status,
                ultimoLogin: t.lastActivityAt,
                proyectosActivos,
                areaInterna: t.areaInterna ?? null, // 👈 ENUM crudo: CONTA, TRIBUTARIO, etc.
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
                (p.areaInterna ?? "").toLowerCase().includes(q));
        }
        // Devolvemos directamente el array
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
