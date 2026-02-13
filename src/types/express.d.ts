// src/types/express.d.ts
import "express-serve-static-core";

export {};

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: number;
      nombre: string;
      email: string;

      // ✅ fuente de verdad para permisos
      role: "ADMIN" | "SUPERVISOR" | "AGENTE";

      // útiles para filtros / data-scope
      agenteId?: number | null;

      // ✅ flags opcionales (si los sigues metiendo en el token)
      isSupervisorOrAdmin?: boolean;
      isAdmin?: boolean;
    };
    token?: string;
    requestId?: string;
  }
}
