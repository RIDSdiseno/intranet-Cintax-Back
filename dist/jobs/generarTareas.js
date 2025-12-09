"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarTareasAutomaticas = generarTareasAutomaticas;
// src/jobs/generarTareas.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// util: primer día del mes
function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}
// util: primer día del mes siguiente
function startOfNextMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}
// util: lunes de la semana de `date` (asumiendo lunes=1)
function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay() || 7; // domingo=0 → 7
    d.setHours(0, 0, 0, 0);
    if (day > 1)
        d.setDate(d.getDate() - (day - 1));
    return d;
}
// util: lunes de la semana siguiente
function startOfNextWeek(date) {
    const start = startOfWeek(date);
    start.setDate(start.getDate() + 7);
    return start;
}
// calcula próxima fecha de vencimiento según plantilla
function getNextDueDate(tpl, today) {
    // OJO: tpl.frecuencia viene del enum FrecuenciaTarea,
    // pero Prisma lo expone como string: "MENSUAL" | "SEMANAL" | "UNICA"
    if (tpl.frecuencia === "MENSUAL" && tpl.diaMesVencimiento) {
        const day = tpl.diaMesVencimiento;
        const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), day, 9, 0, 0, 0);
        if (thisMonthDue >= today) {
            return thisMonthDue;
        }
        // si ya pasó, siguiente mes
        return new Date(today.getFullYear(), today.getMonth() + 1, day, 9, 0, 0, 0);
    }
    if (tpl.frecuencia === "SEMANAL" && tpl.diaSemanaVencimiento) {
        const targetDow = tpl.diaSemanaVencimiento; // 1-7
        const base = new Date(today);
        base.setHours(9, 0, 0, 0);
        // día de la semana actual, 1-7
        const todayDow = base.getDay() || 7;
        const diff = targetDow - todayDow;
        if (diff >= 0) {
            base.setDate(base.getDate() + diff);
            return base;
        }
        else {
            // semana siguiente
            base.setDate(base.getDate() + 7 + diff);
            return base;
        }
    }
    if (tpl.frecuencia === "UNICA") {
        // En tu lógica actual, UNICA no crea nada automático
        // (si quieres, luego lo cambiamos para que cree una sola vez).
        return null;
    }
    return null;
}
async function generarTareasAutomaticas(fechaReferencia = new Date()) {
    // 1) Plantillas activas
    const plantillas = await prisma.tareaPlantilla.findMany({
        where: { activo: true },
        select: {
            id_tarea_plantilla: true,
            area: true,
            frecuencia: true,
            diaMesVencimiento: true,
            diaSemanaVencimiento: true,
            responsableDefaultId: true,
            nombre: true,
        },
    });
    // 2) Trabajadores activos agrupados por áreaInterna
    const allWorkers = await prisma.trabajador.findMany({
        where: { status: true, areaInterna: { not: null } },
        select: { id_trabajador: true, areaInterna: true },
    });
    const workersByArea = {};
    for (const w of allWorkers) {
        if (!w.areaInterna)
            continue;
        if (!workersByArea[w.areaInterna]) {
            workersByArea[w.areaInterna] = [];
        }
        workersByArea[w.areaInterna].push(w.id_trabajador);
    }
    // 3) Por cada plantilla...
    for (const tpl of plantillas) {
        const dueDate = getNextDueDate({
            frecuencia: tpl.frecuencia,
            diaMesVencimiento: tpl.diaMesVencimiento,
            diaSemanaVencimiento: tpl.diaSemanaVencimiento,
        }, fechaReferencia);
        if (!dueDate)
            continue;
        // Rango del período (para no duplicar dentro del mismo mes/semana)
        let startPeriod;
        let endPeriod;
        if (tpl.frecuencia === client_1.FrecuenciaTarea.MENSUAL) {
            startPeriod = startOfMonth(dueDate);
            endPeriod = startOfNextMonth(dueDate);
        }
        else if (tpl.frecuencia === client_1.FrecuenciaTarea.SEMANAL) {
            startPeriod = startOfWeek(dueDate);
            endPeriod = startOfNextWeek(dueDate);
        }
        else {
            // UNICA u otra → usamos rango muy amplio
            startPeriod = new Date(2000, 0, 1);
            endPeriod = new Date(2100, 0, 1);
        }
        // 4) Determinar para QUÉ trabajadores crear tareas
        let workerIds = [];
        if (tpl.responsableDefaultId) {
            // Tarea que pertenece a un responsable específico
            workerIds = [tpl.responsableDefaultId];
        }
        else if (tpl.area && workersByArea[tpl.area]?.length) {
            // Tarea "del área": se crea una por cada trabajador del área
            workerIds = workersByArea[tpl.area];
        }
        else {
            // Sin área ni responsable: opcionalmente podrías crear una sin asignar
            workerIds = [];
        }
        // 5) Para cada trabajador, crear SOLO si no tiene aún esa tarea en el período
        for (const workerId of workerIds) {
            const yaExiste = await prisma.tareaAsignada.findFirst({
                where: {
                    tareaPlantillaId: tpl.id_tarea_plantilla,
                    trabajadorId: workerId,
                    fechaProgramada: {
                        gte: startPeriod,
                        lt: endPeriod,
                    },
                },
            });
            if (yaExiste)
                continue;
            await prisma.tareaAsignada.create({
                data: {
                    tareaPlantillaId: tpl.id_tarea_plantilla,
                    fechaProgramada: dueDate,
                    trabajadorId: workerId,
                    estado: client_1.EstadoTarea.PENDIENTE,
                },
            });
            console.log(`Creada tarea "${tpl.nombre}" para plantilla ${tpl.id_tarea_plantilla} ` +
                `para trabajador ${workerId} con fecha ${dueDate
                    .toISOString()
                    .slice(0, 10)}`);
        }
        // Si quisieras además crear UNA tarea sin asignar cuando no hay área ni responsable,
        // aquí podrías hacerlo comprobando trabajadorId = null de forma similar.
    }
}
