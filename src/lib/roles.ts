// src/lib/roles.ts

// 🧩 Correos que consideramos Admin / Supervisor
export const SUPERVISOR_OR_ADMIN_EMAILS = new Set(
  [
    "administrador@cintax.cl",
    "bgarrido@cintax.cl", // Beatriz - RRHH-Supervisor
    "jortiz@cintax.cl",  // Jaime  - CONTA-Supervisor
    "eramos@cintax.cl",  // Esteban - Admin-Agente
    "fromero@cintax.cl", // Francisco - Admin-Agente
    "jnavarro@cintax.cl" // Jorge - Admin-Agente
    // Agrega aquí más correos si aparecen nuevos supervisores/admin
  ].map((e) => e.toLowerCase())
);

/**
 * Determina si un trabajador es supervisor/admin, usando:
 * - Lista de correos “privilegiados”
 * - O el nombre del área interna que contenga ADMIN o SUPERVISOR
 */
export function isSupervisorOrAdminForTrabajador(opts: {
  email: string;
  areaInterna?: string | null;
}): boolean {
  const emailNorm = opts.email.toLowerCase();

  if (SUPERVISOR_OR_ADMIN_EMAILS.has(emailNorm)) return true;

  if (opts.areaInterna) {
    const area = opts.areaInterna.toUpperCase();
    if (area.includes("ADMIN") || area.includes("SUPERVISOR")) {
      return true;
    }
  }

  return false;
}
