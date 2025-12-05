// src/middlewares/supervision.middleware.ts
import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../controllers/tareas.Controller";
import {
  isSupervisorOrAdminEmail,
  isAdminEmail,
  isSupervisorEmail,
} from "../config/supervision.config";

export const requireSupervisorOrAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  if (!user?.id) {
    return res.status(401).json({ message: "No autorizado" });
  }

  // 👇 asegúrate de que en tu JWT estés guardando el email de Google
  const email = (user as any).email as string | undefined;

  if (!isSupervisorOrAdminEmail(email)) {
    return res.status(403).json({
      message: "Solo supervisores o administradores pueden acceder",
    });
  }

  return next();
};

// (opcional) helpers por si los quieres usar en otros controllers
export const markUserSupervisionFlags = (user: any) => {
  const email = user?.email as string | undefined;
  return {
    ...user,
    esAdmin: isAdminEmail(email),
    esSupervisor: isSupervisorEmail(email),
    esSupervisorOAdmin: isSupervisorOrAdminEmail(email),
  };
};
