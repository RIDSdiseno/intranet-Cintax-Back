// src/controllers/tareasMetricas.controller.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type EstadoTarea = "PENDIENTE" | "EN_PROCESO" | "VENCIDA" | "COMPLETADA";

type AgregadoAgente = {
  trabajadorId: number;
  nombre: string;
  email: string;
  areaInterna: string | null;
  rol: string | null; // en tu modelo no existe, lo dejamos siempre en null por ahora
  pendientes: number;
  enProceso: number;
  vencidas: number;
  completadas: number;
  total: number;
};

type PendEmpresa = {
  rutCliente: string | null;
  empresa: string;
  cantidad: number;
};

type PendTarea = {
  nombreTarea: string;
  cantidad: number;
};

// =========================================================
// GET /tareas/supervision/metricas
// ?areaInterna=CONTA&anio=2025&mes=12
// =========================================================
export const getMetricasSupervision = async (req: Request, res: Response) => {
  try {
    const areaInterna = (req.query.areaInterna as string) || "Todas";
    const anio = req.query.anio ? Number(req.query.anio) : undefined;
    const mes = req.query.mes ? Number(req.query.mes) : undefined;

    // Rango de fechas opcional (por mes)
    let rangoFecha: { gte?: Date; lt?: Date } = {};
    if (anio && mes) {
      const desde = new Date(anio, mes - 1, 1);
      const hasta = new Date(anio, mes, 1);
      rangoFecha = { gte: desde, lt: hasta };
    }

    const whereTareas: any = {};
    if (rangoFecha.gte || rangoFecha.lt) {
      whereTareas.fechaProgramada = rangoFecha;
    }

    // 1) Traemos todas las tareas que calzan con los filtros
    const tareas = await prisma.tareaAsignada.findMany({
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
        filtros: {
          areaInterna,
          anio: anio || null,
          mes: mes || null,
        },
        resumenGlobal: {
          totalTareas: 0,
          totalPendientes: 0,
          totalEnProceso: 0,
          totalVencidas: 0,
          totalCompletadas: 0,
          porcentajeCompletadas: 0,
          promedioTareasPorAgente: 0,
          tasaVencidas: 0,
          tasaEnProceso: 0,
        },
        agentes: [],
        mejorCumplimiento: null,
        masVencidas: null,
      });
    }

    // 2) Sacamos todos los IDs de trabajadores involucrados
    const trabajadorIds = Array.from(
      new Set(
        tareas
          .map((t) => t.trabajadorId)
          .filter((id): id is number => id !== null && id !== undefined)
      )
    );

    // 3) Cargamos los trabajadores desde la tabla Trabajador
    const whereTrabajador: any = {
      id_trabajador: { in: trabajadorIds },
    };
    if (areaInterna !== "Todas") {
      whereTrabajador.areaInterna = areaInterna;
    }

    const trabajadores = await prisma.trabajador.findMany({
      where: whereTrabajador,
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        areaInterna: true,
        // rol no existe en el modelo actual
      },
    });

    if (!trabajadores.length) {
      return res.json({
        filtros: {
          areaInterna,
          anio: anio || null,
          mes: mes || null,
        },
        resumenGlobal: {
          totalTareas: 0,
          totalPendientes: 0,
          totalEnProceso: 0,
          totalVencidas: 0,
          totalCompletadas: 0,
          porcentajeCompletadas: 0,
          promedioTareasPorAgente: 0,
          tasaVencidas: 0,
          tasaEnProceso: 0,
        },
        agentes: [],
        mejorCumplimiento: null,
        masVencidas: null,
      });
    }

    // Index de trabajador para lookup rápido
    const mapTrabajador = new Map(
      trabajadores.map((t) => [t.id_trabajador, t])
    );

    const mapAgentes = new Map<number, AgregadoAgente>();

    for (const t of tareas) {
      if (!t.trabajadorId) continue;
      const datosTrabajador = mapTrabajador.get(t.trabajadorId);
      if (!datosTrabajador) continue; // puede que el filtro de área lo haya excluido

      const key = t.trabajadorId;
      if (!mapAgentes.has(key)) {
        mapAgentes.set(key, {
          trabajadorId: t.trabajadorId,
          nombre: datosTrabajador.nombre,
          email: datosTrabajador.email,
          areaInterna: datosTrabajador.areaInterna,
          rol: null, // no existe en la BDD
          pendientes: 0,
          enProceso: 0,
          vencidas: 0,
          completadas: 0,
          total: 0,
        });
      }

      const agg = mapAgentes.get(key)!;
      const estado = t.estado as EstadoTarea;

      if (estado === "PENDIENTE") agg.pendientes++;
      else if (estado === "EN_PROCESO") agg.enProceso++;
      else if (estado === "VENCIDA") agg.vencidas++;
      else if (estado === "COMPLETADA") agg.completadas++;

      agg.total++;
    }

    const agentes = Array.from(mapAgentes.values());
    if (!agentes.length) {
      return res.json({
        filtros: {
          areaInterna,
          anio: anio || null,
          mes: mes || null,
        },
        resumenGlobal: {
          totalTareas: 0,
          totalPendientes: 0,
          totalEnProceso: 0,
          totalVencidas: 0,
          totalCompletadas: 0,
          porcentajeCompletadas: 0,
          promedioTareasPorAgente: 0,
          tasaVencidas: 0,
          tasaEnProceso: 0,
        },
        agentes: [],
        mejorCumplimiento: null,
        masVencidas: null,
      });
    }

    // =======================
    // RESUMEN GLOBAL
    // =======================
    const totalTareas = agentes.reduce((acc, a) => acc + a.total, 0);
    const totalPendientes = agentes.reduce((acc, a) => acc + a.pendientes, 0);
    const totalEnProceso = agentes.reduce((acc, a) => acc + a.enProceso, 0);
    const totalVencidas = agentes.reduce((acc, a) => acc + a.vencidas, 0);
    const totalCompletadas = agentes.reduce(
      (acc, a) => acc + a.completadas,
      0
    );

    const promedioTareasPorAgente =
      totalTareas > 0 && agentes.length > 0
        ? Math.round((totalTareas / agentes.length) * 10) / 10
        : 0;

    const porcentajeCompletadas =
      totalTareas > 0
        ? Math.round((totalCompletadas / totalTareas) * 100)
        : 0;
    const tasaVencidas =
      totalTareas > 0 ? Math.round((totalVencidas / totalTareas) * 100) : 0;
    const tasaEnProceso =
      totalTareas > 0 ? Math.round((totalEnProceso / totalTareas) * 100) : 0;

    // =======================
    // KPIs POR AGENTE
    // =======================
    const agentesConKpi = agentes.map((a) => {
      const total = a.total;
      const porcentajeCompletadasAgente =
        total > 0 ? Math.round((a.completadas / total) * 100) : 0;
      const porcentajeVencidasAgente =
        total > 0 ? Math.round((a.vencidas / total) * 100) : 0;
      const porcentajePendientesAgente =
        total > 0 ? Math.round((a.pendientes / total) * 100) : 0;

      return {
        ...a,
        porcentajeCompletadas: porcentajeCompletadasAgente,
        porcentajeVencidas: porcentajeVencidasAgente,
        porcentajePendientes: porcentajePendientesAgente,
      };
    });

    const mejorCumplimiento =
      agentesConKpi.length > 0
        ? [...agentesConKpi].sort(
            (a, b) => b.porcentajeCompletadas - a.porcentajeCompletadas
          )[0]
        : null;

    const masVencidas =
      agentesConKpi.length > 0
        ? [...agentesConKpi].sort(
            (a, b) => b.porcentajeVencidas - a.porcentajeVencidas
          )[0]
        : null;

    return res.json({
      filtros: {
        areaInterna,
        anio: anio || null,
        mes: mes || null,
      },
      resumenGlobal: {
        totalTareas,
        totalPendientes,
        totalEnProceso,
        totalVencidas,
        totalCompletadas,
        porcentajeCompletadas,
        promedioTareasPorAgente,
        tasaVencidas,
        tasaEnProceso,
      },
      agentes: agentesConKpi,
      mejorCumplimiento,
      masVencidas,
    });
  } catch (error) {
    console.error("[Back] Error en getMetricasSupervision", error);
    return res
      .status(500)
      .json({ message: "Error interno cargando métricas de supervisión" });
  }
};

