"use strict";
// src/modules/informes/informes.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generar = exports.detalle = exports.listar = exports.soloInformes = void 0;
const anthropic_1 = require("../../lib/anthropic");
const roles_1 = require("../../lib/roles");
const informes_service_1 = require("./informes.service");
/**
 * Deja pasar solo a los correos autorizados para informes.
 *
 * Importante: NO se fia del JWT. El token trae un flag `puedeVerInformes`,
 * pero ese flag existe solo para que el front decida si dibuja el menu. Aca se
 * vuelve a calcular desde el correo y la lista del .env, porque el JWT lo
 * firmamos nosotros pero igual viaja por el cliente, y porque si alguien sale
 * de la lista su token viejo seguiria diciendo que si.
 *
 * Usar DESPUES de authGuard.
 */
const soloInformes = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ ok: false, error: "No autenticado" });
    }
    if (!(0, roles_1.puedeVerInformes)(req.user.email)) {
        return res.status(403).json({
            ok: false,
            error: "No tienes acceso a los informes semanales",
        });
    }
    return next();
};
exports.soloInformes = soloInformes;
/** GET /api/informes -> las semanas que ya tienen informe. */
const listar = async (_req, res) => {
    try {
        const informes = await (0, informes_service_1.listarInformes)();
        return res.json({ ok: true, data: { informes } });
    }
    catch (err) {
        console.error("[informes] listar error:", err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.listar = listar;
/** GET /api/informes/:semana -> un informe completo. */
const detalle = async (req, res) => {
    try {
        const informe = await (0, informes_service_1.obtenerInforme)(String(req.params.semana ?? ""));
        if (!informe) {
            return res
                .status(404)
                .json({ ok: false, error: "Ese periodo todavia no tiene informe" });
        }
        return res.json({ ok: true, data: { informe } });
    }
    catch (err) {
        console.error("[informes] detalle error:", err);
        return res.status(500).json({ ok: false, error: "Error interno" });
    }
};
exports.detalle = detalle;
/**
 * POST /api/informes/generar
 *
 * Body, en orden de prioridad:
 *   { desde: "2026-11-28", hasta: "2026-12-05" }  -> periodo libre
 *   { semana: "2026-W46" }                        -> semana ISO
 *   { }                                           -> la semana en curso
 *
 * Genera y guarda. Reemplaza al informe que ese periodo ya tuviera **del
 * mismo origen**: como aca `generadoAuto` es siempre `false`, pisa al manual
 * anterior y deja intacto el del cron. Ver `claveDeRango` en `datos.ts`.
 */
const generar = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ ok: false, error: "No autenticado" });
    }
    const body = (req.body ?? {});
    try {
        const informe = await (0, informes_service_1.generarInforme)({
            semana: typeof body.semana === "string" ? body.semana : null,
            // Van sin validar: el servicio las interpreta y devuelve el motivo
            // exacto si no sirven. Comprobarlas aca tambien seria tener dos
            // versiones de la misma regla que pueden separarse.
            desde: body.desde,
            hasta: body.hasta,
            generadoPor: req.user.id,
            generadoAuto: false,
        });
        return res.json({ ok: true, data: { informe } });
    }
    catch (err) {
        if (err instanceof informes_service_1.SemanaInvalidaError) {
            return res.status(400).json({
                ok: false,
                error: "Semana invalida. Usa el formato 2026-W46.",
            });
        }
        // El mensaje viene del servicio y ya explica que pasa con estas fechas
        // concretas ("el periodo no puede pasar de 92 dias, y este tiene 140").
        if (err instanceof informes_service_1.RangoInvalidoError) {
            return res.status(400).json({ ok: false, error: err.message });
        }
        if (err instanceof informes_service_1.InformeEnCursoError) {
            return res.status(409).json({
                ok: false,
                error: "Ese informe ya se esta generando. Espera unos segundos.",
            });
        }
        // Cubre "no configurada", pero tambien sin credito, saturado y credencial
        // invalida: los informes gastan de la misma cuenta que el asistente, asi
        // que se quedan sin credito el mismo dia. Antes todo eso caia en el
        // "No se pudo generar el informe" de abajo, que no dice donde mirar.
        const conocido = (0, anthropic_1.mensajeDeErrorIA)(err);
        if (conocido) {
            console.warn("[informes] generar:", conocido);
            return res.status(503).json({ ok: false, error: conocido });
        }
        console.error("[informes] generar error:", err);
        return res
            .status(500)
            .json({ ok: false, error: "No se pudo generar el informe" });
    }
};
exports.generar = generar;
//# sourceMappingURL=informes.controller.js.map