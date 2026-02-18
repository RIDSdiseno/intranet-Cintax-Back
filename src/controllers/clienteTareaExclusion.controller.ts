import type { Request, Response } from "express";
import { PrismaClient, EstadoTarea } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/clientes/:rut/exclusiones-tareas
 */
export const listExclusionesTareaCliente = async (req: Request, res: Response) => {
  try {
    const rut = String(req.params.rut || "").trim();
    if (!rut) return res.status(400).json({ error: "Falta rut" });

    const rows = await prisma.clienteTareaExclusion.findMany({
      where: { rutCliente: rut },
      orderBy: [{ activa: "desc" }, { updatedAt: "desc" }],
    });

    return res.json(rows);
  } catch (err) {
    console.error("listExclusionesTareaCliente error:", err);
    return res.status(500).json({ error: "Error interno listando exclusiones" });
  }
};

/**
 * POST /api/clientes/:rut/exclusiones-tareas
 * body: { tareaPlantillaId: number, motivo?: string, cancelarPendientes?: boolean }
 *
 * Default: cancelarPendientes = true (marca NO_APLICA lo pendiente/en proceso/vencida)
 */
export const excluirTareaParaCliente = async (req: Request, res: Response) => {
  try {
    const rut = String(req.params.rut || "").trim();
    const { tareaPlantillaId, motivo, cancelarPendientes } = req.body as {
      tareaPlantillaId?: number;
      motivo?: string;
      cancelarPendientes?: boolean;
    };

    if (!rut) return res.status(400).json({ error: "Falta rut" });
    const tplId = Number(tareaPlantillaId);
    if (!tplId || Number.isNaN(tplId)) {
      return res.status(400).json({ error: "tareaPlantillaId inválido" });
    }

    const motivoLimpio = motivo?.trim() || null;

    // Upsert exclusión activa
    const exclusion = await prisma.clienteTareaExclusion.upsert({
      where: {
        rutCliente_tareaPlantillaId: { rutCliente: rut, tareaPlantillaId: tplId },
      },
      create: {
        rutCliente: rut,
        tareaPlantillaId: tplId,
        activa: true,
        motivo: motivoLimpio,
        // ✅ Prisma te lo exige como required
        updatedAt: new Date(),
      },
      update: {
        activa: true,
        motivo: motivoLimpio,
        // ✅ para mantener updatedAt consistente en update
        updatedAt: new Date(),
      },
    });

    const doCancel = cancelarPendientes !== false; // default true

    let updatedCount = 0;
    if (doCancel) {
      const upd = await prisma.tareaAsignada.updateMany({
        where: {
          rutCliente: rut,
          tareaPlantillaId: tplId,
          estado: {
            in: [EstadoTarea.PENDIENTE, EstadoTarea.EN_PROCESO, EstadoTarea.VENCIDA],
          },
        },
        data: {
          estado: EstadoTarea.NO_APLICA,
          comentarios: `NO_APLICA: tarea excluida para este cliente. ${
            motivoLimpio ? `Motivo: ${motivoLimpio}` : ""
          }`.trim(),
        },
      });
      updatedCount = upd.count;
    }

    return res.json({
      message: "Exclusión aplicada",
      exclusion,
      canceladas: updatedCount,
    });
  } catch (err) {
    console.error("excluirTareaParaCliente error:", err);
    return res.status(500).json({ error: "Error interno aplicando exclusión" });
  }
};

/**
 * DELETE /api/clientes/:rut/exclusiones-tareas/:tareaPlantillaId
 * Reactiva (deja activa=false). NO revive tareas NO_APLICA antiguas.
 */
export const reactivarTareaParaCliente = async (req: Request, res: Response) => {
  try {
    const rut = String(req.params.rut || "").trim();
    const tplId = Number(req.params.tareaPlantillaId);

    if (!rut) return res.status(400).json({ error: "Falta rut" });
    if (!tplId || Number.isNaN(tplId)) {
      return res.status(400).json({ error: "tareaPlantillaId inválido" });
    }

    const updated = await prisma.clienteTareaExclusion.update({
      where: {
        rutCliente_tareaPlantillaId: { rutCliente: rut, tareaPlantillaId: tplId },
      },
      data: {
        activa: false,
        // ✅ si tu modelo requiere updatedAt siempre
        updatedAt: new Date(),
      },
    });

    return res.json({ message: "Exclusión desactivada", exclusion: updated });
  } catch (err: any) {
    console.error("reactivarTareaParaCliente error:", err);
    // Si no existe, responde 404 “limpio”
    if (String(err?.code) === "P2025") {
      return res
        .status(404)
        .json({ error: "No existe exclusión para ese cliente/tarea" });
    }
    return res.status(500).json({ error: "Error interno reactivando" });
  }
};
