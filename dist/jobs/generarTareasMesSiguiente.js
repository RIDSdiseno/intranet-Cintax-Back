"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generarTareasMesSiguiente = generarTareasMesSiguiente;
// src/jobs/generarTareasMesSiguiente.ts
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const SAFE_HOUR = 12; // evita dramas TZ
const GENERATION_DAY = 30;
function atSafeHour(d) {
    const x = new Date(d);
    x.setHours(SAFE_HOUR, 0, 0, 0);
    return x;
}
function startOfMonth(y, m0) {
    return new Date(y, m0, 1, SAFE_HOUR, 0, 0, 0);
}
function startOfNextMonth(y, m0) {
    return new Date(y, m0 + 1, 1, SAFE_HOUR, 0, 0, 0);
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
function getWeekdayDatesInMonth(year, month1to12, ourWeekday1to7) {
    const start = startOfMonth(year, month1to12 - 1);
    const end = startOfMonth(year, month1to12); // 1er día del mes siguiente (exclusivo)
    const jsTarget = ourDowToJs(ourWeekday1to7);
    const cur = new Date(start);
    const diff = (jsTarget - cur.getDay() + 7) % 7;
    cur.setDate(cur.getDate() + diff);
    const out = [];
    while (cur < end) {
        out.push(new Date(cur));
        cur.setDate(cur.getDate() + 7);
    }
    return out.map(atSafeHour);
}
function normalizeRut(rut) {
    return (rut ?? "")
        .toString()
        .trim()
        .replace(/\./g, "")
        .replace(/\s+/g, "")
        .replace(/-k$/i, "-K");
}
function shouldRunToday(today) {
    const day = today.getDate();
    return day === GENERATION_DAY;
}
// calcula (año, mes) del mes siguiente
function nextMonth(today) {
    const y = today.getFullYear();
    const m0 = today.getMonth(); // 0-11
    const next = new Date(y, m0 + 1, 1);
    return { year: next.getFullYear(), month1to12: next.getMonth() + 1 };
}
async function generarTareasMesSiguiente(fechaReferencia = new Date(), opts) {
    const force = opts?.force === true;
    if (!force && !shouldRunToday(fechaReferencia)) {
        return { ran: false, reason: "Hoy no es día 30", today: fechaReferencia.toISOString() };
    }
    const { year, month1to12 } = nextMonth(fechaReferencia);
    const start = startOfMonth(year, month1to12 - 1);
    const end = startOfNextMonth(year, month1to12 - 1);
    const onlyArea = opts?.onlyArea ?? client_1.Area.CONTA;
    // 1) Plantillas activas CLIENTE del área
    const plantillas = await prisma_1.prisma.tareaPlantilla.findMany({
        where: { activo: true, presentacion: "CLIENTE", area: onlyArea },
        select: {
            id_tarea_plantilla: true,
            frecuencia: true,
            diaMesVencimiento: true,
            diaSemanaVencimiento: true,
            responsableDefaultId: true,
            nombre: true,
        },
        orderBy: { id_tarea_plantilla: "asc" },
    });
    // 2) Clientes activos de esa área (en tu caso CONTA/...)
    const clientes = await prisma_1.prisma.cliente.findMany({
        where: {
            activo: true,
            codigoCartera: { startsWith: `${onlyArea}/` }, // "CONTA/"
            agenteId: { not: null },
        },
        select: { rut: true, agenteId: true },
        orderBy: [{ rut: "asc" }],
    });
    const rutList = clientes.map((c) => normalizeRut(c.rut));
    const plantillaIds = plantillas.map((p) => p.id_tarea_plantilla);
    // 3) Exclusiones (activa=true => NO aplica)
    const exclusiones = await prisma_1.prisma.clienteTareaExclusion.findMany({
        where: {
            rutCliente: { in: rutList },
            tareaPlantillaId: { in: plantillaIds },
            activa: true,
        },
        select: { rutCliente: true, tareaPlantillaId: true, desdeFecha: true },
    });
    const exclMap = new Map();
    for (const e of exclusiones) {
        exclMap.set(`${normalizeRut(e.rutCliente)}|${e.tareaPlantillaId}`, e.desdeFecha ?? null);
    }
    const toCreate = [];
    for (const cli of clientes) {
        const rut = normalizeRut(cli.rut);
        const agenteId = typeof cli.agenteId === "number" ? cli.agenteId : null;
        for (const p of plantillas) {
            const exKey = `${rut}|${p.id_tarea_plantilla}`;
            const desdeFecha = exclMap.get(exKey) ?? null;
            const assigned = agenteId ?? p.responsableDefaultId ?? null;
            // MENSUAL (una fecha dentro del mes siguiente)
            if (p.frecuencia === client_1.FrecuenciaTarea.MENSUAL) {
                const day = clampDayToMonth(year, month1to12, Number(p.diaMesVencimiento ?? 1));
                const fecha = buildDate(year, month1to12, day);
                // si exclusión aplica desdeFecha <= fecha => no crea
                if (desdeFecha && desdeFecha <= fecha)
                    continue;
                toCreate.push({
                    tareaPlantillaId: p.id_tarea_plantilla,
                    rutCliente: rut,
                    trabajadorId: assigned,
                    estado: client_1.EstadoTarea.PENDIENTE,
                    fechaProgramada: fecha,
                    comentarios: "Generada automáticamente (día 30 → mes siguiente)",
                });
            }
            // SEMANAL (varias fechas dentro del mes siguiente)
            if (p.frecuencia === client_1.FrecuenciaTarea.SEMANAL) {
                const weekday = Number(p.diaSemanaVencimiento ?? 1);
                const fechas = getWeekdayDatesInMonth(year, month1to12, weekday);
                for (const fecha of fechas) {
                    if (desdeFecha && desdeFecha <= fecha)
                        continue;
                    toCreate.push({
                        tareaPlantillaId: p.id_tarea_plantilla,
                        rutCliente: rut,
                        trabajadorId: assigned,
                        estado: client_1.EstadoTarea.PENDIENTE,
                        fechaProgramada: fecha,
                        comentarios: "Generada automáticamente (día 30 → mes siguiente)",
                    });
                }
            }
        }
    }
    const result = await prisma_1.prisma.tareaAsignada.createMany({
        data: toCreate,
        skipDuplicates: true,
    });
    return {
        ran: true,
        area: onlyArea,
        forMonth: `${month1to12}/${year}`,
        range: { start: start.toISOString(), end: end.toISOString() },
        candidates: toCreate.length,
        inserted: result.count,
        skippedApprox: Math.max(0, toCreate.length - result.count),
    };
}
