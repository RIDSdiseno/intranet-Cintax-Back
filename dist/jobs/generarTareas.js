"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarTareasAutomaticas = generarTareasAutomaticas;
// src/jobs/generarTareas.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const SAFE_HOUR = 12;
// util: fija hora segura
function atSafeHour(date) {
    const d = new Date(date);
    d.setHours(SAFE_HOUR, 0, 0, 0);
    return d;
}
// util: primer día del mes
function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, SAFE_HOUR, 0, 0, 0);
}
// util: primer día del mes siguiente
function startOfNextMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, SAFE_HOUR, 0, 0, 0);
}
// util: lunes de la semana de `date`
function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay() || 7; // domingo=0 -> 7
    d.setHours(SAFE_HOUR, 0, 0, 0);
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
function clampDayToMonth(year, month1to12, day) {
    const lastDay = new Date(year, month1to12, 0).getDate();
    return Math.max(1, Math.min(day, lastDay));
}
function buildDate(year, month1to12, day) {
    return new Date(year, month1to12 - 1, day, SAFE_HOUR, 0, 0, 0);
}
// 1=Lun..7=Dom -> JS 0=Dom..6=Sab
function ourDowToJs(our) {
    return our === 7 ? 0 : our;
}
/**
 * Normaliza a:
 * xx.xxx.xxx-x
 * xx.xxx.xxx-K
 */
