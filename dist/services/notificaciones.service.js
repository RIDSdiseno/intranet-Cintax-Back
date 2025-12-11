"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarNotificacionesDeVencimiento = generarNotificacionesDeVencimiento;
// src/services/notificaciones.service.ts
const client_1 = require("@prisma/client");
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
const prisma = new client_1.PrismaClient();
// Define con cuántos días de antelación se notifica una tarea "próxima a vencer"
const DIAS_ANTELACION = 3;
/**
 * Genera notificaciones para tareas vencidas y próximas a vencer.
 */
async function generarNotificacionesDeVencimiento() {
    console.log('Iniciando la generación de notificaciones de vencimiento...');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaLimite = new Date(hoy);
    fechaLimite.setDate(hoy.getDate() + DIAS_ANTELACION);
    const tareasActivas = await prisma.tareaAsignada.findMany({
        where: {
            estado: { not: client_1.EstadoTarea.COMPLETADA },
            trabajadorId: { not: null },
            fechaProgramada: { lte: fechaLimite },
        },
        include: {
            tareaPlantilla: {
                select: { nombre: true },
            },
        },
    });
    if (tareasActivas.length === 0) {
        console.log('No hay tareas vencidas o próximas a vencer.');
        return;
    }
    const tareaIds = tareasActivas.map(t => t.id_tarea_asignada);
    const notificacionesExistentes = await prisma.notificacion.findMany({
        where: {
            tareaId: { in: tareaIds },
        },
        select: {
            trabajadorId: true,
            tareaId: true,
            mensaje: true,
        },
    });
    const cacheNotificaciones = new Set(notificacionesExistentes.map(n => `${n.trabajadorId}-${n.tareaId}-${n.mensaje}`));
    const notificacionesACrear = [];
    for (const tarea of tareasActivas) {
        if (!tarea.trabajadorId)
            continue;
        const diasParaVencer = (0, date_fns_1.differenceInDays)(tarea.fechaProgramada, hoy);
        const nombreTarea = tarea.tareaPlantilla.nombre;
        // Formatear fecha de vencimiento como: 13 de diciembre de 2025
        const fechaFormateada = (0, date_fns_1.format)(tarea.fechaProgramada, "d 'de' MMMM yyyy", { locale: locale_1.es });
        let mensaje = '';
        let claveCache = '';
        // TAREA VENCIDA
        if (diasParaVencer < 0) {
            mensaje = `La tarea "${nombreTarea}" está vencida. Fecha de vencimiento: ${fechaFormateada}.`;
            claveCache = `${tarea.trabajadorId}-${tarea.id_tarea_asignada}-${mensaje}`;
        }
        // TAREA PRÓXIMA A VENCER
        else if (diasParaVencer >= 0 && diasParaVencer <= DIAS_ANTELACION) {
            const textoVencimiento = diasParaVencer === 0
                ? 'vence hoy'
                : `vence en ${diasParaVencer} día(s)`;
            mensaje = `La tarea "${nombreTarea}" ${textoVencimiento}. Fecha programada: ${fechaFormateada}.`;
            claveCache = `${tarea.trabajadorId}-${tarea.id_tarea_asignada}-${mensaje}`;
        }
        if (mensaje && !cacheNotificaciones.has(claveCache)) {
            notificacionesACrear.push({
                trabajadorId: tarea.trabajadorId,
                tareaId: tarea.id_tarea_asignada,
                mensaje: mensaje,
            });
            cacheNotificaciones.add(claveCache);
        }
    }
    if (notificacionesACrear.length > 0) {
        const resultado = await prisma.notificacion.createMany({
            data: notificacionesACrear,
        });
        console.log(`${resultado.count} notificaciones creadas.`);
    }
    else {
        console.log('No se crearon notificaciones nuevas.');
    }
    console.log('Finalizada la generación de notificaciones.');
}
