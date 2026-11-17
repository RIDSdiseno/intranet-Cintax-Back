"use strict";
// src/lib/roles.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPERVISOR_OR_ADMIN_EMAILS = void 0;
exports.isSupervisorOrAdminForTrabajador = isSupervisorOrAdminForTrabajador;
exports.informesEmails = informesEmails;
exports.puedeVerInformes = puedeVerInformes;
// Correos que consideramos Admin / Supervisor
exports.SUPERVISOR_OR_ADMIN_EMAILS = new Set([
    "administrador@cintax.cl",
    "bgarrido@cintax.cl", // Beatriz - RRHH-Supervisor
    "jortiz@cintax.cl", // Jaime  - CONTA-Supervisor
    "eramos@cintax.cl", // Esteban - Admin-Agente
    "fromero@cintax.cl", // Francisco - Admin-Agente
    "jnavarro@cintax.cl" // Jorge - Admin-Agente
    // Agrega aquí más correos si aparecen nuevos supervisores/admin
].map((e) => e.toLowerCase()));
/**
 * Determina si un trabajador es supervisor/admin, usando:
 * - Lista de correos “privilegiados”
 * - O el nombre del área interna que contenga ADMIN o SUPERVISOR
 */
function isSupervisorOrAdminForTrabajador(opts) {
    const emailNorm = opts.email.toLowerCase();
    if (exports.SUPERVISOR_OR_ADMIN_EMAILS.has(emailNorm))
        return true;
    if (opts.areaInterna) {
        const area = opts.areaInterna.toUpperCase();
        if (area.includes("ADMIN") || area.includes("SUPERVISOR")) {
            return true;
        }
    }
    return false;
}
/**
 * Quien puede ver los informes semanales.
 *
 * Es una lista aparte de SUPERVISOR_OR_ADMIN_EMAILS a proposito: ese set da
 * acceso a media intranet, y los informes son solo para el administrador y una
 * segunda persona autorizada. Mezclarlos abriria los informes a seis personas.
 *
 * Se configura con la variable INFORMES_EMAILS del .env, separada por comas:
 *
 *   INFORMES_EMAILS=administrador@cintax.cl,jortiz@cintax.cl
 *
 * Sin la variable queda solo el administrador. Agregar a alguien es editar el
 * .env y reiniciar: no hay que tocar codigo ni base de datos.
 *
 * Se lee en cada llamada, no al importar el modulo, porque el orden de los
 * imports no garantiza que dotenv ya haya corrido cuando este archivo se carga.
 */
function informesEmails() {
    const crudo = process.env.INFORMES_EMAILS || "administrador@cintax.cl";
    return new Set(crudo
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean));
}
/** True si el correo esta autorizado para ver informes semanales. */
function puedeVerInformes(email) {
    if (!email)
        return false;
    return informesEmails().has(email.trim().toLowerCase());
}
//# sourceMappingURL=roles.js.map