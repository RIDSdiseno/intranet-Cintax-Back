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
        // podrías usar algún campo extra con una fecha fija,
        // aquí retornamos null para no crear nada nuevo automáticamente.
        return null;
    }
    return null;
}
async function generarTareasAutomaticas(fechaReferencia = new Date()) {
    // 1) traer todas las plantillas activas que tengan frecuencia configurada
    const plantillas = await prisma.tareaPlantilla.findMany({
        where: { activo: true },
    });
    for (const tpl of plantillas) {
        const dueDate = getNextDueDate(tpl, fechaReferencia);
        if (!dueDate)
            continue;
        // 2) Evitar duplicar: ver si ya existe una tarea para esta plantilla
        //    en el mismo "periodo" (mes o semana, según frecuencia)
        let startPeriod;
        let endPeriod;
        if (tpl.frecuencia === "MENSUAL") {
            startPeriod = startOfMonth(dueDate);
            endPeriod = startOfNextMonth(dueDate);
        }
        else if (tpl.frecuencia === "SEMANAL") {
            startPeriod = startOfWeek(dueDate);
            endPeriod = startOfNextWeek(dueDate);
        }
        else {
            // UNICA u otra → si ya existe cualquiera, no crear otra
            startPeriod = new Date(2000, 0, 1);
            endPeriod = new Date(2100, 0, 1);
        }
        const yaExiste = await prisma.tareaAsignada.findFirst({
            where: {
                tareaPlantillaId: tpl.id_tarea_plantilla,
                fechaProgramada: {
                    gte: startPeriod,
                    lt: endPeriod,
                },
            },
        });
        if (yaExiste)
            continue;
        // 3) Crear la tarea asignada
        await prisma.tareaAsignada.create({
            data: {
                tareaPlantillaId: tpl.id_tarea_plantilla,
                fechaProgramada: dueDate,
                trabajadorId: tpl.responsableDefaultId ?? null,
                estado: "PENDIENTE",
            },
        });
        console.log(`Creada tarea para plantilla ${tpl.nombre} con fecha ${dueDate.toISOString().slice(0, 10)}`);
    }
}
