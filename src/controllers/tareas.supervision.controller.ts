import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import type { AuthJwtPayload } from "../middlewares/auth.middleware";

export interface AuthRequest extends Request {
  user?: AuthJwtPayload;
}

type EstadoPermitido = "PENDIENTE" | "EN_PROCESO" | "VENCIDA";

function parsePositiveNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseString(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s ? s : null;
}

function parseArrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))
  );
}

function buildFechaFiltro(anio: number | null, mes: number | null) {
  if (anio != null && mes != null) {
    return {
      gte: new Date(anio, mes - 1, 1),
      lt: new Date(anio, mes, 1),
    };
  }

  if (anio != null) {
    return {
      gte: new Date(anio, 0, 1),
      lt: new Date(anio + 1, 0, 1),
    };
  }

  return undefined;
}

export const getTareasPorPlantillaSupervision = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const tareaPlantillaId = parsePositiveNumber(req.params.idPlantilla);
    const trabajadorId = parsePositiveNumber(req.query.trabajadorId);
    const rutCliente = parseString(req.query.rutCliente);
    const anio =
      req.query.anio == null || req.query.anio === ""
        ? null
        : Number(req.query.anio);
    const mes =
      req.query.mes == null || req.query.mes === ""
        ? null
        : Number(req.query.mes);

    if (!tareaPlantillaId) {
      return res.status(400).json({ message: "idPlantilla inválido" });
    }

    if (anio != null && (!Number.isFinite(anio) || anio < 2000 || anio > 3000)) {
      return res.status(400).json({ message: "anio inválido" });
    }

    if (mes != null && (!Number.isFinite(mes) || mes < 1 || mes > 12)) {
      return res.status(400).json({ message: "mes inválido" });
    }

    const fechaFiltro = buildFechaFiltro(anio, mes);

    const where: any = {
      tareaPlantillaId,
    };

    if (trabajadorId != null) {
      where.trabajadorId = trabajadorId;
    }

    if (rutCliente) {
      where.rutCliente = rutCliente;
    }

    if (fechaFiltro) {
      where.fechaProgramada = fechaFiltro;
    }

    const tareas = await prisma.tareaAsignada.findMany({
      where,
      include: {
        tareaPlantilla: {
          select: {
            id_tarea_plantilla: true,
            nombre: true,
            codigoDocumento: true,
            area: true,
          },
        },
        asignado: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: [
        { trabajadorId: "asc" },
        { rutCliente: "asc" },
        { fechaProgramada: "asc" },
        { id_tarea_asignada: "asc" },
      ],
    });

    return res.json({
      message: "Tareas por plantilla obtenidas correctamente",
      filtrosAplicados: {
        tareaPlantillaId,
        trabajadorId,
        rutCliente,
        anio,
        mes,
      },
      count: tareas.length,
      tareas,
    });
  } catch (error) {
    console.error("[getTareasPorPlantillaSupervision] error:", error);
    return res.status(500).json({
      message: "Error obteniendo tareas por plantilla",
    });
  }
};

