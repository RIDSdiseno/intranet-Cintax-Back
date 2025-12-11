"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marcarTodasComoLeidas = exports.marcarComoLeida = exports.getNotificacionesResumen = exports.getNotificaciones = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
// =============================================
// GET /api/notificaciones
// Lista de notificaciones con filtros por mes/año
// =============================================
const getNotificaciones = async (req, res) => {
    const trabajadorId = req.user?.id;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const { mes, anio } = req.query;
        let where = { trabajadorId };
        // -------------------------------------------
        // FILTRO POR MES / AÑO (vencimiento de tarea)
        // -------------------------------------------
        if (mes && anio) {
            const month = Number(mes);
            const year = Number(anio);
            const inicioMes = new Date(year, month - 1, 1);
            const finMes = new Date(year, month, 0, 23, 59, 59);
            const tareasFiltradas = await prisma_1.prisma.tareaAsignada.findMany({
                where: {
                    fechaProgramada: {
                        gte: inicioMes,
                        lte: finMes,
                    },
                },
                select: { id_tarea_asignada: true },
            });
            const ids = tareasFiltradas.map((t) => t.id_tarea_asignada);
            where.tareaId = { in: ids };
        }
        // -------------------------------------------
        // CONSULTA FINAL
        // -------------------------------------------
        const notificaciones = await prisma_1.prisma.notificacion.findMany({
            where,
            include: {
                tarea: { select: { fechaProgramada: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        // Por si acaso, eliminar duplicados
        const sinDuplicados = Array.from(new Map(notificaciones.map((n) => [n.id, n])).values());
        return res.json(sinDuplicados);
    }
    catch (error) {
        console.error("Error obteniendo notificaciones:", error);
        return res.status(500).json({
            message: "Error al obtener las notificaciones",
        });
    }
};
exports.getNotificaciones = getNotificaciones;
// =============================================
// GET /api/notificaciones/resumen
// Resumen estadístico del usuario
// =============================================
const getNotificacionesResumen = async (req, res) => {
    const trabajadorId = req.user?.id;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const { mes, anio } = req.query;
        let where = { trabajadorId };
        let filtroFecha = {};
        // -------------------------------------------------------
        // FILTRO POR MES/AÑO basado en fecha de vencimiento
        // -------------------------------------------------------
        if (mes && anio) {
            const month = Number(mes);
            const year = Number(anio);
            const inicioMes = new Date(year, month - 1, 1);
            const finMes = new Date(year, month, 0, 23, 59, 59);
            const tareasMes = await prisma_1.prisma.tareaAsignada.findMany({
                where: {
                    fechaProgramada: { gte: inicioMes, lte: finMes },
                },
                select: { id_tarea_asignada: true },
            });
            filtroFecha.tareaId = { in: tareasMes.map((t) => t.id_tarea_asignada) };
            where = { ...where, ...filtroFecha };
        }
        // ======================
        // CONSULTA PRINCIPAL
        // ======================
        const notificaciones = await prisma_1.prisma.notificacion.findMany({ where });
        const total = notificaciones.length;
        const noLeidas = notificaciones.filter((n) => !n.leida).length;
        // Agrupar por mes (según createdAt)
        const porMes = Object.values(notificaciones.reduce((acc, n) => {
            const f = new Date(n.createdAt);
            const key = `${f.getFullYear()}-${f.getMonth() + 1}`;
            if (!acc[key])
                acc[key] = { periodo: key, total: 0 };
            acc[key].total++;
            return acc;
        }, {}));
        // Agrupar por tarea
        const porTarea = Object.values(notificaciones.reduce((acc, n) => {
            const key = n.tareaId || "sin_tarea";
            if (!acc[key])
                acc[key] = { tareaId: key, total: 0 };
            acc[key].total++;
            return acc;
        }, {}));
        return res.json({
            total,
            noLeidas,
            porMes,
            porTarea,
        });
    }
    catch (error) {
        console.error("Error en resumen de notificaciones:", error);
        return res.status(500).json({
            message: "Error al obtener resumen",
        });
    }
};
exports.getNotificacionesResumen = getNotificacionesResumen;
// =============================================
// PATCH /api/notificaciones/:id/leida
// Marca una notificación como leída
// =============================================
const marcarComoLeida = async (req, res) => {
    const trabajadorId = req.user?.id;
    const { id } = req.params;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const notificacionActualizada = await prisma_1.prisma.notificacion.update({
            where: {
                id,
                trabajadorId,
            },
            data: { leida: true },
        });
        return res.json(notificacionActualizada);
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025") {
            return res.status(404).json({
                message: "Notificación no encontrada o no pertenece al usuario.",
            });
        }
        console.error(error);
        return res.status(500).json({
            message: "Error al marcar la notificación como leída",
        });
    }
};
exports.marcarComoLeida = marcarComoLeida;
// =============================================
// POST /api/notificaciones/marcar-todas-leidas
// Marca todas las no leídas
// =============================================
const marcarTodasComoLeidas = async (req, res) => {
    const trabajadorId = req.user?.id;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const result = await prisma_1.prisma.notificacion.updateMany({
            where: {
                trabajadorId,
                leida: false,
            },
            data: { leida: true },
        });
        return res.json({
            message: "Todas las notificaciones han sido marcadas como leídas.",
            count: result.count,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Error al marcar todas como leídas",
        });
    }
};
exports.marcarTodasComoLeidas = marcarTodasComoLeidas;
