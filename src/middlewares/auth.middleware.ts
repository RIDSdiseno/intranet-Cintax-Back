// src/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";

export type Role = "ADMIN" | "SUPERVISOR" | "AGENTE";

export type AuthJwtPayload = {
  id: number;
  nombre: string;
  email: string;

  // lo que tu app necesita para permisos
  role: Role;

  // opcionales útiles (si los usas)
  agenteId?: number | null;

  // flags calculados en login
  isSupervisorOrAdmin?: boolean;
  isAdmin?: boolean;

  /**
   * Solo para que el front decida si dibuja el menu de Informes.
   * El backend NO se fia de este flag: `soloInformes` vuelve a calcularlo
   * desde el correo y la lista del .env en cada request.
   */
  puedeVerInformes?: boolean;
};

/**
 * Si este usuario cuenta como supervisor o admin.
 *
 * Una sola definicion para dos usos distintos: el middleware de mas abajo,
 * que corta el paso, y los controladores que tienen que ramificar por dentro.
 * Esos existen porque hay endpoints que usa todo el mundo y donde el rol no
 * decide el acceso sino el alcance: en `actualizarEstado` un agente solo
 * puede tocar su propia tarea y un supervisor cualquiera.
 *
 * Copiar la condicion en cada controlador es como se desincronizan los
 * permisos: alguien cambia quien es supervisor en un sitio y quedan cinco
 * copias con la regla vieja.
 *
 * Acepta a los mismos que `SupervisorRoute` en el front (`AppRoutes.tsx`), y
 * eso es deliberado: si el backend fuera mas estricto habria pantallas que se
 * abren y despues fallan al pedir los datos.
 */
export function esSupervisorOAdmin(user?: {
  role?: Role;
  isSupervisorOrAdmin?: boolean;
}): boolean {
  if (!user) return false;

  return (
    user.role === "ADMIN" ||
    user.role === "SUPERVISOR" ||
    user.isSupervisorOrAdmin === true
  );
}

// Nunca uses "dev_secret" en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET no está definido en variables de entorno");
  process.exit(1);
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload; // ahora incluye role
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

    // hardening mínimo: si no viene role, lo normalizamos a AGENTE
    if (!payload.role) {
      payload.role = "AGENTE";
    }

    // también puedes recalcular flags aquí si quieres consistencia
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

  if (!esSupervisorOAdmin(req.user)) {
    return res.status(403).json({
      error: "No tienes permisos para acceder a esta sección (solo supervisores/admin)",
    });
  }

  return next();
};
