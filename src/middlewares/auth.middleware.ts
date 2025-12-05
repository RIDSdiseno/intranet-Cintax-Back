// src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";

export type AuthJwtPayload = {
  id: number;
  nombre: string;
  email: string;
  // Flag calculado en el login (Google / normal) según tus reglas de negocio
  isSupervisorOrAdmin?: boolean;
};

// Nunca uses "dev_secret" en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET no está definido en variables de entorno");
  process.exit(1); // Forzamos fallo al arrancar
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
      token?: string;
    }
  }
}

/**
 * Middleware principal para proteger rutas con Access Token.
 * - Requiere header: Authorization: Bearer <token>
 * - Valida firma y expiración del token
 * - Inyecta `req.user` (con todos los campos del payload, incl. roles) y `req.token`
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

  const token = authHeader.slice(7); // quitar "Bearer "

  try {
    // 👇 Aquí usamos AuthJwtPayload completo (incluye isSupervisorOrAdmin si venía en el token)
    const payload = jwt.verify(token, JWT_SECRET) as AuthJwtPayload;

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
 * Requiere que el usuario logueado sea supervisor o admin (según flag del token)
 * Úsalo DESPUÉS de `authGuard`.
 *
 * Ejemplo:
 *   router.get(
 *     "/tareas/supervision/resumen",
 *     authGuard,
 *     requireSupervisorOrAdmin,
 *     TareasController.getResumenSupervision
 *   );
 */
export const requireSupervisorOrAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (!req.user.isSupervisorOrAdmin) {
    return res.status(403).json({
      error: "No tienes permisos para acceder a esta sección (solo supervisores/admin)",
    });
  }

  return next();
};
