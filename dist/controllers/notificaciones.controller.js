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
    const trabajadorIdRaw = req.user?.id;
    const trabajadorId = typeof trabajadorIdRaw === "string"
        ? Number(trabajadorIdRaw)
        : trabajadorIdRaw;
    if (!trabajadorId || !Number.isFinite(trabajadorId)) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const mesRaw = req.query.mes;
        const anioRaw = req.query.anio;
        const where = { trabajadorId };
        // -------------------------------------------
        // FILTRO POR MES / AÑO (vencimiento de tarea)
        // -------------------------------------------
        if (mesRaw != null && anioRaw != null) {
            const month = Number(mesRaw);
            const year = Number(anioRaw);
            if (!Number.isFinite(month) || month < 1 || month > 12) {
                return res.status(400).json({ message: "mes inválido (1-12)" });
            }
            if (!Number.isFinite(year) || year < 1900 || year > 3000) {
                return res.status(400).json({ message: "anio inválido" });
            }
            const inicioMes = new Date(year, month - 1, 1, 0, 0, 0);
            const finMes = new Date(year, month, 0, 23, 59, 59, 999);
            // ✅ filtra directamente por la relación hacia la tarea
            where.tarea = {
                fechaProgramada: {
                    gte: inicioMes,
                    lte: finMes,
                },
            };
        }
        // -------------------------------------------
        // CONSULTA FINAL
        // -------------------------------------------
        const notificaciones = await prisma_1.prisma.notificacion.findMany({
            where,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                mensaje: true,
                leida: true,
                createdAt: true,
                updatedAt: true,
                trabajadorId: true,
                tareaId: true,
                tarea: { select: { fechaProgramada: true } },
            },
        });
        return res.json(notificaciones);
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
            filtroFecha.tareaId = {
                in: tareasMes.map((t) => t.id_tarea_asignada),
            };
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
    // id viene como string desde la ruta → lo convertimos a number
    const notificacionId = Number(id);
    if (Number.isNaN(notificacionId)) {
        return res.status(400).json({ message: "ID de notificación inválido" });
    }
    try {
        // 1) Verificar que la notificación exista y sea del usuario
        const notificacion = await prisma_1.prisma.notificacion.findFirst({
            where: {
                id: notificacionId,
                trabajadorId,
            },
        });
        if (!notificacion) {
            return res.status(404).json({
                message: "Notificación no encontrada o no pertenece al usuario.",
            });
        }
        // 2) Marcar como leída usando solo el ID (clave única)
        const notificacionActualizada = await prisma_1.prisma.notificacion.update({
            where: {
                id: notificacionId,
            },
            data: { leida: true },
        });
        return res.json(notificacionActualizada);
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025") {
            return res.status(404).json({
                message: "Notificación no encontrada.",
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
