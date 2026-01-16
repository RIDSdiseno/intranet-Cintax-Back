// src/middlewares/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

type Role = "ADMIN" | "SUPERVISOR" | "AGENTE";

export type AuthJwtPayload = {
  id: number;
  nombre: string;
  email: string;
  role: Role;                 // ✅ obligatorio para calzar con express.d.ts
  agenteId?: number | null;
  isSupervisorOrAdmin?: boolean;
  isAdmin?: boolean;
};

const JWT_SECRET = process.env.JWT_SECRET || "cambiar_esto_en_prod";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token no proporcionado" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET) as AuthJwtPayload;

    req.user = decoded; // ✅ calza con la definición global
    req.token = token;  // ✅ si tu global también define token

    return next();
  } catch (error) {
    console.error("[requireAuth] error:", error);
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
