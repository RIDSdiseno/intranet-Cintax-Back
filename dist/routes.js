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
const tickets_routes_1 = __importDefault(require("./modules/tickets/tickets.routes"));
// import mailboxRoutes from "./routes/mailbox.routes"; // ver MAILBOX, mas abajo
const bitacora_routes_1 = __importDefault(require("./routes/bitacora.routes"));
const tareas_routes_1 = __importDefault(require("./routes/tareas.routes"));
const asistente_routes_1 = __importDefault(require("./modules/asistente/asistente.routes"));
const informes_routes_1 = __importDefault(require("./modules/informes/informes.routes"));
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
//  MAILBOX (lectura Gmail) — DESMONTADO
// =============================
// Webmail crudo de la casilla de soporte, anterior a la ticketera: listar
// hilos, abrir uno y responder por correo. Lo reemplazo `/api/tickets`, que
// hace lo mismo pero creando tickets de verdad.
//
// Se desmonto el 2026-11-13 despues de comprobar que no lo llama nadie: cero
// referencias en todo el front, y en el backend solo se importaban entre
// ellos mismos. Queda comentado y no borrado para poder volver atras con dos
// lineas si apareciera algun consumidor externo (un script, Postman) que el
// codigo no deja ver.
//
// Ojo si se revive: `GET /threads/:id` acepta `?markRead=true`, que marca el
// hilo como leido en la casilla real de la empresa y no se revierte. Por
// defecto no lo hace, igual que la sincronizacion de tickets.
//
// router.use("/mailbox", mailboxRoutes);
//=============================
//  BITACORA
// =============================
router.use("/bitacoras", bitacora_routes_1.default);
//==============================
//  TAREAS
//==============================
router.use("/tareas", tareas_routes_1.default);
//==============================
//  ASISTENTE (Claude)
//==============================
router.use("/asistente", asistente_routes_1.default);
//==============================
//  INFORMES SEMANALES
//==============================
router.use("/informes", informes_routes_1.default);
exports.default = router;
//# sourceMappingURL=routes.js.map