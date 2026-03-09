// src/controllers/tareas.masivo.controller.ts
import type { Request, Response } from "express";
import { PrismaClient, EstadoTarea } from "@prisma/client";

const prisma = new PrismaClient();

function asISODate(v: any): Date | null {
  const d = new Date(String(v ?? ""));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * ✅ NUEVO: parse flexible para fechaProgramada
 * - acepta ISO completo
 * - acepta YYYY-MM-DD (lo interpreta como UTC 00:00)
 */
function asFlexibleDate(v: any): Date | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function cleanStringArray(v: any): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
}

function cleanNumberArray(v: any): number[] {
  if (!Array.isArray(v)) return [];
  const nums = v
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set(nums));
}

function normEmail(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * ✅ helper mínimo: valida que trabajador exista
 */
async function ensureTrabajadorExists(id: number) {
  const t = await prisma.trabajador.findUnique({
    where: { id_trabajador: id },
    select: { id_trabajador: true, email: true, carpetaDriveCodigo: true, areaInterna: true },
  });
  return t;
}

/**
 * ✅ Recalcula codigoCartera desde el nuevo agente.
 * REEMPLAZA esta lógica por tu función real (getCodigoCarteraFromAgente).
 *
 * Opciones típicas:
 * - usar carpetaDriveCodigo del trabajador
 * - usar areaInterna + algún correlativo
 * - usar reglas por área/rol
 */
async function getCodigoCarteraFromAgente(agenteId: number): Promise<string | null> {
  const t = await prisma.trabajador.findUnique({
    where: { id_trabajador: agenteId },
    select: { carpetaDriveCodigo: true, areaInterna: true, email: true },
  });

  if (!t) return null;

  // Si ya tienes un "codigo" en el trabajador, úsalo
  if (t.carpetaDriveCodigo) return t.carpetaDriveCodigo;

  // fallback simple por área (ajusta a tu negocio)
  if (t.areaInterna) return `${String(t.areaInterna)}/A01`;

  // último fallback: por email
  if (t.email) return `GEN/${t.email.split("@")[0].slice(0, 10).toUpperCase()}`;

  return null;
}

// =====================
// ORIGINAL (lo dejas igual)
// =====================
export async function crearDesdePlantillaMasivo(req: Request, res: Response) {
  try {
    const { rutClientes, plantillaIds, trabajadorId, fechaProgramada, skipDuplicates = true } = req.body ?? {};

    const ruts: string[] = Array.isArray(rutClientes)
      ? rutClientes.map((x) => String(x).trim()).filter(Boolean)
      : [];

    const plantillas: number[] = Array.isArray(plantillaIds)
      ? plantillaIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const tId = Number(trabajadorId);
    const fecha = asISODate(fechaProgramada);

    if (!ruts.length) return res.status(400).json({ error: "rutClientes requerido" });
    if (!plantillas.length) return res.status(400).json({ error: "plantillaIds requerido" });
    if (!Number.isFinite(tId) || tId <= 0) return res.status(400).json({ error: "trabajadorId inválido" });
    if (!fecha) return res.status(400).json({ error: "fechaProgramada inválida" });

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: tId },
      select: { id_trabajador: true, nombre: true, email: true },
    });
    if (!trabajador) return res.status(404).json({ error: "Trabajador no existe" });

    const plantillasFound = await prisma.tareaPlantilla.findMany({
      where: { id_tarea_plantilla: { in: plantillas } },
      select: { id_tarea_plantilla: true, nombre: true },
    });

    const validPlantillaIds = new Set(plantillasFound.map((p) => p.id_tarea_plantilla));
    const missing = plantillas.filter((id) => !validPlantillaIds.has(id));
    if (missing.length) return res.status(400).json({ error: "Hay plantillas inválidas", missing });

    const data = [];
    for (const rut of ruts) {
      for (const pid of plantillas) {
        data.push({
          tareaPlantillaId: pid,
          rutCliente: rut,
          trabajadorId: tId,
          estado: EstadoTarea.PENDIENTE,
          fechaProgramada: fecha,
        });
      }
    }

    const created = await prisma.tareaAsignada.createMany({
      data,
      skipDuplicates: Boolean(skipDuplicates),
    });

    return res.json({
      ok: true,
      requested: data.length,
      created: created.count,
      skipped: data.length - created.count,
      trabajador,
      fechaProgramada: fecha.toISOString(),
    });
  } catch (e) {
    console.error("crearDesdePlantillaMasivo error:", e);
    return res.status(500).json({ error: "Error interno creando tareas masivas" });
  }
}

