// src/controllers/cliente.controller.ts
import type { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Helpers
 */
function parseIdParam(req: Request): number | null {
  const raw = req.params.id;
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) return null;
  return id;
}

/**
 * GET /api/clientes
 *
 * Query params:
 *  - search?: string      -> busca por rut o razón social
 *  - cartera?: string     -> filtra por codigoCartera (ej: "CONTA/A01")
 *  - agenteId?: number    -> filtra por id del ejecutivo
 *  - soloActivos?: "true" -> solo clientes activos
 *  - limit?: number       -> máximo de registros (default 200)
 */
export const listClientes = async (req: Request, res: Response) => {
  try {
    const { search, cartera, agenteId, soloActivos, limit } = req.query as {
      search?: string;
      cartera?: string;
      agenteId?: string;
      soloActivos?: string;
      limit?: string;
    };

    const where: Prisma.ClienteWhereInput = {};

    if (soloActivos === "true") where.activo = true;

    if (cartera && cartera.trim() !== "") {
      where.codigoCartera = cartera.trim();
    }

    if (agenteId) {
      const parsed = Number(agenteId);
      if (!Number.isNaN(parsed)) where.agenteId = parsed;
    }

    if (search && search.trim() !== "") {
      const q = search.trim();
      where.OR = [
        { rut: { contains: q, mode: "insensitive" } },
        { razonSocial: { contains: q, mode: "insensitive" } },
      ];
    }

    const take = limit && !Number.isNaN(Number(limit)) ? Number(limit) : 200;

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: [{ razonSocial: "asc" }, { rut: "asc" }],
      take,
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        alias: true,
        codigoCartera: true,
        agenteId: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // ✅ devolvemos array directo
    return res.json(clientes);
  } catch (err) {
    console.error("listClientes error:", err);
    return res.status(500).json({ error: "Error interno listando clientes" });
  }
};

/**
 * GET /api/clientes/:id
 */
export const getClienteById = async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        alias: true,
        codigoCartera: true,
        agenteId: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
    return res.json(cliente);
  } catch (err) {
    console.error("getClienteById error:", err);
    return res.status(500).json({ error: "Error interno obteniendo cliente" });
  }
};

/**
 * POST /api/clientes
 * body: { rut, razonSocial, alias?, codigoCartera?, agenteId?, activo? }
 */
export const createCliente = async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      rut?: string;
      razonSocial?: string;
      alias?: string | null;
      codigoCartera?: string | null;
      agenteId?: number | string | null;
      activo?: boolean;
    };

    const rut = (body.rut ?? "").trim();
    const razonSocial = (body.razonSocial ?? "").trim();

    if (!rut || !razonSocial) {
      return res.status(400).json({ error: "rut y razonSocial son obligatorios" });
    }

    const agenteId =
      body.agenteId === null || body.agenteId === undefined || body.agenteId === ""
        ? null
        : Number(body.agenteId);

    if (agenteId !== null && Number.isNaN(agenteId)) {
      return res.status(400).json({ error: "agenteId inválido" });
    }

    // Si rut es unique en BD, esto te protege de duplicados por carrera
    const exists = await prisma.cliente.findFirst({ where: { rut } });
    if (exists) return res.status(409).json({ error: "Ya existe un cliente con ese RUT" });

    const created = await prisma.cliente.create({
      data: {
        rut,
        razonSocial,
        alias: body.alias ?? null,
        codigoCartera: body.codigoCartera ?? null,
        agenteId,
        activo: body.activo ?? true,
      },
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        alias: true,
        codigoCartera: true,
        agenteId: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error("createCliente error:", err);

    // Prisma unique violation
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Cliente duplicado (unique constraint)" });
    }

    return res.status(500).json({ error: "Error interno creando cliente" });
  }
};

/**
 * PATCH /api/clientes/:id
 * body: { rut?, razonSocial?, alias?, codigoCartera?, agenteId?, activo? }
 */
export const updateCliente = async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const body = req.body as {
      rut?: string;
      razonSocial?: string;
      alias?: string | null;
      codigoCartera?: string | null;
      agenteId?: number | string | null;
      activo?: boolean;
    };

    // armar data parcial
    const data: Prisma.ClienteUpdateInput = {};

    if (body.rut !== undefined) {
      const rut = String(body.rut).trim();
      if (!rut) return res.status(400).json({ error: "rut no puede ser vacío" });
      data.rut = rut;
    }

    if (body.razonSocial !== undefined) {
      const rs = String(body.razonSocial).trim();
      if (!rs) return res.status(400).json({ error: "razonSocial no puede ser vacío" });
      data.razonSocial = rs;
    }

    if (body.alias !== undefined) data.alias = body.alias ?? null;
    if (body.codigoCartera !== undefined) data.codigoCartera = body.codigoCartera ?? null;

    if (body.agenteId !== undefined) {
      if (body.agenteId === null || body.agenteId === "") {
        data.agenteId = null;
      } else {
        const parsed = Number(body.agenteId);
        if (Number.isNaN(parsed)) return res.status(400).json({ error: "agenteId inválido" });
        data.agenteId = parsed;
      }
    }

    if (body.activo !== undefined) data.activo = Boolean(body.activo);

    const updated = await prisma.cliente.update({
      where: { id },
      data,
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        alias: true,
        codigoCartera: true,
        agenteId: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("updateCliente error:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "rut duplicado (unique constraint)" });
    }

    return res.status(500).json({ error: "Error interno actualizando cliente" });
  }
};

/**
 * DELETE /api/clientes/:id
 * (Hard delete. Si prefieres soft delete, usa setClienteActivo)
 */
export const deleteCliente = async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    await prisma.cliente.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("deleteCliente error:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    return res.status(500).json({ error: "Error interno eliminando cliente" });
  }
};

/**
 * PATCH /api/clientes/:id/estado
 * body: { activo: boolean }
 */
export const setClienteActivo = async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const { activo } = req.body as { activo?: boolean };

    if (typeof activo !== "boolean") {
      return res.status(400).json({ error: "activo debe ser boolean" });
    }

    const updated = await prisma.cliente.update({
      where: { id },
      data: { activo },
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        alias: true,
        codigoCartera: true,
        agenteId: true,
        activo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("setClienteActivo error:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    return res.status(500).json({ error: "Error interno cambiando estado" });
  }
};
