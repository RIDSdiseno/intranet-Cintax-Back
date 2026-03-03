"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const TicketsController = __importStar(require("../controllers/tickets.controller"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});
/** Helper: evita "argument handler must be a function" en producción */
function mustBeFn(name) {
    const fn = TicketsController[name];
    if (typeof fn !== "function") {
        // Importante: NO revienta el server, solo deja log para que sepas qué falta
        console.warn(`[tickets.routes] Handler faltante o no es function: ${String(name)}`);
        // handler dummy para que Express no rompa al registrar rutas
        return (_req, res) => res.status(501).json({ ok: false, error: `Endpoint no implementado: ${String(name)}` });
    }
    return fn;
}
/* ----------------------------- */
/* Core (UI TicketsPage)         */
/* ----------------------------- */
// Tabs / grupos (para TicketsTabs + total)
router.get("/groups", auth_middleware_1.authGuard, mustBeFn("getGroups"));
// Agentes (para filtros y reasignación) -> DEBE IR ANTES QUE "/:id"
router.get("/agents/list", auth_middleware_1.authGuard, mustBeFn("getTicketAgents"));
/* ----------------------------- */
/* Admin tools (UI TicketsPage)  */
/* ----------------------------- */
// Diagnóstico inbox -> DEBE IR ANTES QUE "/:id"
router.get("/admin/inbox-diagnostic", auth_middleware_1.authGuard, mustBeFn("getInboxDiagnostic"));
// Sincronizar correos -> tickets
router.post("/admin/sync", auth_middleware_1.authGuard, mustBeFn("syncTickets"));
/* ----------------------------- */
/* Tickets list/detail/update    */
/* ----------------------------- */
// Listado (para TicketsTable + filtros)
router.get("/", auth_middleware_1.authGuard, mustBeFn("listTickets"));
// Detalle (para TicketDetailPage)
router.get("/:id", auth_middleware_1.authGuard, mustBeFn("getTicketById"));
// Update propiedades (estado/prioridad/tags/agente/areaDetected/etc)
router.put("/:id", auth_middleware_1.authGuard, mustBeFn("updateTicket"));
/* ----------------------------- */
/* Thread / messages / events    */
/* ----------------------------- */
// Thread
router.get("/:id/messages", auth_middleware_1.authGuard, mustBeFn("getTicketMessages"));
// Crear mensaje (reply / note / forward) + adjuntos
router.post("/:id/messages", auth_middleware_1.authGuard, upload.array("attachments", 10), mustBeFn("createTicketMessage"));
// Eventos
router.get("/:id/events", auth_middleware_1.authGuard, mustBeFn("getTicketEvents"));
/* ----------------------------- */
/* Email endpoints (legacy/op1)  */
/* ----------------------------- */
// Crear ticket enviando email (CC actor, Reply-To soporte)
router.post("/email", auth_middleware_1.authGuard, upload.array("attachments", 10), mustBeFn("createEmailTicket"));
// Responder un ticket por email
router.post("/:ticketId/reply-email", auth_middleware_1.authGuard, upload.array("attachments", 10), mustBeFn("replyTicketByEmail"));
exports.default = router;
//# sourceMappingURL=tickets.routes.js.map