// =====================
// ✅ SAFE (tolerante + reprograma + debug)
// =====================
export async function crearDesdePlantillaMasivoSafe(req: Request, res: Response) {
  try {
    const body = req.body ?? {};

    const ruts = cleanStringArray((body as any).rutClientes);
    const plantillas = cleanNumberArray((body as any).plantillaIds);

    const tId = Number((body as any).trabajadorId);
    const fecha = asFlexibleDate((body as any).fechaProgramada);

    const skipDuplicates = String((body as any).skipDuplicates ?? "true").toLowerCase() !== "false";

    const debug = {
      got: {
        rutClientesType: Array.isArray((body as any).rutClientes) ? "array" : typeof (body as any).rutClientes,
        rutClientesLen: ruts.length,
        plantillaIdsType: Array.isArray((body as any).plantillaIds) ? "array" : typeof (body as any).plantillaIds,
        plantillaIdsLen: plantillas.length,
        trabajadorIdRaw: (body as any).trabajadorId,
        trabajadorIdNum: tId,
        fechaProgramadaRaw: (body as any).fechaProgramada,
        fechaProgramadaParsed: fecha ? fecha.toISOString() : null,
        skipDuplicates,
      },
    };

    if (!ruts.length) return res.status(400).json({ error: "rutClientes requerido", ...debug });
    if (!plantillas.length) return res.status(400).json({ error: "plantillaIds requerido", ...debug });
    if (!Number.isFinite(tId) || tId <= 0) return res.status(400).json({ error: "trabajadorId inválido", ...debug });
    if (!fecha) return res.status(400).json({ error: "fechaProgramada inválida", ...debug });

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: tId },
      select: { id_trabajador: true, nombre: true, email: true },
    });
    if (!trabajador) return res.status(404).json({ error: "Trabajador no existe", ...debug });

    const plantillasFound = await prisma.tareaPlantilla.findMany({
      where: { id_tarea_plantilla: { in: plantillas } },
      select: { id_tarea_plantilla: true, nombre: true },
    });

    const validPlantillaIds = new Set(plantillasFound.map((p) => p.id_tarea_plantilla));
    const missing = plantillas.filter((id) => !validPlantillaIds.has(id));
    if (missing.length) return res.status(400).json({ error: "Hay plantillas inválidas", missing, ...debug });

    const OPEN_STATES: EstadoTarea[] = [
      EstadoTarea.PENDIENTE,
      EstadoTarea.EN_PROCESO,
      EstadoTarea.VENCIDA,
    ];

    const requestedPairs = ruts.length * plantillas.length;

    const existingOpen = await prisma.tareaAsignada.findMany({
      where: {
        rutCliente: { in: ruts },
        tareaPlantillaId: { in: plantillas },
        estado: { in: OPEN_STATES },
      },
      select: {
        rutCliente: true,
        tareaPlantillaId: true,
      },
    });

    const openKey = new Set<string>();
    for (const e of existingOpen) {
      if (!e.rutCliente) continue;
      openKey.add(`${e.rutCliente}::${e.tareaPlantillaId}`);
    }

    const updateResult = await prisma.tareaAsignada.updateMany({
      where: {
        rutCliente: { in: ruts },
        tareaPlantillaId: { in: plantillas },
        estado: { in: OPEN_STATES },
      },
      data: {
        fechaProgramada: fecha,
        trabajadorId: tId,
      },
    });

    const updatedCount = updateResult.count;

    const createData: Array<{
      tareaPlantillaId: number;
      rutCliente: string;
      trabajadorId: number;
      estado: EstadoTarea;
      fechaProgramada: Date;
    }> = [];

    for (const rut of ruts) {
      for (const pid of plantillas) {
        if (openKey.has(`${rut}::${pid}`)) continue;
        createData.push({
          tareaPlantillaId: pid,
          rutCliente: rut,
          trabajadorId: tId,
          estado: EstadoTarea.PENDIENTE,
          fechaProgramada: fecha,
        });
      }
    }

    const created = createData.length
      ? await prisma.tareaAsignada.createMany({
          data: createData,
          skipDuplicates,
        })
      : { count: 0 };

    return res.json({
      mensaje: "Tareas procesadas correctamente",
      resumen: {
        total_pares: requestedPairs,
        tareas_reprogramadas: updatedCount,
        tareas_creadas: created.count,
      },
      responsable: trabajador.nombre,
      fecha_programada: fecha.toISOString().split("T")[0],
      debug,
    });
  } catch (e) {
    console.error("crearDesdePlantillaMasivoSafe error:", e);
    return res.status(500).json({ error: "Error interno procesando tareas masivas (SAFE)" });
  }
}

