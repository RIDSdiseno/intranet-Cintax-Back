"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSupervisorOrAdmin = exports.authGuard = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
require("dotenv/config");
// Nunca uses "dev_secret" en producción
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET no está definido en variables de entorno");
    process.exit(1); // Forzamos fallo al arrancar
}
/**
 * Middleware principal para proteger rutas con Access Token.
 * - Requiere header: Authorization: Bearer <token>
 * - Valida firma y expiración del token
 * - Inyecta `req.user` (con todos los campos del payload, incl. roles) y `req.token`
 */
const authGuard = (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No autenticado (falta token)" });
    }
    const token = authHeader.slice(7); // quitar "Bearer "
    try {
        // 👇 Aquí usamos AuthJwtPayload completo (incluye isSupervisorOrAdmin si venía en el token)
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = payload;
        req.token = token;
        return next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res
                .status(401)
                .json({ error: "Sesión expirada, refresca el token" });
        }
        if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ error: "Token inválido" });
        }
        return res.status(401).json({ error: "No autorizado" });
    }
};
exports.authGuard = authGuard;
/**
 * Middleware extra:
 * Requiere que el usuario logueado sea supervisor o admin (según flag del token)
 * Úsalo DESPUÉS de `authGuard`.
 *
 * Ejemplo:
 *   router.get(
 *     "/tareas/supervision/resumen",
 *     authGuard,
 *     requireSupervisorOrAdmin,
 *     TareasController.getResumenSupervision
 *   );
 */
const requireSupervisorOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }
    if (!req.user.isSupervisorOrAdmin) {
        return res.status(403).json({
            error: "No tienes permisos para acceder a esta sección (solo supervisores/admin)",
        });
    }
    return next();
};
exports.requireSupervisorOrAdmin = requireSupervisorOrAdmin;
