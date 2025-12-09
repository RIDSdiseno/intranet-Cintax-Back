"use strict";
// src/config/supervision.config.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupervisorOrAdminEmail = exports.isSupervisorEmail = exports.isAdminEmail = exports.SUPERVISOR_EMAILS = exports.ADMIN_EMAILS = void 0;
// 🔹 Admins (tienen acceso total a supervisión)
exports.ADMIN_EMAILS = [
    "administrador@cintax.cl", // Administrador Cintax (no usa tickets, pero sí puede supervisar)
    "eramos@cintax.cl", // Esteban Ramos – ADMIN-CONTA-RRHH-TRIB-COMERCIAL
    "fromero@cintax.cl", // Francisco Romero – ADMIN-CONTA-RRHH-TRIB-COMERCIAL
    "jnavarro@cintax.cl", // Jorge Navarro – ADMIN-CONTA-RRHH-TRIB-COMERCIAL
];
// 🔹 Supervisores (pueden supervisar, aunque también sean agentes)
exports.SUPERVISOR_EMAILS = [
    "bgarrido@cintax.cl", // Beatriz Garrido – RRHH-Supervisor
    "jortiz@cintax.cl", // Jaime Ortiz – CONTA-Supervisor
];
// Helper para normalizar
const normalize = (email) => (email || "").trim().toLowerCase();
const isAdminEmail = (email) => exports.ADMIN_EMAILS.map(normalize).includes(normalize(email));
exports.isAdminEmail = isAdminEmail;
const isSupervisorEmail = (email) => exports.SUPERVISOR_EMAILS.map(normalize).includes(normalize(email));
exports.isSupervisorEmail = isSupervisorEmail;
const isSupervisorOrAdminEmail = (email) => (0, exports.isAdminEmail)(email) || (0, exports.isSupervisorEmail)(email);
exports.isSupervisorOrAdminEmail = isSupervisorOrAdminEmail;