// =========================================================
// GET /tareas/supervision/metricas/agente/:id
// =========================================================
export const getMetricasAgente = async (req: Request, res: Response) => {
  try {
    const trabajadorId = Number(req.params.id);
    if (Number.isNaN(trabajadorId)) {
      return res.status(400).json({ message: "ID de agente inválido" });
    }

    const anio = req.query.anio ? Number(req.query.anio) : undefined;
    const mes = req.query.mes ? Number(req.query.mes) : undefined;

    let rangoFecha: { gte?: Date; lt?: Date } = {};
    if (anio && mes) {
      const desde = new Date(anio, mes - 1, 1);
      const hasta = new Date(anio, mes, 1);
      rangoFecha = { gte: desde, lt: hasta };
    }

    const where: any = { trabajadorId };

    if (rangoFecha.gte || rangoFecha.lt) {
      where.fechaProgramada = rangoFecha;
    }

    const tareas = await prisma.tareaAsignada.findMany({
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
    });

    // Buscar info del trabajador
    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: trabajadorId },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        areaInterna: true,
        // rol no existe
      },
    });

    if (!tareas.length || !trabajador) {
      return res.json({
        trabajadorId,
        filtros: {
          anio: anio || null,
          mes: mes || null,
        },
        resumenAgente: trabajador
          ? {
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
            }
          : null,
        pendientesPorEmpresa: [],
        pendientesPorTarea: [],
        completadasPorEmpresa: [],
      });
    }

    let pendientes = 0;
    let enProceso = 0;
    let vencidas = 0;
    let completadas = 0;

    const mapEmpresaPend = new Map<string, PendEmpresa>();
    const mapEmpresaComp = new Map<string, PendEmpresa>();
    const mapTarea = new Map<string, PendTarea>();

    for (const t of tareas) {
      const estado = t.estado as EstadoTarea;
      if (estado === "PENDIENTE") pendientes++;
      else if (estado === "EN_PROCESO") enProceso++;
      else if (estado === "VENCIDA") vencidas++;
      else if (estado === "COMPLETADA") completadas++;

      const rut = t.rutCliente || "SIN_RUT";
      const empresa =
        t.tareaPlantilla?.area ||
        t.rutCliente ||
        "Sin cliente asignado";

      // ====== PENDIENTES / VENCIDAS por empresa ======
      if (estado === "PENDIENTE" || estado === "VENCIDA") {
        const kEmpresa = rut;
        const e = mapEmpresaPend.get(kEmpresa);
        if (e) {
          e.cantidad += 1;
        } else {
          mapEmpresaPend.set(kEmpresa, {
            rutCliente: t.rutCliente || null,
            empresa,
            cantidad: 1,
          });
        }

        const nombreTarea =
          t.tareaPlantilla?.nombre || "Tarea sin nombre definido";
        const kTarea = nombreTarea;
        const te = mapTarea.get(kTarea);
        if (te) {
          te.cantidad += 1;
        } else {
          mapTarea.set(kTarea, {
            nombreTarea,
            cantidad: 1,
          });
        }
      }

      // ====== COMPLETADAS por empresa ======
      if (estado === "COMPLETADA") {
        const kEmpresa = rut;
        const c = mapEmpresaComp.get(kEmpresa);
        if (c) {
          c.cantidad += 1;
        } else {
          mapEmpresaComp.set(kEmpresa, {
            rutCliente: t.rutCliente || null,
            empresa,
            cantidad: 1,
          });
        }
      }
    }

    const total = pendientes + enProceso + vencidas + completadas;
    const porcentajeCompletadas =
      total > 0 ? Math.round((completadas / total) * 100) : 0;
    const porcentajeVencidas =
      total > 0 ? Math.round((vencidas / total) * 100) : 0;

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
    };

    const pendientesPorEmpresa = Array.from(mapEmpresaPend.values()).sort(
      (a, b) => b.cantidad - a.cantidad
    );

    const pendientesPorTarea = Array.from(mapTarea.values()).sort(
      (a, b) => b.cantidad - a.cantidad
    );

    const completadasPorEmpresa = Array.from(mapEmpresaComp.values()).sort(
      (a, b) => b.cantidad - a.cantidad
    );

    return res.json({
      trabajadorId,
      filtros: {
        anio: anio || null,
        mes: mes || null,
      },
      resumenAgente,
      pendientesPorEmpresa,
      pendientesPorTarea,
      completadasPorEmpresa,
    });
  } catch (error) {
    console.error("[Back] Error en getMetricasAgente", error);
    return res.status(500).json({
      message: "Error interno cargando métricas del agente",
    });
  }
};
