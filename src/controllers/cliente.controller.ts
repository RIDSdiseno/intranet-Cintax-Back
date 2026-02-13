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

function isPrivileged(req: Request): boolean {
  const role = (req as any).user?.role as "ADMIN" | "SUPERVISOR" | "AGENTE" | undefined;
  return role === "ADMIN" || role === "SUPERVISOR";
}

function isAdmin(req: Request): boolean {
  const role = (req as any).user?.role as "ADMIN" | "SUPERVISOR" | "AGENTE" | undefined;
  return role === "ADMIN";
}

async function ensureAgenteExists(agenteId: number) {
  // Ajusta el modelo si no se llama "trabajador"
  const agente = await prisma.trabajador.findUnique({
    where: { id_trabajador: agenteId },
    select: { id_trabajador: true, nombre: true, email: true, status: true },
  });

  if (!agente) return { ok: false as const, error: "Agente no existe" };
  if (!agente.status) return { ok: false as const, error: "Agente está inactivo" };

  return { ok: true as const, agente };
}

function asTrimmedString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function asNullableTrimmedString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined; // no viene => no tocar
  if (v === null) return null; // viene null => set null
  const s = String(v).trim();
  return s.length ? s : null; // viene "" => null
}

function parseNullableNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined; // no viene => no tocar
  if (v === null || v === "") return null; // viene vacío => null
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN; // marcador de inválido
  return n;
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
 *  - skip?: number        -> offset (para paginación)
 */
export const listClientes = async (req: Request, res: Response) => {
  try {
    const { search, cartera, agenteId, soloActivos, limit, skip } = req.query as {
      search?: string;
      cartera?: string;
      agenteId?: string;
      soloActivos?: string;
      limit?: string;
      skip?: string;
    };

    const where: Prisma.ClienteWhereInput = {};

    if (soloActivos === "true") where.activo = true;
    if (cartera && cartera.trim() !== "") where.codigoCartera = cartera.trim();

    if (agenteId) {
      const parsed = Number(agenteId);
      if (!Number.isNaN(parsed)) where.agenteId = parsed;
    }

    if (search && search.trim() !== "") {
      const q = search.trim();
      where.OR = [
        { rut: { contains: q, mode: "insensitive" } },
        { razonSocial: { contains: q, mode: "insensitive" } },
        { alias: { contains: q, mode: "insensitive" } },
      ];
    }

    const take =
      limit && !Number.isNaN(Number(limit)) ? Math.min(Number(limit), 1000) : 200;
    const sk = skip && !Number.isNaN(Number(skip)) ? Math.max(0, Number(skip)) : 0;

    const [clientes, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: [{ razonSocial: "asc" }, { rut: "asc" }],
        take,
        skip: sk,
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
      }),
      prisma.cliente.count({ where }),
    ]);

    return res.json({ items: clientes, total, take, skip: sk });
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
 *
 * ✅ Regla sugerida:
 * - ADMIN / SUPERVISOR: puede crear y asignar agenteId
 */
export const createCliente = async (req: Request, res: Response) => {
  try {
    if (!isPrivileged(req)) {
      return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
    }

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

    if (agenteId !== null) {
      const chk = await ensureAgenteExists(agenteId);
      if (!chk.ok) return res.status(400).json({ error: chk.error });
    }

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
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Cliente duplicado (unique constraint)" });
    }
    return res.status(500).json({ error: "Error interno creando cliente" });
  }
};

/**
 * PATCH /api/clientes/:id
 * body: { rut?, razonSocial?, alias?, codigoCartera?, agenteId?, activo? }
 *
 * ✅ Permisos:
 * - ADMIN/SUPERVISOR: puede editar todo (incluye agenteId)
 * - AGENTE: puede editar SOLO alias / codigoCartera (si quieres) y NO puede tocar agenteId ni activo.
 *
 * Ajusta la whitelist según tu regla real.
 */
export const updateCliente = async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const role = (req as any).user?.role as "ADMIN" | "SUPERVISOR" | "AGENTE" | undefined;

    const body = req.body as {
      rut?: string;
      razonSocial?: string;
      alias?: string | null;
      codigoCartera?: string | null;
      agenteId?: number | string | null;
      activo?: boolean;
    };

    const data: Prisma.ClienteUpdateInput = {};

    // ---- Campos "sensibles" (rut/razonSocial/activo/agenteId) ----
    const wantsRut = body.rut !== undefined;
    const wantsRazon = body.razonSocial !== undefined;
    const wantsActivo = body.activo !== undefined;
    const wantsAgenteId = body.agenteId !== undefined;

    const isPriv = isPrivileged(req);

    // Si es AGENTE, bloquea cambios sensibles (puedes ajustar esta regla)
    if (!isPriv && (wantsRut || wantsRazon || wantsActivo || wantsAgenteId)) {
      return res.status(403).json({
        error:
          "Sin permisos para modificar rut/razonSocial/activo/agenteId (solo admin/supervisor)",
      });
    }

    // rut
    if (wantsRut) {
      const rut = asTrimmedString(body.rut);
      if (!rut) return res.status(400).json({ error: "rut no puede ser vacío" });
      data.rut = rut;
    }

    // razonSocial
    if (wantsRazon) {
      const rs = asTrimmedString(body.razonSocial);
      if (!rs) return res.status(400).json({ error: "razonSocial no puede ser vacío" });
      data.razonSocial = rs;
    }

    // alias / codigoCartera (permitidos para todos por defecto)
    const alias = asNullableTrimmedString(body.alias);
    if (alias !== undefined) data.alias = alias;

    const codigoCartera = asNullableTrimmedString(body.codigoCartera);
    if (codigoCartera !== undefined) data.codigoCartera = codigoCartera;

    // agenteId (solo priv)
    if (wantsAgenteId) {
      if (!isPriv) {
        return res.status(403).json({ error: "Sin permisos para reasignar agente" });
      }

      const parsed = parseNullableNumber(body.agenteId);

      if (parsed === (NaN as any)) return res.status(400).json({ error: "agenteId inválido" });
      if (parsed === null) {
        data.agenteId = null;
      } else if (typeof parsed === "number") {
        const chk = await ensureAgenteExists(parsed);
        if (!chk.ok) return res.status(400).json({ error: chk.error });
        data.agenteId = parsed;
      }
    }

    // activo (solo priv)
    if (wantsActivo) {
      if (!isPriv) {
        return res
          .status(403)
          .json({ error: "Sin permisos para cambiar estado (solo admin/supervisor)" });
      }
      data.activo = Boolean(body.activo);
    }

    // nada que actualizar
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No hay campos válidos para actualizar" });
    }

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
    if (err?.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    if (err?.code === "P2002")
      return res.status(409).json({ error: "rut duplicado (unique constraint)" });
    return res.status(500).json({ error: "Error interno actualizando cliente" });
  }
};

