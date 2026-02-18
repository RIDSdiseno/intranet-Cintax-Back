"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMetricasAgente = exports.getMetricasSupervision = void 0;
const prisma_1 = require("../lib/prisma");
// Helpers
const round0 = (n) => Math.round(n);
const pct = (num, den) => (den > 0 ? round0((num / den) * 100) : 0);
const buildRangoFecha = (anio, mes) => {
    if (!anio || !mes)
        return null;
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 1);
    return { gte: desde, lt: hasta };
};
const safeEstado = (estado) => {
    if (estado === "PENDIENTE")
        return "PENDIENTE";
    if (estado === "EN_PROCESO")
        return "EN_PROCESO";
    if (estado === "VENCIDA")
        return "VENCIDA";
    if (estado === "COMPLETADA")
        return "COMPLETADA";
    return "OTRO";
};
const calcIndiceCumplimiento = (completadas, enProceso, total) => total > 0 ? round0(((completadas + enProceso * 0.5) / total) * 100) : 0;
const calcIndiceRiesgo = (vencidas, pendientes, total) => total > 0 ? round0(((vencidas * 1.5 + pendientes) / total) * 100) : 0;
// =========================================================
// GET /tareas/supervision/metricas
// ?areaInterna=CONTA&anio=2025&mes=12
// =========================================================
const getMetricasSupervision = async (req, res) => {
    try {
        const areaInterna = req.query.areaInterna || "Todas";
        const anio = req.query.anio ? Number(req.query.anio) : undefined;
        const mes = req.query.mes ? Number(req.query.mes) : undefined;
        const rangoFecha = buildRangoFecha(anio, mes);
        // 1) Cargamos trabajadores (si viene filtro de área, lo aplicamos aquí)
        const whereTrabajador = {};
        if (areaInterna !== "Todas")
            whereTrabajador.areaInterna = areaInterna;
        const trabajadores = await prisma_1.prisma.trabajador.findMany({
            where: whereTrabajador,
            select: {
                id_trabajador: true,
                nombre: true,
                email: true,
                areaInterna: true,
            },
        });
        if (!trabajadores.length) {
            return res.json({
                filtros: { areaInterna, anio: anio || null, mes: mes || null },
                resumenGlobal: {
                    totalTareas: 0,
                    totalPendientes: 0,
                    totalEnProceso: 0,
                    totalVencidas: 0,
                    totalCompletadas: 0,
                    porcentajeCompletadas: 0,
                    porcentajePendientes: 0,
                    tasaVencidas: 0,
                    tasaEnProceso: 0,
                    backlogTotal: 0,
                    promedioTareasPorAgente: 0,
                    indiceCumplimiento: 0,
                    indiceRiesgo: 0,
                    saludOperativa: 0,
                },
                agentes: [],
                rankingCumplimiento: [],
                rankingRiesgo: [],
                mejorCumplimiento: null,
                masVencidas: null,
            });
        }
        const trabajadorIds = trabajadores.map((t) => t.id_trabajador);
        const mapTrabajador = new Map(trabajadores.map((t) => [t.id_trabajador, t]));
        // 2) Traemos tareas filtradas por trabajadores del área (si aplica) y por rango de fecha (si aplica)
        const whereTareas = {
            trabajadorId: { in: trabajadorIds },
        };
        if (rangoFecha)
            whereTareas.fechaProgramada = rangoFecha;
        const tareas = await prisma_1.prisma.tareaAsignada.findMany({
            where: whereTareas,
            select: {
                id_tarea_asignada: true,
                estado: true,
                trabajadorId: true,
                rutCliente: true,
                fechaProgramada: true,
                tareaPlantilla: {
                    select: {
                        id_tarea_plantilla: true,
                        nombre: true,
                        area: true,
                    },
                },
            },
        });
        if (!tareas.length) {
            return res.json({
                filtros: { areaInterna, anio: anio || null, mes: mes || null },
                resumenGlobal: {
                    totalTareas: 0,
                    totalPendientes: 0,
                    totalEnProceso: 0,
                    totalVencidas: 0,
                    totalCompletadas: 0,
                    porcentajeCompletadas: 0,
                    porcentajePendientes: 0,
                    tasaVencidas: 0,
                    tasaEnProceso: 0,
                    backlogTotal: 0,
                    promedioTareasPorAgente: 0,
                    indiceCumplimiento: 0,
                    indiceRiesgo: 0,
                    saludOperativa: 0,
                },
                agentes: [],
                rankingCumplimiento: [],
                rankingRiesgo: [],
                mejorCumplimiento: null,
                masVencidas: null,
            });
        }
        // 3) Agregamos por agente
        const mapAgentes = new Map();
        // Para evitar que "OTRO" distorsione porcentajes sin contarlo, lo contaremos como "otros"
        let totalOtros = 0;
        for (const t of tareas) {
            const trabajadorId = t.trabajadorId;
            if (!trabajadorId)
                continue;
            const datosTrabajador = mapTrabajador.get(trabajadorId);
            if (!datosTrabajador)
                continue;
            if (!mapAgentes.has(trabajadorId)) {
                mapAgentes.set(trabajadorId, {
                    trabajadorId,
                    nombre: datosTrabajador.nombre,
                    email: datosTrabajador.email,
                    areaInterna: datosTrabajador.areaInterna,
                    rol: null,
                    pendientes: 0,
                    enProceso: 0,
                    vencidas: 0,
                    completadas: 0,
                    total: 0,
                });
            }
            const agg = mapAgentes.get(trabajadorId);
            const estado = safeEstado(t.estado);
            if (estado === "PENDIENTE")
                agg.pendientes++;
            else if (estado === "EN_PROCESO")
                agg.enProceso++;
            else if (estado === "VENCIDA")
                agg.vencidas++;
            else if (estado === "COMPLETADA")
                agg.completadas++;
            else
                totalOtros++;
            agg.total++;
        }
        const agentesBase = Array.from(mapAgentes.values());
        if (!agentesBase.length) {
            return res.json({
                filtros: { areaInterna, anio: anio || null, mes: mes || null },
                resumenGlobal: {
                    totalTareas: 0,
                    totalPendientes: 0,
                    totalEnProceso: 0,
                    totalVencidas: 0,
                    totalCompletadas: 0,
                    porcentajeCompletadas: 0,
                    porcentajePendientes: 0,
                    tasaVencidas: 0,
                    tasaEnProceso: 0,
                    backlogTotal: 0,
                    promedioTareasPorAgente: 0,
                    indiceCumplimiento: 0,
                    indiceRiesgo: 0,
                    saludOperativa: 0,
                },
                agentes: [],
                rankingCumplimiento: [],
                rankingRiesgo: [],
                mejorCumplimiento: null,
                masVencidas: null,
            });
        }
        // =======================
        // RESUMEN GLOBAL
        // =======================
        const totalTareas = agentesBase.reduce((acc, a) => acc + a.total, 0);
        const totalPendientes = agentesBase.reduce((acc, a) => acc + a.pendientes, 0);
        const totalEnProceso = agentesBase.reduce((acc, a) => acc + a.enProceso, 0);
        const totalVencidas = agentesBase.reduce((acc, a) => acc + a.vencidas, 0);
        const totalCompletadas = agentesBase.reduce((acc, a) => acc + a.completadas, 0);
        const porcentajeCompletadas = pct(totalCompletadas, totalTareas);
        const porcentajePendientes = pct(totalPendientes, totalTareas);
        const tasaVencidas = pct(totalVencidas, totalTareas);
        const tasaEnProceso = pct(totalEnProceso, totalTareas);
        const backlogTotal = totalPendientes + totalEnProceso;
        const promedioTareasPorAgente = totalTareas > 0 && agentesBase.length > 0
            ? Math.round((totalTareas / agentesBase.length) * 10) / 10
            : 0;
        const indiceCumplimiento = calcIndiceCumplimiento(totalCompletadas, totalEnProceso, totalTareas);
        const indiceRiesgo = calcIndiceRiesgo(totalVencidas, totalPendientes, totalTareas);
        // Salud operativa: completadas - vencidas ponderadas (0..100 aprox, puede ser negativo; lo acotamos)
        const saludOperativaRaw = porcentajeCompletadas - tasaVencidas * 1.2;
        const saludOperativa = Math.max(-100, Math.min(100, Math.round(saludOperativaRaw)));
        // =======================
        // KPIs POR AGENTE
        // =======================
        const agentes = agentesBase.map((a) => {
            const total = a.total;
            const porcentajeCompletadasAgente = pct(a.completadas, total);
            const porcentajeVencidasAgente = pct(a.vencidas, total);
            const porcentajePendientesAgente = pct(a.pendientes, total);
            const porcentajeEnProcesoAgente = pct(a.enProceso, total);
            const backlog = a.pendientes + a.enProceso;
            const indiceCumplimientoAgente = calcIndiceCumplimiento(a.completadas, a.enProceso, total);
            const indiceRiesgoAgente = calcIndiceRiesgo(a.vencidas, a.pendientes, total);
            return {
                ...a,
                porcentajeCompletadas: porcentajeCompletadasAgente,
                porcentajeVencidas: porcentajeVencidasAgente,
                porcentajePendientes: porcentajePendientesAgente,
                porcentajeEnProceso: porcentajeEnProcesoAgente,
                backlog,
                indiceCumplimiento: indiceCumplimientoAgente,
                indiceRiesgo: indiceRiesgoAgente,
            };
        });
        // Rankings
        const rankingCumplimiento = [...agentes]
            .sort((a, b) => b.indiceCumplimiento - a.indiceCumplimiento)
            .slice(0, 3);
        const rankingRiesgo = [...agentes]
            .sort((a, b) => b.indiceRiesgo - a.indiceRiesgo)
            .slice(0, 3);
        const mejorCumplimiento = agentes.length
            ? [...agentes].sort((a, b) => b.porcentajeCompletadas - a.porcentajeCompletadas)[0]
            : null;
        const masVencidas = agentes.length
            ? [...agentes].sort((a, b) => b.porcentajeVencidas - a.porcentajeVencidas)[0]
            : null;
        return res.json({
            filtros: { areaInterna, anio: anio || null, mes: mes || null },
            resumenGlobal: {
                totalTareas,
                totalPendientes,
                totalEnProceso,
                totalVencidas,
                totalCompletadas,
                porcentajeCompletadas,
                porcentajePendientes,
                tasaVencidas,
                tasaEnProceso,
                backlogTotal,
                promedioTareasPorAgente,
                indiceCumplimiento,
                indiceRiesgo,
                saludOperativa,
                totalOtros,
            },
            agentes,
            rankingCumplimiento,
            rankingRiesgo,
            mejorCumplimiento,
            masVencidas,
        });
    }
    catch (error) {
        console.error("[Back] Error en getMetricasSupervision", error);
        return res.status(500).json({ message: "Error interno cargando métricas de supervisión" });
    }
};
exports.getMetricasSupervision = getMetricasSupervision;
// =========================================================
// GET /tareas/supervision/metricas/agente/:id
// =========================================================
const getMetricasAgente = async (req, res) => {
    try {
        const trabajadorId = Number(req.params.id);
        if (Number.isNaN(trabajadorId)) {
            return res.status(400).json({ message: "ID de agente inválido" });
        }
        const anio = req.query.anio ? Number(req.query.anio) : undefined;
        const mes = req.query.mes ? Number(req.query.mes) : undefined;
        const rangoFecha = buildRangoFecha(anio, mes);
        const where = { trabajadorId };
        if (rangoFecha)
            where.fechaProgramada = rangoFecha;
        const [tareas, trabajador] = await Promise.all([
            prisma_1.prisma.tareaAsignada.findMany({
                where,
                select: {
                    id_tarea_asignada: true,
                    estado: true,
                    rutCliente: true,
                    fechaProgramada: true,
                    tareaPlantilla: {
                        select: {
                            id_tarea_plantilla: true,
                            nombre: true,
                            area: true,
                        },
                    },
                },
            }),
            prisma_1.prisma.trabajador.findUnique({
                where: { id_trabajador: trabajadorId },
                select: {
                    id_trabajador: true,
                    nombre: true,
                    email: true,
                    areaInterna: true,
                },
            }),
        ]);
        if (!trabajador) {
            return res.json({
                trabajadorId,
                filtros: { anio: anio || null, mes: mes || null },
                resumenAgente: null,
                kpis: null,
                pendientesPorEmpresa: [],
                pendientesPorTarea: [],
                completadasPorEmpresa: [],
            });
        }
        if (!tareas.length) {
            return res.json({
                trabajadorId,
                filtros: { anio: anio || null, mes: mes || null },
                resumenAgente: {
                    trabajadorId,
                    nombre: trabajador.nombre,
                    email: trabajador.email,
                    areaInterna: trabajador.areaInterna,
                    rol: null,
                    pendientes: 0,
                    enProceso: 0,
                    vencidas: 0,
                    completadas: 0,
                    total: 0,
                    porcentajeCompletadas: 0,
                    porcentajeVencidas: 0,
                },
                kpis: {
                    backlog: 0,
                    indiceCumplimiento: 0,
                    indiceRiesgo: 0,
                    porcentajePendientes: 0,
                    porcentajeEnProceso: 0,
                    saturacion: 0,
                },
                pendientesPorEmpresa: [],
                pendientesPorTarea: [],
                completadasPorEmpresa: [],
            });
        }
        let pendientes = 0;
        let enProceso = 0;
        let vencidas = 0;
        let completadas = 0;
        let otros = 0;
        const mapEmpresaPend = new Map();
        const mapEmpresaComp = new Map();
        const mapTareaPend = new Map();
        for (const t of tareas) {
            const estado = safeEstado(t.estado);
            if (estado === "PENDIENTE")
                pendientes++;
            else if (estado === "EN_PROCESO")
                enProceso++;
            else if (estado === "VENCIDA")
                vencidas++;
            else if (estado === "COMPLETADA")
                completadas++;
            else
                otros++;
            const rut = t.rutCliente || "SIN_RUT";
            // OJO: acá NO tienes nombre real de empresa, solo rut o área de la plantilla.
            // Dejamos "empresa" como:
            // - si existe rut, mostramos rut
            // - si no, "Sin cliente"
            const empresa = t.rutCliente || "Sin cliente asignado";
            // ====== PENDIENTES / VENCIDAS por empresa ======
            if (estado === "PENDIENTE" || estado === "VENCIDA") {
                const e = mapEmpresaPend.get(rut);
                if (e)
                    e.cantidad += 1;
                else
                    mapEmpresaPend.set(rut, {
                        rutCliente: t.rutCliente || null,
                        empresa,
                        cantidad: 1,
                    });
                const nombreTarea = t.tareaPlantilla?.nombre || "Tarea sin nombre definido";
                const te = mapTareaPend.get(nombreTarea);
                if (te)
                    te.cantidad += 1;
                else
                    mapTareaPend.set(nombreTarea, { nombreTarea, cantidad: 1 });
            }
            // ====== COMPLETADAS por empresa ======
            if (estado === "COMPLETADA") {
                const c = mapEmpresaComp.get(rut);
                if (c)
                    c.cantidad += 1;
                else
                    mapEmpresaComp.set(rut, {
                        rutCliente: t.rutCliente || null,
                        empresa,
                        cantidad: 1,
                    });
            }
        }
        const total = pendientes + enProceso + vencidas + completadas + otros;
        const porcentajeCompletadas = pct(completadas, total);
        const porcentajeVencidas = pct(vencidas, total);
        const porcentajePendientes = pct(pendientes, total);
        const porcentajeEnProceso = pct(enProceso, total);
        const backlog = pendientes + enProceso;
        const indiceCumplimiento = calcIndiceCumplimiento(completadas, enProceso, total);
        const indiceRiesgo = calcIndiceRiesgo(vencidas, pendientes, total);
        const saturacion = pct(backlog, total);
        const resumenAgente = {
            trabajadorId,
            nombre: trabajador.nombre,
            email: trabajador.email,
            areaInterna: trabajador.areaInterna,
            rol: null,
            pendientes,
            enProceso,
            vencidas,
            completadas,
            total,
            porcentajeCompletadas,
            porcentajeVencidas,
            otros,
        };
        const pendientesPorEmpresa = Array.from(mapEmpresaPend.values()).sort((a, b) => b.cantidad - a.cantidad);
        const pendientesPorTarea = Array.from(mapTareaPend.values()).sort((a, b) => b.cantidad - a.cantidad);
        const completadasPorEmpresa = Array.from(mapEmpresaComp.values()).sort((a, b) => b.cantidad - a.cantidad);
        const clienteConMasCarga = pendientesPorEmpresa[0] || null;
        const tareaMasPendiente = pendientesPorTarea[0] || null;
        return res.json({
            trabajadorId,
            filtros: { anio: anio || null, mes: mes || null },
            resumenAgente,
            kpis: {
                backlog,
                indiceCumplimiento,
                indiceRiesgo,
                porcentajePendientes,
                porcentajeEnProceso,
                saturacion,
                clienteConMasCarga,
                tareaMasPendiente,
            },
            pendientesPorEmpresa,
            pendientesPorTarea,
            completadasPorEmpresa,
        });
    }
    catch (error) {
        console.error("[Back] Error en getMetricasAgente", error);
        return res.status(500).json({ message: "Error interno cargando métricas del agente" });
    }
};
exports.getMetricasAgente = getMetricasAgente;
