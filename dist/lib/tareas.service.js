"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerTareasPorTrabajador = obtenerTareasPorTrabajador;
// src/lib/tareas.service.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const mapEstado = (estado) => {
    if (estado === "COMPLETADA")
        return "completado";
    if (estado === "VENCIDA")
        return "atrasado";
    // PENDIENTE o EN_PROCESO
    return "pendiente";
};
async function obtenerTareasPorTrabajador(opts) {
    const { soloPendientes = false, trabajadorId } = opts || {};
    const whereTrabajador = { status: true };
    if (trabajadorId)
        whereTrabajador.id_trabajador = trabajadorId;
    const whereTarea = {};
    if (soloPendientes) {
        whereTarea.estado = {
            in: [client_1.EstadoTarea.PENDIENTE, client_1.EstadoTarea.EN_PROCESO],
        };
    }
    const trabajadores = await prisma.trabajador.findMany({
        where: whereTrabajador,
        include: {
            tareasAsignadas: {
                where: whereTarea,
                include: {
                    tareaPlantilla: true,
                },
                orderBy: { fechaProgramada: "asc" },
            },
        },
    });
    // Lo mapeamos al formato que usa tu front (Analista / Cliente / Tarea)
    const analistas = trabajadores.map((t) => {
        const tareasFront = t.tareasAsignadas.map((ta) => ({
            id: String(ta.id_tarea_asignada),
            nombre: ta.tareaPlantilla?.nombre ?? "Tarea sin nombre",
            vencimiento: ta.fechaProgramada.toISOString(),
            estado: mapEstado(ta.estado),
            comentario: ta.comentarios ?? undefined,
        }));
        const total = tareasFront.length;
        const completadas = tareasFront.filter((x) => x.estado === "completado")
            .length;
        const progreso = total > 0 ? Math.round((completadas / total) * 100) : 0;
        // HACK: Como aún no conectamos a un modelo Cliente real,
        // agrupamos todas las tareas del trabajador en un "cliente virtual"
        return {
            id: `a-${t.id_trabajador}`,
            nombre: t.nombre,
            email: t.email,
            avatar: t.nombre.charAt(0).toUpperCase(),
            clientes: [
                {
                    id: `c-${t.id_trabajador}-pendientes`,
                    nombre: "Tareas pendientes",
                    rut: "",
                    email: "",
                    progreso,
                    tareas: tareasFront,
                },
            ],
            cargaTotal: total,
            completadas,
        };
    });
    return analistas;
}
