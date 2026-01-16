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
    process.exit(1);
}
/**
 * Middleware principal para proteger rutas con Access Token.
 * - Requiere header: Authorization: Bearer <token>
 * - Valida firma y expiración del token
 * - Inyecta `req.user` y `req.token`
 */
const authGuard = (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No autenticado (falta token)" });
    }
    const token = authHeader.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // ✅ hardening mínimo: si no viene role, lo normalizamos a AGENTE
        if (!payload.role) {
            payload.role = "AGENTE";
        }
        // ✅ también puedes recalcular flags aquí si quieres consistencia
        payload.isAdmin = payload.role === "ADMIN";
        payload.isSupervisorOrAdmin =
            payload.role === "ADMIN" || payload.role === "SUPERVISOR";
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
 * Requiere que el usuario logueado sea supervisor o admin
 * Úsalo DESPUÉS de `authGuard`.
 */
const requireSupervisorOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }
    const ok = req.user.role === "ADMIN" ||
        req.user.role === "SUPERVISOR" ||
        req.user.isSupervisorOrAdmin === true;
    if (!ok) {
        return res.status(403).json({
            error: "No tienes permisos para acceder a esta sección (solo supervisores/admin)",
        });
    }
    return next();
};
exports.requireSupervisorOrAdmin = requireSupervisorOrAdmin;