function normalizeRut(rut) {
    if (!rut)
        return "";
    let clean = rut
        .toString()
        .trim()
        .replace(/\./g, "")
        .replace(/\s+/g, "")
        .toUpperCase();
    if (!clean)
        return "";
    if (!clean.includes("-")) {
        if (clean.length < 2)
            return "";
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1);
        clean = `${body}-${dv}`;
    }
    let [body, dv] = clean.split("-");
    body = (body ?? "").replace(/\D/g, "");
    dv = (dv ?? "").replace(/[^0-9K]/g, "").toUpperCase();
    if (!body || !dv)
        return "";
    const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${bodyFormatted}-${dv}`;
}
// calcula próxima fecha de vencimiento según plantilla
function getNextDueDate(tpl, today) {
    if (tpl.frecuencia === client_1.FrecuenciaTarea.MENSUAL && tpl.diaMesVencimiento) {
        const day = clampDayToMonth(today.getFullYear(), today.getMonth() + 1, tpl.diaMesVencimiento);
        const thisMonthDue = buildDate(today.getFullYear(), today.getMonth() + 1, day);
        if (thisMonthDue >= atSafeHour(today)) {
            return thisMonthDue;
        }
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const nextYear = nextMonth.getFullYear();
        const nextMonth1to12 = nextMonth.getMonth() + 1;
        const nextDay = clampDayToMonth(nextYear, nextMonth1to12, tpl.diaMesVencimiento);
        return buildDate(nextYear, nextMonth1to12, nextDay);
    }
    if (tpl.frecuencia === client_1.FrecuenciaTarea.SEMANAL && tpl.diaSemanaVencimiento) {
        const targetDow = Number(tpl.diaSemanaVencimiento); // 1..7
        const jsTarget = ourDowToJs(targetDow);
        const base = atSafeHour(today);
        const todayJsDow = base.getDay(); // 0..6
        const diff = (jsTarget - todayJsDow + 7) % 7;
        base.setDate(base.getDate() + diff);
        return atSafeHour(base);
    }
    if (tpl.frecuencia === client_1.FrecuenciaTarea.UNICA) {
        return null;
    }
    return null;
}
async function generarTareasAutomaticas(fechaReferencia = new Date(), opts) {
    const onlyArea = opts?.onlyArea ?? client_1.Area.CONTA;
    // 1) Plantillas activas CLIENTE del área
    const plantillas = await prisma.tareaPlantilla.findMany({
        where: {
            activo: true,
            presentacion: client_1.Presentacion.CLIENTE,
            area: onlyArea,
            isVolatile: false,
            frecuencia: {
                in: [client_1.FrecuenciaTarea.MENSUAL, client_1.FrecuenciaTarea.SEMANAL],
            },
        },
        select: {
            id_tarea_plantilla: true,
            area: true,
            frecuencia: true,
            diaMesVencimiento: true,
            diaSemanaVencimiento: true,
            responsableDefaultId: true,
            nombre: true,
            presentacion: true,
            isVolatile: true,
        },
        orderBy: { id_tarea_plantilla: "asc" },
    });
    // 2) Clientes activos del área
    const clientes = await prisma.cliente.findMany({
        where: {
            activo: true,
            codigoCartera: { startsWith: `${onlyArea}/` },
        },
        select: {
            rut: true,
            agenteId: true,
            codigoCartera: true,
        },
        orderBy: [{ rut: "asc" }],
    });
    const clientesNormalizados = clientes
        .map((c) => ({
        rutCliente: normalizeRut(c.rut),
        trabajadorId: typeof c.agenteId === "number" ? c.agenteId : null,
    }))
        .filter((c) => c.rutCliente);
    const rutList = clientesNormalizados.map((c) => c.rutCliente);
    const plantillaIds = plantillas.map((p) => p.id_tarea_plantilla);
    // 3) Exclusiones activas
    const exclusiones = await prisma.clienteTareaExclusion.findMany({
        where: {
            rutCliente: { in: rutList },
            tareaPlantillaId: { in: plantillaIds },
            activa: true,
        },
        select: {
            rutCliente: true,
            tareaPlantillaId: true,
            desdeFecha: true,
        },
    });
    const exclMap = new Map();
    for (const e of exclusiones) {
        exclMap.set(`${normalizeRut(e.rutCliente)}|${e.tareaPlantillaId}`, e.desdeFecha ? atSafeHour(e.desdeFecha) : null);
    }
    let totalCandidatas = 0;
    let totalInsertadas = 0;
    let totalSaltadas = 0;
    // 4) Por cada plantilla...
    for (const tpl of plantillas) {
        const dueDate = getNextDueDate({
            frecuencia: tpl.frecuencia,
            diaMesVencimiento: tpl.diaMesVencimiento,
            diaSemanaVencimiento: tpl.diaSemanaVencimiento,
        }, fechaReferencia);
        if (!dueDate)
            continue;
        const fechaObjetivo = atSafeHour(dueDate);
        // Rango del período para deduplicar
        let startPeriod;
        let endPeriod;
        if (tpl.frecuencia === client_1.FrecuenciaTarea.MENSUAL) {
            startPeriod = startOfMonth(fechaObjetivo);
            endPeriod = startOfNextMonth(fechaObjetivo);
        }
        else {
            startPeriod = startOfWeek(fechaObjetivo);
            endPeriod = startOfNextWeek(fechaObjetivo);
        }
        // Existentes para esta plantilla en el período
        const existentes = await prisma.tareaAsignada.findMany({
            where: {
                tareaPlantillaId: tpl.id_tarea_plantilla,
                fechaProgramada: {
                    gte: startPeriod,
                    lt: endPeriod,
                },
                rutCliente: { in: rutList },
            },
            select: {
                rutCliente: true,
                fechaProgramada: true,
            },
        });
        const existentesSet = new Set(existentes.map((e) => {
            const rut = normalizeRut(e.rutCliente);
            return `${rut}|${atSafeHour(e.fechaProgramada).toISOString()}`;
        }));
        const toCreate = [];
        // 5) Crear por cliente, no por trabajador del área
        for (const cli of clientesNormalizados) {
            const exKey = `${cli.rutCliente}|${tpl.id_tarea_plantilla}`;
            const desdeFecha = exclMap.get(exKey) ?? null;
            if (desdeFecha && desdeFecha <= fechaObjetivo) {
                totalSaltadas++;
                continue;
            }
            const dedupeKey = `${cli.rutCliente}|${fechaObjetivo.toISOString()}`;
            if (existentesSet.has(dedupeKey)) {
                totalSaltadas++;
                continue;
            }
            existentesSet.add(dedupeKey);
            totalCandidatas++;
            toCreate.push({
                tareaPlantillaId: tpl.id_tarea_plantilla,
                fechaProgramada: fechaObjetivo,
                trabajadorId: cli.trabajadorId ?? tpl.responsableDefaultId ?? null,
                estado: client_1.EstadoTarea.PENDIENTE,
                rutCliente: cli.rutCliente,
                comentarios: "Generada automáticamente",
            });
        }
        if (toCreate.length > 0) {
            const result = await prisma.tareaAsignada.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            totalInsertadas += result.count;
            console.log(`[generarTareas] plantilla=${tpl.id_tarea_plantilla} "${tpl.nombre}" ` +
                `candidatas=${toCreate.length} insertadas=${result.count} ` +
                `fecha=${fechaObjetivo.toISOString().slice(0, 10)}`);
        }
    }
    return {
        ran: true,
        area: onlyArea,
        today: atSafeHour(fechaReferencia).toISOString(),
        totalPlantillas: plantillas.length,
        totalClientes: clientesNormalizados.length,
        candidates: totalCandidatas,
        inserted: totalInsertadas,
        skippedApprox: totalSaltadas + Math.max(0, totalCandidatas - totalInsertadas),
    };
}
//# sourceMappingURL=generarTareas.js.map