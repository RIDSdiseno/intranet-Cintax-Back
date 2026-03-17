// src/controllers/clienteBitacora.controller.ts
import type { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { message: string; code?: string };
};

type AuthUser = {
  id: number;
  nombre: string;
  email: string;
  role: "ADMIN" | "SUPERVISOR" | "AGENTE";
  agenteId?: number | null;
  isSupervisorOrAdmin?: boolean;
  isAdmin?: boolean;
};

function ok<T>(res: Response, data: T, status = 200) {
  const body: ApiResponse<T> = { ok: true, data };
  return res.status(status).json(body);
}

function fail(res: Response, status: number, message: string, code?: string) {
  const body: ApiResponse<null> = { ok: false, error: { message, code } };
  return res.status(status).json(body);
}

function mustUser(req: Request): AuthUser {
  const u = (req as any).user as AuthUser | undefined;
  if (!u) throw Object.assign(new Error("No autenticado"), { status: 401 });
  return u;
}

function isPrivileged(u: AuthUser) {
  return (
    u.role === "ADMIN" ||
    u.role === "SUPERVISOR" ||
    u.isSupervisorOrAdmin === true ||
    u.isAdmin === true
  );
}

function parseId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Acepta YYYY-MM-DD o ISO */
function parseDate(input?: string) {
  if (!input) return new Date();

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error("Fecha inválida"), { status: 400 });
  }

  return parsed;
}

function normalizeNullableTitle(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const s = String(value).trim();
  return s || null;
}

/**
 * Verifica acceso al cliente:
 * - ADMIN/SUPERVISOR: acceso total
 * - AGENTE: solo si el cliente está asignado a él
 */
async function canAccessCliente(user: AuthUser, clienteId: number) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      rut: true,
      razonSocial: true,
      alias: true,
      activo: true,
      agenteId: true,
      codigoCartera: true,
    },
  });

  if (!cliente) {
    return {
      ok: false as const,
      status: 404,
      message: "Cliente no encontrado.",
    };
  }

  if (isPrivileged(user)) {
    return { ok: true as const, cliente };
  }

  if (cliente.agenteId !== user.id) {
    return {
      ok: false as const,
      status: 403,
      message: "No autorizado para acceder a este cliente.",
    };
  }

  return { ok: true as const, cliente };
}

/**
 * POST /api/clientes/:id/bitacoras
 * body: {
 *   titulo?: string | null,
 *   contenido: string,
 *   fechaGestion?: string
 * }
 */
export async function createClienteBitacora(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = mustUser(req);
    const clienteId = parseId(req.params.id);

    if (!clienteId) return fail(res, 400, "clienteId inválido.");

    const access = await canAccessCliente(user, clienteId);
    if (!access.ok) return fail(res, access.status, access.message);

    const { titulo, contenido, fechaGestion } = req.body ?? {};

    if (typeof contenido !== "string" || !contenido.trim()) {
      return fail(res, 400, "El campo 'contenido' es obligatorio.");
    }

    const created = await prisma.bitacoraCliente.create({
      data: {
        clienteId,
        trabajadorId: user.id,
        titulo: normalizeNullableTitle(titulo) ?? null,
        contenido: contenido.trim(),
        fechaGestion: parseDate(
          typeof fechaGestion === "string" ? fechaGestion : undefined
        ),
      },
      include: {
        cliente: {
          select: {
            id: true,
            rut: true,
            razonSocial: true,
            alias: true,
            activo: true,
            agenteId: true,
            codigoCartera: true,
          },
        },
        trabajador: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
            areaInterna: true,
            isSupervisor: true,
          },
        },
      },
    });

    return ok(res, created, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/clientes/:id/bitacoras?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 */
export async function listClienteBitacoras(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = mustUser(req);
    const clienteId = parseId(req.params.id);

    if (!clienteId) return fail(res, 400, "clienteId inválido.");

    const access = await canAccessCliente(user, clienteId);
    if (!access.ok) return fail(res, access.status, access.message);

    const desde =
      typeof req.query.desde === "string"
        ? startOfDayLocal(parseDate(req.query.desde))
        : undefined;

    const hasta =
      typeof req.query.hasta === "string"
        ? endOfDayLocal(parseDate(req.query.hasta))
        : undefined;

    const where: any = { clienteId };

    if (desde || hasta) {
      where.fechaGestion = {};
      if (desde) where.fechaGestion.gte = desde;
      if (hasta) where.fechaGestion.lte = hasta;
    }

    const rows = await prisma.bitacoraCliente.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            rut: true,
            razonSocial: true,
            alias: true,
            activo: true,
            agenteId: true,
            codigoCartera: true,
          },
        },
        trabajador: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
            areaInterna: true,
            isSupervisor: true,
          },
        },
      },
      orderBy: [
        { fechaGestion: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
    });

    return ok(res, rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/clientes/bitacoras/:bitacoraId
 * dueño o ADMIN/SUPERVISOR
 */
export async function getClienteBitacoraById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = mustUser(req);
    const id = parseId(req.params.bitacoraId);

    if (!id) return fail(res, 400, "bitacoraId inválido.");

    const row = await prisma.bitacoraCliente.findUnique({
      where: { id },
      include: {
        cliente: {
          select: {
            id: true,
            rut: true,
            razonSocial: true,
            alias: true,
            activo: true,
            agenteId: true,
            codigoCartera: true,
          },
        },
        trabajador: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
            areaInterna: true,
            isSupervisor: true,
          },
        },
      },
    });

    if (!row) return fail(res, 404, "Bitácora no encontrada.");

    const owner = row.trabajadorId === user.id;

    if (!owner && !isPrivileged(user)) {
      const access = await canAccessCliente(user, row.clienteId);
      if (!access.ok) return fail(res, 403, "No autorizado.");
    }

    return ok(res, row);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/clientes/bitacoras/:bitacoraId
 * body: {
 *   titulo?: string | null,
 *   contenido?: string,
 *   fechaGestion?: string
 * }
 *
 * - AGENTE: solo sus propias bitácoras
 * - ADMIN/SUPERVISOR: cualquiera
 */
