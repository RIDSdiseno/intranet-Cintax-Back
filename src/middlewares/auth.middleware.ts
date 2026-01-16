// src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";

export type Role = "ADMIN" | "SUPERVISOR" | "AGENTE";

export type AuthJwtPayload = {
  id: number;
  nombre: string;
  email: string;

  // ✅ lo que tu app necesita para permisos
  role: Role;

  // opcionales útiles (si los usas)
  agenteId?: number | null;

  // flags calculados en login
  isSupervisorOrAdmin?: boolean;
  isAdmin?: boolean;
};

// Nunca uses "dev_secret" en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET no está definido en variables de entorno");
  process.exit(1);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload; // ✅ ahora incluye role
      token?: string;
    }
  }
}

/**
 * Middleware principal para proteger rutas con Access Token.
 * - Requiere header: Authorization: Bearer <token>
 * - Valida firma y expiración del token
 * - Inyecta `req.user` y `req.token`
 */
export const authGuard: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado (falta token)" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthJwtPayload;

    // ✅ hardening mínimo: si no viene role, lo normalizamos a AGENTE
    if (!payload.role) {
      payload.role = "AGENTE";
    }

    // ✅ también puedes recalcular flags aquí si quieres consistencia
    payload.isAdmin = payload.role === "ADMIN";
    payload.isSupervisorOrAdmin =
      payload.role === "ADMIN" || payload.role === "SUPERVISOR";

    req.user = payload;
    req.token = token;

    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res
        .status(401)
        .json({ error: "Sesión expirada, refresca el token" });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: "Token inválido" });
    }
    return res.status(401).json({ error: "No autorizado" });
  }
};

/**
 * Middleware extra:
 * Requiere que el usuario logueado sea supervisor o admin
 * Úsalo DESPUÉS de `authGuard`.
 */
export const requireSupervisorOrAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const ok =
    req.user.role === "ADMIN" ||
    req.user.role === "SUPERVISOR" ||
    req.user.isSupervisorOrAdmin === true;

  if (!ok) {
    return res.status(403).json({
      error: "No tienes permisos para acceder a esta sección (solo supervisores/admin)",
    });
  }

  return next();
};