// =====================
// ✅ NUEVO: Reasignar cliente a trabajador + recalcular codigoCartera + mover tareas
// Endpoint sugerido:
// POST /tareas/masivo/reasignar-cliente
//
// body:
// {
//   "rutCliente": "78.163.795-5",
//   "agenteId": 4,
//   "moveAllTasks": false,         // opcional: por defecto false (solo abiertas)
//   "includeVencida": true         // opcional: por defecto true
// }
// =====================
export async function reasignarClienteYTransferirTareas(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const rutCliente = String((body as any).rutCliente ?? "").trim();
    const agenteId = Number((body as any).agenteId);
    const moveAllTasks = String((body as any).moveAllTasks ?? "false").toLowerCase() === "true";
    const includeVencida = String((body as any).includeVencida ?? "true").toLowerCase() !== "false";

    const debug = {
      got: {
        rutCliente,
        agenteIdRaw: (body as any).agenteId,
        agenteIdNum: agenteId,
        moveAllTasks,
        includeVencida,
      },
    };

    if (!rutCliente) return res.status(400).json({ error: "rutCliente requerido", ...debug });
    if (!Number.isFinite(agenteId) || agenteId <= 0)
      return res.status(400).json({ error: "agenteId inválido", ...debug });

    const agente = await ensureTrabajadorExists(agenteId);
    if (!agente) return res.status(404).json({ error: "Trabajador no existe", ...debug });

    const cliente = await prisma.cliente.findUnique({
      where: { rut: rutCliente },
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        agenteId: true,
        codigoCartera: true,
        activo: true,
      },
    });

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado", ...debug });
    if (cliente.activo === false) return res.status(400).json({ error: "Cliente está inactivo", ...debug });

    const codigoCartera = await getCodigoCarteraFromAgente(agenteId);

    const OPEN_STATES: EstadoTarea[] = includeVencida
      ? [EstadoTarea.PENDIENTE, EstadoTarea.EN_PROCESO, EstadoTarea.VENCIDA]
      : [EstadoTarea.PENDIENTE, EstadoTarea.EN_PROCESO];

    const txResult = await prisma.$transaction(async (tx) => {
      // 1) Update cliente (agenteId + codigoCartera)
      const updatedCliente = await tx.cliente.update({
        where: { rut: rutCliente },
        data: {
          agenteId,
          codigoCartera,
        },
        select: {
          id: true,
          rut: true,
          razonSocial: true,
          agenteId: true,
          codigoCartera: true,
          updatedAt: true,
        },
      });

      // 2) Move tareas
      const whereTareas: any = { rutCliente };
      if (!moveAllTasks) whereTareas.estado = { in: OPEN_STATES };

      const moved = await tx.tareaAsignada.updateMany({
        where: whereTareas,
        data: { trabajadorId: agenteId },
      });

      return { updatedCliente, movedCount: moved.count };
    });

    return res.json({
      mensaje: "Cliente reasignado y tareas transferidas",
      cliente: {
        rut: txResult.updatedCliente.rut,
        razonSocial: txResult.updatedCliente.razonSocial,
        agenteId: txResult.updatedCliente.agenteId,
        codigoCartera: txResult.updatedCliente.codigoCartera,
      },
      tareas: {
        movidas: txResult.movedCount,
        regla: moveAllTasks ? "todas" : `abiertas(${OPEN_STATES.join(",")})`,
      },
      debug,
    });
  } catch (e) {
    console.error("reasignarClienteYTransferirTareas error:", e);
    return res.status(500).json({ error: "Error interno reasignando cliente y moviendo tareas" });
  }
}