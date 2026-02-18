"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// Rutas hijas
const auth_route_1 = __importDefault(require("./routes/auth.route"));
const google_route_1 = __importDefault(require("./routes/google.route"));
const cliente_routes_1 = __importDefault(require("./routes/cliente.routes"));
const tickets_routes_1 = __importDefault(require("./routes/tickets.routes"));
const mailbox_routes_1 = __importDefault(require("./routes/mailbox.routes"));
const router = (0, express_1.Router)();
// =============================
//  HEALTHCHECK
// =============================
router.get("/health", (_req, res) => res.json({ ok: true, service: "API Movil", ts: Date.now() }));
// =============================
//  AUTH
// =============================
router.use("/auth", auth_route_1.default);
// =============================
//  GOOGLE DRIVE
// =============================
router.use("/drive", google_route_1.default);
// =============================
//  CLIENTES
// =============================
router.use("/clientes", cliente_routes_1.default);
// =============================
//  TICKETS (incluye /email)
// =============================
router.use("/tickets", tickets_routes_1.default);
// =============================
//  MAILBOX (lectura Gmail)
// =============================
router.use("/mailbox", mailbox_routes_1.default);
exports.default = router;
