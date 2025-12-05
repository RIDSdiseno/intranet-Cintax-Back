// src/middlewares/requireAuth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthJwtPayload {
  id: number;
  nombre: string;
  email: string;
  // agrega aquí lo que realmente lleve tu token (rol, etc.)
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "cambiar_esto_en_prod";

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token no proporcionado" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET) as AuthJwtPayload;

    req.user = decoded;

    next();
  } catch (error) {
    console.error("[requireAuth] error:", error);
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
