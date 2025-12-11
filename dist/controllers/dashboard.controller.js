"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnnouncements = exports.getRecentActivity = exports.getMyKpis = exports.getMyTasks = void 0;
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
/**
 * Endpoint para "Mis Tareas" (GET /my-tasks)
 */
const getMyTasks = async (req, res) => {
    const trabajadorId = req.user?.id;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const tasks = await prisma_1.prisma.tareaAsignada.findMany({
            where: {
                trabajadorId: trabajadorId,
                estado: {
                    not: client_1.EstadoTarea.COMPLETADA,
                },
            },
            orderBy: {
                fechaProgramada: "asc",
            },
            take: 5,
            include: {
                tareaPlantilla: {
                    select: {
                        nombre: true,
                    },
                },
            },
        });
        return res.json(tasks);
    }
    catch (error) {
        console.error("Error obteniendo tareas para el dashboard:", error);
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.getMyTasks = getMyTasks;
/**
 * Endpoint para "Mis KPIs" (GET /my-kpis)
 */
const getMyKpis = async (req, res) => {
    const trabajadorId = req.user?.id;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const [tareasPendientes, ticketsAbiertos, clientesACargo] = await prisma_1.prisma.$transaction([
            // Tareas Pendientes
            prisma_1.prisma.tareaAsignada.count({
                where: {
                    trabajadorId: trabajadorId,
                    estado: {
                        not: client_1.EstadoTarea.COMPLETADA,
                    },
                },
            }),
            // Tickets Abiertos
            prisma_1.prisma.ticket.count({
                where: {
                    trabajadorId: trabajadorId,
                    estado: "open",
                },
            }),
            // Clientes a Cargo
            prisma_1.prisma.cliente.count({
                where: {
                    agenteId: trabajadorId,
                },
            }),
        ]);
        // Documentos Recientes: No es posible con el schema actual.
        // Se necesitaría una tabla que registre las subidas de archivos.
        const documentosRecientes = 0;
        return res.json({
            tareasPendientes,
            ticketsAbiertos,
            clientesACargo,
            documentosRecientes,
        });
    }
    catch (error) {
        console.error("Error obteniendo KPIs para el dashboard:", error);
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.getMyKpis = getMyKpis;
/**
 * Endpoint para "Actividad Reciente" (GET /activity)
 */
const getRecentActivity = async (req, res) => {
    const trabajadorId = req.user?.id;
    if (!trabajadorId) {
        return res.status(401).json({ message: "No autorizado" });
    }
    try {
        const activities = await prisma_1.prisma.notificacion.findMany({
            where: {
                trabajadorId: trabajadorId,
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 5,
        });
        return res.json(activities);
    }
    catch (error) {
        console.error("Error obteniendo actividad reciente para el dashboard:", error);
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.getRecentActivity = getRecentActivity;
/**
 * Endpoint para "Anuncios" (GET /announcements)
 */
const getAnnouncements = async (req, res) => {
    try {
        // NOTA: El modelo 'Anuncio' no existe en el schema.prisma actual.
        // Para implementar esta funcionalidad, se necesitaría un modelo como:
        // model Anuncio {
        //   id        Int      @id @default(autoincrement())
        //   titulo    String
        //   contenido String
        //   activo    Boolean  @default(true)
        //   createdAt DateTime @default(now())
        // }
        // Cuando el modelo exista, la consulta sería funcional.
        // Por ahora, se devuelve un array vacío.
        return res.json([]);
    }
    catch (error) {
        console.error("Error obteniendo anuncios para el dashboard:", error);
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};
exports.getAnnouncements = getAnnouncements;