export async function updateClienteBitacoraById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = mustUser(req);
    const id = parseId(req.params.bitacoraId);

    if (!id) return fail(res, 400, "bitacoraId inválido.");

    const row = await prisma.bitacoraCliente.findUnique({
      where: { id },
      include: {
        cliente: {
          select: {
            id: true,
            agenteId: true,
          },
        },
      },
    });

    if (!row) return fail(res, 404, "Bitácora no encontrada.");

    const owner = row.trabajadorId === user.id;

    if (!owner && !isPrivileged(user)) {
      return fail(res, 403, "No autorizado.");
    }

    const { titulo, contenido, fechaGestion } = req.body ?? {};
    const data: any = {};

    if (titulo !== undefined) {
      data.titulo = normalizeNullableTitle(titulo) ?? null;
    }

    if (contenido !== undefined) {
      if (typeof contenido !== "string" || !contenido.trim()) {
        return fail(res, 400, "El campo 'contenido' no puede quedar vacío.");
      }
      data.contenido = contenido.trim();
    }

    if (fechaGestion !== undefined) {
      if (fechaGestion === null || fechaGestion === "") {
        return fail(res, 400, "fechaGestion inválida.");
      }
      data.fechaGestion = parseDate(String(fechaGestion));
    }

    if (!("titulo" in data) && !("contenido" in data) && !("fechaGestion" in data)) {
      return fail(res, 400, "Nada para actualizar.");
    }

    const updated = await prisma.bitacoraCliente.update({
      where: { id },
      data,
      include: {
        cliente: {
          select: {
            id: true,
            rut: true,
            razonSocial: true,
            alias: true,
            activo: true,
            agenteId: true,
            codigoCartera: true,
          },
        },
        trabajador: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
            areaInterna: true,
            isSupervisor: true,
          },
        },
      },
    });

    return ok(res, updated);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/clientes/bitacoras/:bitacoraId
 * - AGENTE: solo su propia bitácora
 * - ADMIN/SUPERVISOR: cualquiera
 */
export async function deleteClienteBitacoraById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = mustUser(req);
    const id = parseId(req.params.bitacoraId);

    if (!id) return fail(res, 400, "bitacoraId inválido.");

    const row = await prisma.bitacoraCliente.findUnique({
      where: { id },
    });

    if (!row) return fail(res, 404, "Bitácora no encontrada.");

    const owner = row.trabajadorId === user.id;

    if (!owner && !isPrivileged(user)) {
      return fail(res, 403, "No autorizado.");
    }

    await prisma.bitacoraCliente.delete({
      where: { id },
    });

    return ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function listClienteBitacorasEquipo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = mustUser(req);

    if (!isPrivileged(user)) {
      return fail(res, 403, "No autorizado.");
    }

    const desde =
      typeof req.query.desde === "string"
        ? startOfDayLocal(parseDate(req.query.desde))
        : undefined;

    const hasta =
      typeof req.query.hasta === "string"
        ? endOfDayLocal(parseDate(req.query.hasta))
        : undefined;

    const trabajadorId =
      typeof req.query.trabajadorId === "string"
        ? parseId(req.query.trabajadorId)
        : undefined;

    const clienteId =
      typeof req.query.clienteId === "string"
        ? parseId(req.query.clienteId)
        : undefined;

    if (req.query.trabajadorId !== undefined && !trabajadorId) {
      return fail(res, 400, "trabajadorId inválido.");
    }

    if (req.query.clienteId !== undefined && !clienteId) {
      return fail(res, 400, "clienteId inválido.");
    }

    const where: any = {};

    if (typeof trabajadorId === "number") {
      where.trabajadorId = trabajadorId;
    }

    if (typeof clienteId === "number") {
      where.clienteId = clienteId;
    }

    if (desde || hasta) {
      where.fechaGestion = {};
      if (desde) where.fechaGestion.gte = desde;
      if (hasta) where.fechaGestion.lte = hasta;
    }

    const rows = await prisma.bitacoraCliente.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            rut: true,
            razonSocial: true,
            alias: true,
            activo: true,
            agenteId: true,
            codigoCartera: true,
          },
        },
        trabajador: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
            areaInterna: true,
            isSupervisor: true,
          },
        },
      },
      orderBy: [
        { fechaGestion: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
    });

    return ok(res, rows);
  } catch (err) {
    next(err);
  }
}