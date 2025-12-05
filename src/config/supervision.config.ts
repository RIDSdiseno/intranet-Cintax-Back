// src/config/supervision.config.ts

// 🔹 Admins (tienen acceso total a supervisión)
export const ADMIN_EMAILS = [
  "administrador@cintax.cl",                 // Administrador Cintax (no usa tickets, pero sí puede supervisar)
  "eramos@cintax.cl",                        // Esteban Ramos – ADMIN-CONTA-RRHH-TRIB-COMERCIAL
  "fromero@cintax.cl",                       // Francisco Romero – ADMIN-CONTA-RRHH-TRIB-COMERCIAL
  "jnavarro@cintax.cl",                      // Jorge Navarro – ADMIN-CONTA-RRHH-TRIB-COMERCIAL
];

// 🔹 Supervisores (pueden supervisar, aunque también sean agentes)
export const SUPERVISOR_EMAILS = [
  "bgarrido@cintax.cl",                      // Beatriz Garrido – RRHH-Supervisor
  "jortiz@cintax.cl",                        // Jaime Ortiz – CONTA-Supervisor
];

// Helper para normalizar
const normalize = (email?: string | null) =>
  (email || "").trim().toLowerCase();

export const isAdminEmail = (email?: string | null) =>
  ADMIN_EMAILS.map(normalize).includes(normalize(email));

export const isSupervisorEmail = (email?: string | null) =>
  SUPERVISOR_EMAILS.map(normalize).includes(normalize(email));

export const isSupervisorOrAdminEmail = (email?: string | null) =>
  isAdminEmail(email) || isSupervisorEmail(email);
