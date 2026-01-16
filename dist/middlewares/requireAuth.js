"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || "cambiar_esto_en_prod";
const requireAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Token no proporcionado" });
        }
        const token = authHeader.split(" ")[1];
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded; // ✅ calza con la definición global
        req.token = token; // ✅ si tu global también define token
        return next();
    }
    catch (error) {
        console.error("[requireAuth] error:", error);
        return res.status(401).json({ message: "Token inválido o expirado" });
    }
};
exports.requireAuth = requireAuth;