/**
 * PATCH /api/clientes/:id/asignar-agente
 * body: { agenteId: number | null }
 *
 * ✅ endpoint explícito para reasignar (admin/supervisor)
 */
export const assignAgenteToCliente = async (req: Request, res: Response) => {
  try {
    if (!isPrivileged(req)) {
      return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
    }

    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const { agenteId } = req.body as { agenteId?: number | null };

    if (agenteId !== null && agenteId !== undefined) {
      if (typeof agenteId !== "number" || Number.isNaN(agenteId)) {
        return res.status(400).json({ error: "agenteId inválido" });
      }

      const chk = await ensureAgenteExists(agenteId);
      if (!chk.ok) return res.status(400).json({ error: chk.error });
    }

    // Si viene agenteId, tomamos su carpetaDriveCodigo como codigoCartera
    let codigoCartera: string | null = null;

    if (agenteId !== null && agenteId !== undefined) {
      const agente = await prisma.trabajador.findUnique({
        where: { id_trabajador: agenteId },
        select: { carpetaDriveCodigo: true },
      });

      if (!agente) return res.status(400).json({ error: "Agente no encontrado" });

      codigoCartera = agente.carpetaDriveCodigo ?? null;
    }

    const updated = await prisma.cliente.update({
      where: { id },
      data: {
        agenteId: agenteId ?? null,
        codigoCartera, // 👈 se asigna automático
      },
      select: {
        id: true,
        rut: true,
        razonSocial: true,
        alias: true,
        codigoCartera: true,
        agenteId: true,
        activo: true,
        updatedAt: true,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("assignAgenteToCliente error:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(500).json({ error: "Error interno reasignando agente" });
  }
};


/**
 * PATCH /api/clientes/reasignar-masivo
 * body: { clienteIds: number[], agenteId: number | null }
 *
 * ✅ reasignación masiva (admin/supervisor)
 */
export const bulkAssignAgente = async (req: Request, res: Response) => {
  try {
    if (!isPrivileged(req)) {
      return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
    }

    const { clienteIds, agenteId } = req.body as {
      clienteIds?: number[];
      agenteId?: number | null;
    };

    if (!Array.isArray(clienteIds) || clienteIds.length === 0) {
      return res.status(400).json({ error: "clienteIds debe ser un array con elementos" });
    }

    const ids = clienteIds.map(Number).filter((n) => Number.isFinite(n));
    if (ids.length !== clienteIds.length) {
      return res.status(400).json({ error: "clienteIds contiene valores inválidos" });
    }

    if (agenteId !== null && agenteId !== undefined) {
      if (typeof agenteId !== "number" || Number.isNaN(agenteId)) {
        return res.status(400).json({ error: "agenteId inválido" });
      }
      const chk = await ensureAgenteExists(agenteId);
      if (!chk.ok) return res.status(400).json({ error: chk.error });
    }

    const result = await prisma.cliente.updateMany({
      where: { id: { in: ids } },
      data: { agenteId: agenteId ?? null },
    });

    return res.json({ updatedCount: result.count });
  } catch (err) {
    console.error("bulkAssignAgente error:", err);
    return res.status(500).json({ error: "Error interno reasignando masivo" });
  }
};

/**
 * DELETE /api/clientes/:id
 * (Hard delete)
 *
 * ✅ Solo ADMIN
 */
export const deleteCliente = async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Solo ADMIN puede eliminar clientes" });
    }

    const id = parseIdParam(req);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    await prisma.cliente.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("deleteCliente error:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(500).json({ error: "Error interno eliminando cliente" });
  }
};

/**
 * PATCH /api/clientes/:id/estado
 * body: { activo: boolean }
 *
 * ✅ admin/supervisor
 */
export const setClienteActivo = async (req: Request, res: Response) => {
  try {
    if (!isPrivileged(req)) {
      return res.status(403).json({ error: "Sin permisos (solo admin/supervisor)" });
    }

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
        updatedAt: true,
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("setClienteActivo error:", err);
    if (err?.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(500).json({ error: "Error interno cambiando estado" });
  }
};
