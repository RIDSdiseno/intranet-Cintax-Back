// src/controllers/bitacora.controller.ts
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

/** Normaliza fecha al inicio del día (hora local) */
function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Parse fecha YYYY-MM-DD o ISO; default hoy */
function parseDay(input?: string) {
  if (!input) return startOfDayLocal(new Date());

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, day] = input.split("-").map((n) => Number(n));
    const d = new Date(y, m - 1, day);
    return startOfDayLocal(d);
  }

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error("Fecha inválida"), { status: 400 });
  }
  return startOfDayLocal(d);
}

function isSameDayLocal(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Heurística simple: si contiene tags, lo tratamos como HTML */
function looksLikeHtml(s: string) {
  const t = (s || "").trim();
  if (!t) return false;
  return /<\/?[a-z][\s\S]*>/i.test(t);
}

function timeStampHHmm(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Append con marca de hora.
 * - Si es HTML: agrega un separador controlado (sin saltos gigantes) + <p><strong>[HH:mm]</strong> ...</p>
 * - Si es texto: agrega \n\n[HH:mm]\n...
 */
function appendWithTime(existing: string, incoming: string) {
  const base = (existing || "").trim();
  const add = (incoming || "").trim();
  if (!add) return base;

  const stamp = `[${timeStampHHmm()}]`;

  const baseIsHtml = looksLikeHtml(base);
  const addIsHtml = looksLikeHtml(add);

  // Si cualquiera es HTML, consolidamos a HTML
  if (baseIsHtml || addIsHtml) {
    const baseHtml = baseIsHtml ? base : `<p>${escapeHtml(base).replace(/\n/g, "<br/>")}</p>`;
    const addHtml = addIsHtml ? add : `<p>${escapeHtml(add).replace(/\n/g, "<br/>")}</p>`;

    // separador compacto (evita espacios excesivos)
    const separator = `<hr style="border:none;border-top:1px solid #eee;margin:10px 0;" />`;

    // marca de hora visible y clara
    const stamped = `<p><strong>${stamp}</strong></p>${addHtml}`;

    if (!baseHtml.trim()) return stamped;
    return `${baseHtml}${separator}${stamped}`;
  }

  // Texto plano
  if (!base) return `${stamp}\n${add}`;
  return `${base}\n\n${stamp}\n${add}`;
}

/** Escape básico por si convertimos texto->html */
function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * POST /api/bitacoras
 * body: { fecha?: string, titulo?: string|null, contenido: string, mode?: "append" | "replace" }
 *
 * - AGENTE: solo HOY (su bitácora)
 * - mode:
 *    - append (default): agrega al final con marca de hora
 *    - replace: reemplaza completo (corrección/edición)
 */
export async function upsertBitacora(req: Request, res: Response, next: NextFunction) {
  try {
    const user = mustUser(req);
    const { fecha, titulo, contenido, mode } = req.body ?? {};

    if (typeof contenido !== "string" || !contenido.trim()) {
      return fail(res, 400, "El campo 'contenido' es obligatorio.");
    }

    const day = parseDay(typeof fecha === "string" ? fecha : undefined);

    // AGENTE: solo HOY
    if (!isPrivileged(user)) {
      const today = startOfDayLocal(new Date());
      if (!isSameDayLocal(day, today)) {
        return fail(res, 403, "Solo puedes editar tu bitácora del día de hoy.");
      }
    }

    // permite null explícito para borrar título
    const safeTitulo =
      titulo === null ? null : typeof titulo === "string" ? (titulo.trim() || null) : null;

    const incoming = contenido.trim();

    const existing = await prisma.bitacoraDiaria.findUnique({
      where: {
        trabajadorId_fecha: {
          trabajadorId: user.id,
          fecha: day,
        },
      },
    });

    // no existe => crear (no agrega marca, porque es primera entrada)
    if (!existing) {
      const created = await prisma.bitacoraDiaria.create({
        data: {
          trabajadorId: user.id,
          fecha: day,
          titulo: safeTitulo,
          contenido: incoming,
        },
      });
      return ok(res, created, 201);
    }

    const writeMode = mode === "replace" ? "replace" : "append";

    const nextContenido =
      writeMode === "replace" ? incoming : appendWithTime(existing.contenido || "", incoming);

    const updated = await prisma.bitacoraDiaria.update({
      where: { id: existing.id },
      data: {
        ...(titulo !== undefined ? { titulo: safeTitulo } : {}),
        contenido: nextContenido,
        // updatedAt se actualiza solo si tu schema tiene @updatedAt
      },
    });

    return ok(res, updated, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bitacoras/mias?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 */
export async function listMisBitacoras(req: Request, res: Response, next: NextFunction) {
  try {
    const user = mustUser(req);

    const desde = typeof req.query.desde === "string" ? parseDay(req.query.desde) : undefined;
    const hasta = typeof req.query.hasta === "string" ? parseDay(req.query.hasta) : undefined;

    const where: any = { trabajadorId: user.id };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = desde;
      if (hasta) where.fecha.lte = hasta;
    }

    const rows = await prisma.bitacoraDiaria.findMany({
      where,
      orderBy: [{ fecha: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    });

    return ok(res, rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bitacoras?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&trabajadorId=123
 * (ADMIN/SUPERVISOR)
 */
export async function listBitacoras(req: Request, res: Response, next: NextFunction) {
  try {
    const user = mustUser(req);

    if (!isPrivileged(user)) {
      return fail(res, 403, "No autorizado.");
    }

    const desde = typeof req.query.desde === "string" ? parseDay(req.query.desde) : undefined;
    const hasta = typeof req.query.hasta === "string" ? parseDay(req.query.hasta) : undefined;

    const trabajadorId =
      typeof req.query.trabajadorId === "string" && req.query.trabajadorId.trim()
        ? Number(req.query.trabajadorId)
        : undefined;

    if (req.query.trabajadorId && Number.isNaN(trabajadorId)) {
      return fail(res, 400, "trabajadorId inválido.");
    }

    const where: any = {};
    if (trabajadorId) where.trabajadorId = trabajadorId;

    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = desde;
      if (hasta) where.fecha.lte = hasta;
    }

    const rows = await prisma.bitacoraDiaria.findMany({
      where,
      include: {
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
      orderBy: [{ fecha: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    });

    return ok(res, rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bitacoras/:id
 * (dueño o ADMIN/SUPERVISOR)
 */
export async function getBitacoraById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = mustUser(req);

    const id = Number(req.params.id);
    if (Number.isNaN(id)) return fail(res, 400, "id inválido.");

    const row = await prisma.bitacoraDiaria.findUnique({
      where: { id },
      include: {
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
      return fail(res, 403, "No autorizado.");
    }

    return ok(res, row);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/bitacoras/:id
 * (dueño o ADMIN/SUPERVISOR)
 * - AGENTE: solo HOY + suya
 * - mode: append/replace
 */
export async function updateBitacoraById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = mustUser(req);

    const id = Number(req.params.id);
    if (Number.isNaN(id)) return fail(res, 400, "id inválido.");

    const row = await prisma.bitacoraDiaria.findUnique({ where: { id } });
    if (!row) return fail(res, 404, "Bitácora no encontrada.");

    const owner = row.trabajadorId === user.id;

    if (!isPrivileged(user)) {
      if (!owner) return fail(res, 403, "No autorizado.");
      const today = startOfDayLocal(new Date());
      if (!isSameDayLocal(row.fecha, today)) {
        return fail(res, 403, "Solo puedes editar tu bitácora del día de hoy.");
      }
    }

    const { titulo, contenido, mode } = req.body ?? {};
    const data: any = {};

    if (titulo === null) data.titulo = null;
    if (typeof titulo === "string") data.titulo = titulo.trim() || null;

    if (typeof contenido === "string") {
      const c = contenido.trim();
      if (!c) return fail(res, 400, "El campo 'contenido' no puede quedar vacío.");

      const writeMode = mode === "replace" ? "replace" : "append";
      data.contenido = writeMode === "replace" ? c : appendWithTime(row.contenido || "", c);
    }

    if (!("titulo" in data) && !("contenido" in data)) {
      return fail(res, 400, "Nada para actualizar.");
    }

    const saved = await prisma.bitacoraDiaria.update({
      where: { id },
      data,
    });

    return ok(res, saved);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/bitacoras/:id
 * ✅ SOLO ADMIN/SUPERVISOR
 */
export async function deleteBitacoraById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = mustUser(req);

    if (!isPrivileged(user)) {
      return fail(
        res,
        403,
        "No autorizado. Solo administradores o supervisores pueden eliminar bitácoras."
      );
    }

    const id = Number(req.params.id);
    if (Number.isNaN(id)) return fail(res, 400, "id inválido.");

    const row = await prisma.bitacoraDiaria.findUnique({ where: { id } });
    if (!row) return fail(res, 404, "Bitácora no encontrada.");

    await prisma.bitacoraDiaria.delete({ where: { id } });
    return ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}