export const completarTareasComoSupervisor = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const supervisor = await prisma.trabajador.findUnique({
      where: { id_trabajador: req.user.id },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        isSupervisor: true,
      },
    });

    if (!supervisor) {
      return res.status(401).json({ message: "Usuario no válido" });
    }

    if (!supervisor.isSupervisor) {
      return res.status(403).json({
        message: "Solo los supervisores pueden completar tareas con este endpoint",
      });
    }

    const body = (req.body ?? {}) as {
      tareaIds?: number[];
      trabajadorId?: number | string | null;
      rutCliente?: string | null;
      rutClientes?: string[];
      tareaPlantillaId?: number | string | null;
      anio?: number | string | null;
      mes?: number | string | null;
      comentario?: string | null;
      incluirVencidas?: boolean;
      incluirPendientes?: boolean;
      incluirEnProceso?: boolean;
      fechaComplecion?: string | null;
    };

    const tareaIds = Array.isArray(body.tareaIds)
      ? Array.from(
          new Set(
            body.tareaIds
              .map((x) => Number(x))
              .filter((x) => Number.isFinite(x) && x > 0)
          )
        )
      : [];

    const trabajadorId = parsePositiveNumber(body.trabajadorId);
    const tareaPlantillaId = parsePositiveNumber(body.tareaPlantillaId);
    const rutCliente = parseString(body.rutCliente);
    const rutClientes = parseArrayStrings(body.rutClientes);

    const anio =
      body.anio == null || body.anio === "" ? null : Number(body.anio);
    const mes =
      body.mes == null || body.mes === "" ? null : Number(body.mes);

    const comentario = String(body.comentario ?? "").trim();
    const incluirPendientes = body.incluirPendientes !== false;
    const incluirEnProceso = body.incluirEnProceso !== false;
    const incluirVencidas = body.incluirVencidas !== false;

    const estadosObjetivo: EstadoPermitido[] = [];
    if (incluirPendientes) estadosObjetivo.push("PENDIENTE");
    if (incluirEnProceso) estadosObjetivo.push("EN_PROCESO");
    if (incluirVencidas) estadosObjetivo.push("VENCIDA");

    if (estadosObjetivo.length === 0) {
      return res.status(400).json({
        message: "Debes incluir al menos un estado objetivo para completar",
      });
    }

    if (body.trabajadorId != null && body.trabajadorId !== "" && !trabajadorId) {
      return res.status(400).json({ message: "trabajadorId inválido" });
    }

    if (
      body.tareaPlantillaId != null &&
      body.tareaPlantillaId !== "" &&
      !tareaPlantillaId
    ) {
      return res.status(400).json({ message: "tareaPlantillaId inválido" });
    }

    if (anio != null && (!Number.isFinite(anio) || anio < 2000 || anio > 3000)) {
      return res.status(400).json({ message: "anio inválido" });
    }

    if (mes != null && (!Number.isFinite(mes) || mes < 1 || mes > 12)) {
      return res.status(400).json({ message: "mes inválido" });
    }

    if (
      tareaIds.length === 0 &&
      trabajadorId == null &&
      tareaPlantillaId == null
    ) {
      return res.status(400).json({
        message:
          "Debes enviar tareaIds, trabajadorId o tareaPlantillaId para identificar qué tareas completar",
      });
    }

    const fechaFiltro = buildFechaFiltro(anio, mes);

    const fechaCierre =
      body.fechaComplecion &&
      !Number.isNaN(new Date(body.fechaComplecion).getTime())
        ? new Date(body.fechaComplecion)
        : new Date();

    const where: any = {
      estado: { in: estadosObjetivo },
    };

    if (tareaIds.length > 0) {
      where.id_tarea_asignada = { in: tareaIds };
    } else {
      if (trabajadorId != null) {
        where.trabajadorId = trabajadorId;
      }

      if (tareaPlantillaId != null) {
        where.tareaPlantillaId = tareaPlantillaId;
      }

      if (rutClientes.length > 0) {
        where.rutCliente = { in: rutClientes };
      } else if (rutCliente) {
        where.rutCliente = rutCliente;
      }

      if (fechaFiltro) {
        where.fechaProgramada = fechaFiltro;
      }
    }

    const tareasObjetivo = await prisma.tareaAsignada.findMany({
      where,
      include: {
        tareaPlantilla: {
          select: {
            id_tarea_plantilla: true,
            nombre: true,
            codigoDocumento: true,
            area: true,
          },
        },
        asignado: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: [
        { trabajadorId: "asc" },
        { rutCliente: "asc" },
        { fechaProgramada: "asc" },
        { id_tarea_asignada: "asc" },
      ],
    });

    if (tareasObjetivo.length === 0) {
      return res.status(404).json({
        message: "No se encontraron tareas pendientes para completar",
        count: 0,
      });
    }

    const comentarioSupervisorBase = comentario
      ? `${comentario} | Cerrada por supervisor: ${supervisor.nombre}`
      : `Cerrada por supervisor: ${supervisor.nombre}`;

    const ids = tareasObjetivo.map((t) => t.id_tarea_asignada);

    await prisma.$transaction(async (tx) => {
      for (const tarea of tareasObjetivo) {
        const comentarioFinal = tarea.comentarios
          ? `${tarea.comentarios}\n${comentarioSupervisorBase}`
          : comentarioSupervisorBase;

        await tx.tareaAsignada.update({
          where: { id_tarea_asignada: tarea.id_tarea_asignada },
          data: {
            estado: "COMPLETADA",
            fechaComplecion: fechaCierre,
            comentarios: comentarioFinal,
          },
        });
      }
    });

    const actualizadas = await prisma.tareaAsignada.findMany({
      where: { id_tarea_asignada: { in: ids } },
      include: {
        tareaPlantilla: {
          select: {
            id_tarea_plantilla: true,
            nombre: true,
            codigoDocumento: true,
            area: true,
          },
        },
        asignado: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: [
        { trabajadorId: "asc" },
        { rutCliente: "asc" },
        { fechaProgramada: "asc" },
        { id_tarea_asignada: "asc" },
      ],
    });

    return res.json({
      message: "Tareas completadas correctamente por supervisor",
      count: actualizadas.length,
      supervisor: {
        id_trabajador: supervisor.id_trabajador,
        nombre: supervisor.nombre,
        email: supervisor.email,
      },
      filtrosAplicados: {
        tareaIds,
        trabajadorId,
        tareaPlantillaId,
        rutCliente,
        rutClientes,
        anio,
        mes,
        estadosObjetivo,
      },
      tareas: actualizadas,
    });
  } catch (error) {
    console.error("[completarTareasComoSupervisor] error:", error);
    return res.status(500).json({
      message: "Error completando tareas como supervisor",
    });
  }
};